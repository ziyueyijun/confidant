# 同步实现 — 工程简报（所有实施票共读）

> 动工前读：本文件、[spec.md](../spec.md) 对应决议、你那一票、`CLAUDE.md`、`AGENTS.md`、`packages/README.md`。
> 本文件只写**票里没有、但会咬人的工程约定**，不重复规格口径。

## 0. 已完成的前置

- 分支 `feat/webdav-sync`（自 master）。规格/ADR/票已入库（commit `b4be16a`）。
- `fast-xml-parser@5.11.1` 已加入 dependencies（ADR-0003 定的「一个小 XML 解析依赖」）。
- 基线全绿：`npm run typecheck` / `npm test`（27 文件 192 用例）/ `npm run lint:boundaries`。
- 原票 01 **已拆为 01a（包）+ 01b（Electron/界面）**，见 [00-split-note.md](00-split-note.md)。

## 1. 接缝设计（决议 65–66 的落地约定）

规格第 181 行给的接缝是「HTTP 传输层」，并且明确：

> 假对象若放在「六个动词」的语义端口上，会顺手把畸形响应修好，永远测不到。

因此：

- **`WebdavClient` 的 `fetch` 可注入**，但**生产路径用真 `fetch`**。测试把地址指向 `packages/webfake` 起的真实 `http.Server`。不要写 `fakeClient` 之类的对象替身。
- **客户端与引擎全是真的**（XML 解析、路径归一化、状态机都真跑），只有「网络对面」是假的。
- **本地文件系统不注入**：用真临时目录（`fs.mkdtemp`），与 `packages/files/tests/` 一致。
- **回收站不注入**：同步删除本地文件调 `shell.trashItem`，与 `Cmd.delete` 当前行为一致（见 `use-file-operations.ts` → `IPC.trashItem` → `shell.trashItem`）。引擎只接受一个 `trashFile` 回调。
- **阈值类参数进配置对象**：100 MB 上限、熔断的 20 个 / 20%。测试传极小值，不造大文件。

引擎的依赖注入形状（`packages/sync/index.ts`）：

```ts
export interface SyncDeps {
  /** 生产：createWebdavClient(config) 指真地址。测试：指向 webfake 起的端口。 */
  createClient: (config: WebdavConfig) => WebdavClient;
  /** 删本地文件（走回收站）。 */
  trashFile: (absPath: string) => Promise<void>;
  now?: () => number;
  logger?: (line: string) => void;
}
```

## 2. 各票的「业主」边界 — 不要越界改别人的文件

主线是**一张票一个归属**，避免多分支重复写同一文件打架：

| 文件 / 区域 | 业主票 | 说明 |
|---|---|---|
| `packages/sync/**` | 01a 建骨架，之后每票只在 `lib/` 自己的模块上加 | 02–07 都会碰，**按模块分工，不整文件重写** |
| `packages/webfake/**` | 01a 建，之后**只增不减** | 后续票发现假服务端缺行为 → 补进去，不另起假对象 |
| `packages/files/lib/tree.ts` 与 `index.ts` 的类目导出 | 01a | 扩 `TreeEntryKind` |
| `src/main/sync-settings.ts`（配置+凭据） | 01b | |
| `src/main/sync-run.ts`（跑一次同步的手脚） | 02 起 | |
| `src/main/index.ts` 的 sync IPC 注册块 | 01b 起建立；**后续票只往这个块里加 handler** | 并发时冲突热点，加之前先 rebase |
| `src/shared/ipc.ts` | 01b 起建立；后续票**追加**通道与类型 | 冲突热点，同上 |
| `src/preload/index.ts` | 同上，追加 | |
| `src/renderer/src/sync/**`（对话框、纯逻辑） | 01b | |
| `src/renderer/src/components/Footer.tsx` 的同步段 | 02 起 | 07 补圆点 |
| `src/renderer/src/menu/menu-bridge.ts`（`Cmd.syncSettings`、`Cmd.syncNow`） | 01b 加 `syncSettings`；02 加 `syncNow` | |
| `src/renderer/src/App.tsx` 的同步接线 | 02 起 | |
| `src/main/smoke.ts` 的自检分支 | 08 | 07 若加启动探测探针，只加最小挂钩 |

**并发票（04–07）开工前先 `git rebase` 到当时的主线**，冲突自己解，解完跑三件套。

## 2.5 状态表硬不变量（01a/01b 已交付，02–07 必须遵守）

`packages/sync` 的 `createSyncStateStore` 已落地。读它之前先记住这条：

**`store.load()` 返回 `null` 的含义是「无状态表」，引擎必须据此走保守合并（绝不删除任何文件）。** `load()` 本身从不写盘，这是对的。

**危险点**：`store.upsert()` 在表不存在时**会建一张新表**（`freshState`）。所以引擎绝不能因为 `load()` 返回 null 就 upsert 出空表、再拿它去判定删除 —— 空表 + 删除传播 = 本地全删（决议 33 的原话）。

引擎侧的正确形状：

- `load() === null` → 进入**保守合并**分支，该分支**不产生任何删除**，只补两侧；
- `load() !== null` → 走常规的基准版本判定；
- **删除判定只允许出现在 `load() !== null` 的分支里。**

另外两条（01a 交付时记录的）：

