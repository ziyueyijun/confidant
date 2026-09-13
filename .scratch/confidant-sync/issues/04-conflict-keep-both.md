# 04: 冲突——保留双份

**What to build:** 两端都改了同一个笔记时，两个版本都留在磁盘上——本地那份保持不动，远端那份以 `笔记名 (冲突 来自远端 2026-09-14 15-30-12).md` 的形式落在同目录。冲突副本在文件树里带标记，同步摘要报出冲突数。冲突副本本身是普通笔记文件，会照常同步到远端，因此第二台机器也能看到这个冲突。

**不做自动三方合并**：自动合并需要额外保存每个文件的基准内容副本，而 Markdown 的自动合并对表格、代码块、front matter 都不可靠。升级路径保留——基准 hash 已在记录，将来补存内容即可。

规格依据：决议 20–23、55。

**Blocked by:** [03](03-incremental-change-detection.md)

**Status:** done

- [x] 两端都改且内容不同 → 本地版本保持不动，远端版本落成冲突副本
- [x] 冲突副本命名形如 `笔记名 (冲突 来自远端 年-月-日 时-分-秒).md`，时间戳用 `-` 分隔（`:` 在 Windows 文件名中非法）
- [x] 非 `.md` 文件（如图片）冲突时沿用同一模式并保留原扩展名
- [x] 冲突副本在文件树里带标记
- [x] 同步摘要在有冲突时报出冲突数
- [x] 冲突副本在下一次同步时被正常上传到远端
- [x] **两端内容均不丢失**：冲突后本地目录里能找到两个版本，远端上也能
- [x] 冲突判定的依据是「两侧内容都离开了基准版本」
- [x] 单测覆盖：仅本地改（不冲突） / 仅远端改（不冲突） / 两侧都改且内容相同（不冲突） / 两侧都改且内容不同（冲突）/ 同一文件连续两次冲突
- [x] `npm test` 全绿

## Answer

**收官 2026-09-14**（commit `c0d5300`，分支 `sync-04`，已并入 `feat/webdav-sync`）。

三件套实测：`npm run typecheck` 通过；`npm test` **365 用例 / 43 文件全过**（票 03 后 348/41，本票 +17）；`npm run lint:boundaries` 零违规（189 模块）。另跑 `npx electron-vite build` 三进程构建通过（渲染层首次 import `packages/sync` 入口点，确认未拉进 node 依赖）。

### 本票修掉一个真 bug（票 02 遗留）

原 `runResolveBoth` 用「探测到的远端变化 + hash≠本地」推断「远端也离开了基准」，**没有比较远端 hash 与基准**。当远端验证符/时间/大小失真（内容其实仍等于基准）**且**本地已改时，会**凭空造出一个基准版本的假冲突副本**。

现在严格按决议 21：`remoteLeftBase = remoteHash !== record.baseHash`，此情形归为「仅本地改」→ 上传。且该分支的 `If-Match` 用**本次观测到的**远端验证符（`record.etag` 已因失真而过时）。这正是票 03 反复强调的「别用验证符判内容」。

### 冲突判定（最终形态）

`engine.ts` 的 `runResolveBoth()`。有状态表时：

```
localChanged   = localHash !== record.baseHash
remoteChanged  = remoteEntryChanged(record, entry)   // 仅决定是否 GET
remoteLeftBase = remoteHash !== record.baseHash      // GET 之后
冲突 = localChanged && remoteLeftBase && remoteHash !== localHash
```

全部用 **hash**，验证符只做变化探测。无状态表时：同名且 `localHash !== remoteHash` → 冲突（决议 29）。

### 对票 02 裁决的复核结论：**维持「本地版本覆盖远端主名」**

复核未发现内容丢失路径。若改成「远端主名不动」，必须给主名选一个基准 hash，两条路都坏：

- **基准记本地**：下次同步 `localChanged=false`、远端验证符未变 → 判「无变化」，远端主名永远停在 R 而本地是 L，**分歧被静默冻结**；一旦远端 R 被编辑，`remoteHash≠localHash` 且 `!localChanged` → 走下载把本地 L 覆盖掉 → **L 丢失**（本地副本存的是 R）。
- **基准记远端**：收敛慢一拍，同步前第二台机器完全看不到 L，且远端同时有两份 R、没有 L。

**顺序安全**：`resolveConflict` 先写本地副本 → 再 `If-None-Match:*` 上传副本 → 最后才 `If-Match` 覆盖主名。副本上传失败会抛错，**主名覆盖不会执行**，远端 R 留在原位。覆盖主名从不发生在 R 已被安全保存之前。

### 界面

`src/renderer/src/sync/conflict-marker.ts`（纯函数 + 单测）+ `FileTree.tsx` 徽标渲染。按 `entry.name` 用 `isConflictCopyName` 识别（正则尾部锚定 + 校验完整时间戳），**不扩 `TreeEntry` 协议**，重启后仍在。徽标文案「冲突副本」，`title` 明确「原笔记未处于冲突状态」—— 只陈述副本身份，不暗示原笔记有冲突。色用 `--banner-bg`/`--banner-border`（三主题均有，与「文件缺失」横幅同族）。

`packages/sync/conflict.ts` 新增为**纯入口点**（命名/识别，不含 node 依赖），供渲染层直接 import。

### 未敢确认的假设

1. 渲染层直接 import `packages/sync/conflict` 而非经 `@shared/sync` 转出（避免 `shared → 包` 的值依赖）；若团队要求跨侧纯逻辑一律走 `@shared`，把 re-export 移过去即可。
2. 徽标色沿用「文件缺失」同族色，**未跑实机截图**确认观感。
3. 冲突副本识别是**宽松的文件名匹配**，用户手写同形文件名也会被标记；只用于展示，不参与任何同步决策。
4. 承接票 03 的已知边界：三信号全等而内容已变时无法探测，此形态下本地改动仍可能覆盖远端内容 —— 协议固有上限，归票 08 真机复核。
