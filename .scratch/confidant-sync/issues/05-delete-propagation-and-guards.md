# 05: 删除传播与保护

**What to build:** 在应用里删掉一个笔记，同步后远端那份也没了；在远端删掉的笔记，同步后本地那份进 **Windows 回收站**（不是不可恢复的删除）。删除判定靠**基准版本**——只有状态表里有该文件记录、且本地内容仍等于基准时，才认定为「远端删除」；本地内容已改则按冲突处理，绝不删本地。

两道保护：一次同步要删除的文件数**超过 20 个**、或**超过该侧总数的 20%** 时立即停止并要求用户确认（**熔断**）；远端根列举返回 **0 条**而状态表非空时直接报错停止，不做任何删除（**列举闸门**）。列举返回非成功状态码一律视为整体失败，绝不当作「远端为空」。

规格依据：决议 24–28、63。

**Blocked by:** [03](03-incremental-change-detection.md)

**Status:** done

- [x] 本地删除 → 远端对应文件被删除
- [x] 远端删除 → 本地对应文件进入 Windows 回收站，可从回收站恢复
- [x] 同步触发的本地删除同样走回收站
- [x] 本地内容已改、远端已删 → 按冲突处理（保留双份），不删本地
- [x] 熔断：单次同步要删除的文件数 > 20 个，**或** > 该侧文件总数的 20% → 停止并要求确认
- [x] 百分比规则覆盖小工作区（3 个文件的库删 3 个也触发）
- [x] 熔断阈值可配置（测试传极小值，不造几百个文件）
- [x] 列举闸门：远端根列举返回 0 条而状态表里存在该远端的历史记录 → 报错停止，不删任何文件
- [x] 列举返回非成功状态码 → 整体失败，绝不当作「远端为空」
- [x] 从服务端回收站恢复文件后，下次同步把它当作「远端新增」拉回本地
- [x] 用户确认熔断后同步能继续；拒绝则整次同步不产生任何删除
- [x] 单测覆盖：本地删 / 远端删 / 改 vs 删 / 双侧同删 / 空列举 / 超阈值 / 恰好等于阈值
- [x] `npm test` 全绿

## Answer

**收官 2026-09-14**（commit `81372a4`，分支 `sync-05`，已并入 `feat/webdav-sync`）。

三件套实测：`npm run typecheck` 通过；`npm test` **383 用例 / 44 文件全过**（票 04 后 365/43，本票 +18）；`npm run lint:boundaries` 零违规（190 模块）。

**合并说明**：本票原基于 03（`860d69e`）。与票 04 合入后在 `engine.ts` 产生冲突 —— 两侧在同一位置各插入一个新辅助函数（04 的 `uploadLocal` / 05 的 `enforceDeleteGuard`），**结构性冲突、无语义重叠**。保留两侧后 383 用例全绿，04 的 `remoteLeftBase` 修正完好。

### 三条红线的实现位置（已独立复核）

1. **`load()` 为 null 不删** —— 关键在 `merge.ts` 的 `keys` 集合：`hasState ? Object.keys(input.records) : []`。**无状态表时不引入任何记录键**，且每个删除分支都以 `record` 为前提（`record` 仅在 `hasState` 为真时取到）。因此无状态表时 `deleteLocal` / `deleteRemote` / `forgetRecord` **不可达**，只剩 upload / download / resolveBoth。
2. **回收站** —— `engine.ts:396` 的 `await deps.trashFile(entry.absPath)`，是引擎里**唯一的本地删除调用**（其余 `unlink` 都在 `fs-local.ts`/`lock.ts`/`state-store.ts` 里处理临时文件与锁）。
3. **列举闸门** —— `engine.ts:506`：`hasState && remote.rootRawCount === 0 && recordCount > 0` → `SyncFatalError("listing-guard")`，位于 `scanRemote` 之后、`buildPlan` 之前。`rootRawCount` 取**过滤前**的根条目数（`remote.ts:44`），因此根目录只含点开头条目时不会误触。列举返回非成功状态码由客户端抛 `WebdavError` → 整体失败，**永不落入「空」分支**。

### 最危险场景与拦截

**列举静默为空**：远端根返回 0 条而状态表有 500 条记录 → 若按「远端全删」传播就是本地 500 个文件进回收站。被**列举闸门**挡住（D1/D2：立即报错、零 DELETE）。第二危险的是**本地工作区被清空/指错目录 → 批量删远端**（不可恢复），由**熔断**的数量与占比规则 + 用户确认挡住（E1/E2）。

做了**变异验证**：把两道守卫各改成恒 false 后 D1/D2/E1/E2/E5 立即失败，证明用例真在鉴别行为。

### 熔断确认回调（票 06 接界面）

```ts
confirmDeletes?: (prompt: DeleteGuardPrompt) => Promise<boolean>;  // 省略 ⇒ 视为拒绝
interface DeleteGuardPrompt {
  count; localDeletes; remoteDeletes; localTotal; remoteTotal;
  maxFiles; ratioLimit; triggeredByMax; triggeredByRatio; relPaths: string[];
}
```

拒绝或未注入 → `SyncFatalError`，`kind` 为 `"delete-guard"` / `"listing-guard"`（供界面区分）。**`src/main/sync-run.ts` 未改**，所以当前生产默认 = 拒绝 = 零删除；票 06 需把 `confirmDeletes` 接到 `dialog.showMessageBox`。

### 未敢确认的假设

1. **「改 vs 删」保留双份的具体落地**：实现为「保留幸存的一侧并把它复制回另一侧」。规格只写「保留双份」，未逐字规定。
2. **熔断的「该侧文件总数」分侧计**（本地删除比本地总数、远端删除比远端总数），按决议 27 的「该侧」字面。
3. **列举闸门的「0 条」取过滤前原始条目数**，而非枚举后的文件数。
4. **熔断「超过」= 严格大于**（恰好等于阈值不触发，按票据边界要求）。
5. **闸门触发条件含「状态表非空」**，按规格原话「状态表里存在该远端的历史记录」。

### 已知缺口

- `runDeleteRemote` **每次下载整文件算 hash**（远端 DELETE 不可恢复，故不信任验证符）。牺牲一次 GET/删除项；若票 08 真机发现删除量大拖慢，可改成「验证符无变化才跳过下载」，但会重新暴露票 03 的 A6 弱点。
- 熔断按「删除候选」计数，改/删冲突也计入，可能对不产生实际删除的同步误触发确认（偏安全侧）。
- 承接票 03 的 A6 残余：远端内容变了但 etag/时间/大小全等时无法感知，`deleteRemote` 分支可能删掉「表面无变化实已改」的远端文件 —— 归票 08 复核。