- `state.workspace` 与 `opts.workspacePath` 是**严格相等**比较。Windows 路径大小写不敏感，`C:\Notes` 与 `c:\notes` 会被判为「键不符 → 无状态表 → 保守合并」。这不丢内容（只是保守），但会让状态表看起来「没生效」。`src/main` 侧传入工作区路径时**先归一化大小写与分隔符**再交给状态表。
- `webfake` 的 `PROPFIND depth: infinity` 按深度 1 处理，只保证 depth 0/1。`list()` 返回直接子项且已滤掉集合自身。**决议 63 的列举闸门不在 01a 里**：客户端用「返回 `[]`」区分空列举、「抛 `WebdavError`」区分非成功状态码，闸门判定留给票 05。

## 2.7 已交付的 IPC 与接线点（01b）

`IPC` 常量：`syncSettingsGet` / `syncSettingsSave` / `syncTestConnection`。
`ConfidantApi`：`getSyncSettings(workspacePath)` / `saveSyncSettings(workspacePath, input)` / `testSyncConnection(input)`。
类型经 `@shared/sync` 转发（`@shared/ipc` re-export）：`SyncSettingsView`、`SyncSettingsInput`、`SyncConnectionInput`、`SyncConnectionResult`、`SyncConnectionKind`（`"reachable" | "auth-failed" | "not-found" | "error"`）、`SyncPasswordStatus`、`CloudEnv`。

密码语义：`SyncSettingsInput.password` 省略＝保留已存密码，`""`＝清除，非空＝覆盖；`SyncConnectionInput.password` 省略＝用已存密码（**渲染层不掌握明文**）。

**加通道要同时改三处**：`src/shared/ipc.ts` 的 `IPC` 常量与 `ConfidantApi`、`src/preload/index.ts`。缺一 typecheck 就不过。主进程的 sync IPC 注册块在 `src/main/index.ts` 的 `registerIpc()` 末尾，**只往块内加 handler**。

- 菜单 id `Cmd.syncSettings` = `"sync-settings"`，在「文件」子菜单、紧邻「偏好设置…」之前；注册处 `use-menu-bridge-registration.ts` 的 `openSyncSettings`。
- 对话框 `src/renderer/src/sync/SyncSettingsDialog.tsx`，props `{ workspacePath: string | null; onClose }`；挂载点在 `App.tsx` 根部末位。**「同步」按钮与进度接在这里**。

## 3. 会咬人的既有事实- **`src/shared/ipc.ts` 是 IPC 协议单一事实源**，三侧（main/preload/renderer）共用。加通道要同时改 `IPC` 常量、`ConfidantApi`、preload 实现，否则 typecheck 不过。
- **`App.tsx` 已有外部变更处置（自回声 2s 时间盒抑制）**。规格第 88 行明说：同步引擎**不注册**自身操作回声抑制——同步写本地文件时**恰恰需要**编辑器重载（正在编辑的笔记被同步更新了要看得见）。但同步删除一个正开着的文件时，要落进既有的「文件缺失」态（`use-doc-missing.ts` 的 `docMissing` + 横幅），不要新造一套。
- **`save-pipeline.ts` 是 flush 的唯一入口**。决议 9 要求同步前强制 flush，复用它，不要重写。
- **工作区树扫描会跟随符号链接**（带 realpath 防环），而规格第 107 行要求同步**不跟随**。同步的枚举必须是自己的实现，不能复用 `scanWorkspaceTree`。
- **原子写的临时文件名**形如 `.{文件名}.confidant-tmp-{pid}-{随机}`，写在目标同目录。它点开头，天然被硬排除名单覆盖；但枚举时**必须显式确认**它被排掉。
- **全仓没有「长任务 + 进度 + 取消」设施**。最近的两个（导出 PDF、全工作区搜索）都是阻塞返回。第 53 条的进度/取消是新设施：约定是「同一个引擎调用收一个 `onProgress` 回调 + 一个 `AbortSignal`」——**这不算新接缝**（决议 65 末尾）。
- **测试默认环境是 jsdom**（`vitest.config.ts`）。同步包与假服务端的测试要在文件首行加 `// @vitest-environment node`，因为要起真 `http.Server` 与用真文件系统。
- **dep-cruiser 禁 barrel**：不要写一个 `index.ts` 把整棵子树 re-export。`packages/sync` 用多个小入口点（`index.ts` 引擎 / `client.ts` 客户端 / `state.ts` 状态表），`packages/webfake` 的假服务端是它的 `index.ts`。
- **`packages/sync` 不依赖 Electron**。`safeStorage`、`shell.trashItem`、chokidar 都在 `src/main` 侧，经注入进引擎。

## 4. 每票收尾必跑

```bash
npm run typecheck && npm test && npm run lint:boundaries
```

三件套全绿才算完。测试按票里「单测覆盖」那一行的清单**穷举状态组合**，不要只测顺路的用例。

## 5. 提交规矩

conventional commits，scope 用 `sync-NN`（如 `feat(sync-02): 首次同步保守合并…`）。票文件里的 `Status:` 改为 `done` 并把实测结论追加到票尾 `## Answer`。

## 6. 这个功能会删用户的笔记

规格第 26 行：「绝不静默丢内容」是本方案全部保护措施的来源。

写删除、冲突、熔断、列举闸门这几段时，**先想清楚最坏情况**，再动手。

**假服务端是你们自己写的，它会配合你们的实现**——这是最危险的陷阱。写畸形响应用例时，问自己：**真实服务端在这种畸形态下，我的代码会不会删光用户的笔记？** 如果会，那是一个必须修的 bug，不是「假服务端没模拟到」。
