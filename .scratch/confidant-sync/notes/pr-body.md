## 这是什么

实现 [`.scratch/confidant-sync/spec.md`](../blob/feat/webdav-sync/.scratch/confidant-sync/spec.md)（WebDAV 同步规格）的单一分支。

规格的 68 条决议由 [`.scratch/confidant-sync/issues/`](../tree/feat/webdav-sync/.scratch/confidant-sync/issues) 下的实施票落地。工作项以**本地 markdown** 跟踪，不使用 GitHub Issues——所以本 PR 不关联、也不关闭任何 GitHub issue，票的收官写回票文件本身（每票 `Status: done` + 尾部 `## Answer` 记实测结论与已知缺口）。

## 票与完成情况

```
01a ──┬─→ 02 ──→ 03 ──┬─→ 04 ─┐
01b ──┘               ├─→ 05 ─┤
                      ├─→ 06 ─┼─→ 08（人工验收，本 PR 不做）
                      └─→ 07 ─┘
```

| 票 | 内容 | 状态 |
|---|---|---|
| 01a | `packages/sync`（引擎 + 自研薄 WebDAV 客户端）+ `packages/webfake`（内存假服务端） | done |
| 01b | `safeStorage` 凭据、IPC、同步设置对话框、树类目界面侧 | done |
| 02 | 首次同步——保守合并，带进度与取消；主进程执行、传输层与自签证书 | done |
| 03 | 增量同步——变更探测判定矩阵 | done |
| 04 | 冲突——保留双份 | done |
| 05 | 删除传播与保护（回收站 / 熔断 / 列举闸门） | done |
| 06 | 边界与失败处理 | done |
| 07 | 启动探测与收尾提示 | done |
| **08** | **真机验收——绿联 NAS** | **未做，见下** |

原票 01 贴着上下文预算上限，动工前按「包 / 应用」这条缝拆成 01a 与 01b，依据见 [`00-split-note.md`](../blob/feat/webdav-sync/.scratch/confidant-sync/issues/00-split-note.md)。这不改变任何规格口径。

## ⚠️ 票 08 保持 open —— 这是人工验收入口

[票 08「真机验收——绿联 NAS」](../blob/feat/webdav-sync/.scratch/confidant-sync/issues/08-real-device-verification-ugreen-nas.md) **无法由 agent 完成**：

- 它需要**用户本人**的 NAS 地址与凭据；
- 清单里的「人工验收：用户本人在真实 NAS 上确认全流程可用」只能由人来判；
- 规格 Further Notes 的「待验证清单」（Nextcloud / 坚果云 / 群晖 / mod_dav / Alist / rclone serve）需要真账号逐项补验。

**本 PR 不包含、也没有编造任何真机验收结果。** 票 08 所需的环境变量驱动脚本已落地（复用仓库现有自检/冒烟模式），用户拿到账号即可直接跑。

## 质量门

`npm run typecheck`、`npm test`（**444 用例 / 51 文件**）、`npm run lint:boundaries` 全绿。每票收尾均跑过。

## 代码审查（两轴）与修复

`/code-review` 对 `master...HEAD` 跑了两轴，全部发现已在 `fix(sync): 代码审查修复…` 一并修掉：

**Standards 轴** —— 无硬违规；四条判断题（坏味道）全修：

- 硬排除名单 `isExcludedName` 两份实现 → sync 改用 `packages/files` 入口点的实现（决议 16 是不可关闭的不变量，两份漂移会让某文件「一边同步、另一边隐藏」）；
- 默认阈值/重试常量就地复制 → 下沉到 `lib/sync-types.ts`，与它们的类型同处；
- `SyncFatalError.kind` 裸字符串 → 联合类型 `SyncFatalKind`；
- `createClient` 的 `WebdavConfig` 参数是死的（引擎只能递空凭据、实现全部忽略）→ 收成零参，免得读者以为引擎掌握密码。

**Spec 轴** —— 三条实质问题，两条与「删用户的笔记」直接相关：

- **`testSyncConnection` 漏注入传输层** → 自签服务器的「测试连接」必失败，而这个按钮正是用户诊断配置的地方（决议 41、用户故事 3/7）。已补。
- **列举闸门只护根** → 子目录「列举静默为空」会让其中的文件被判成「远端已删」而进本地回收站，根闸门看不见它，仅靠熔断兜底（阈值以下就放过了）。已改为**逐目录**判定，并加 D2b 用例。
- **启动探测漏「远端删除」** → 圆点永不亮，用户在手动同步前毫无提示（决议 8、用户故事 15）。已补对称判定，并加 A4/A5 用例。
- 另修：「立即同步」菜单项在同步中未置灰（决议 12 字面）→ 已接 `MenuContext.syncRunning`。

两条新增的安全用例（A4、D2b）都做过**变异验证**：把对应守卫去掉，用例立即失败——证明它们在鉴别行为，不是顺路通过。

## 已知遗留（写在票里，不影响本 PR 转正）

- **真机未验证**：所有服务端行为（绿联、Nextcloud、Apache 压缩后的验证符形态）都依据规格 Further Notes 的二手记录构造 —— 归票 08。
- **协议固有上限**：验证符、修改时间、大小三者全等而内容已变时无法探测（Nextcloud「同一秒内覆盖且验证符不变」的极端形态）。要覆盖它只能每次都 GET，增量也就无从谈起。归票 08 复核。
- **取消不中断在飞请求**：`AbortSignal` 只在两个计划项之间检查，关窗后一个在飞的 HTTP 请求最多拖到超时。
- **大小写冲突只查同一目录列举内**：「远端 `Note.md` vs 本地 `note.md`」这类跨侧仅大小写不同未识别。
- **首次同步同名不同内容时用本地版本覆盖远端主名** —— 规格未定远端主名的归属，这是实现裁决，票 02 与票 04 各有推理记录，改点单一（`engine.ts` 的 `resolveConflict`）。**值得人工过目。**
- 测试套件偶发：真 HTTP 服务器 + 真临时目录的用例在并行下偶见跨文件干扰（一次观察，连续两轮复跑未再现）。

实现约定与陷阱见 [`.scratch/confidant-sync/notes/00-engineering-brief.md`](../blob/feat/webdav-sync/.scratch/confidant-sync/notes/00-engineering-brief.md)。

## 范围外（规格已裁定）

内容加密、版本历史、自动三方合并、差异对比面板、远端目录浏览器、自定义排除规则、定时轮询、自动同步、并发请求、改名识别、服务端特判分支、单向模式、目录级原子提交。
