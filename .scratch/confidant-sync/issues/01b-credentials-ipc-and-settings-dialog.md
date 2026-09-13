# 01b: 凭据存储、IPC 与同步设置对话框

> 本票是原「票 01:连接配置与测试连接」拆出的**上半截**（Electron + 渲染层）。
> 拆分依据见 [00-split-note.md](00-split-note.md)。下半截是 [01a](01a-sync-package-and-webdav-client.md)。

**What to build:** 用户能在主窗口菜单「文件 → 同步设置…」打开一个**工作区级模态对话框**，填入 WebDAV 地址、用户名与密码，点「测试连接」后得到明确结果（可达 / 认证失败 / 目录不存在）。远端目录非空时弹一次说明：首次同步会执行保守合并，**不会删除任何文件**。对话框内可见「远端以明文存储，请确认你信任该服务器」；地址为 `http` 时出现密码明文过网的警告；「信任此服务器的证书」开关默认关闭、开启时警告；工作区落在常见网盘同步目录内时给一次提示（只提示，不阻止）。凭据加密保存，重启后无需重输；解密失败时提示重新输入。工作区被移动或改名后，对话框显示「未找到该工作区」。

规格依据：决议 38–43、50–52、56–57。

**Blocked by:** [01a](01a-sync-package-and-webdav-client.md)

**Status:** done

## 承载形态（已定）

**渲染层模态对话框**，不新开 BrowserWindow。工作区上下文（当前工作区根路径）随 props 传入，未打开工作区时对话框给出明确空态提示。

## 分层（重要）

主进程侧的同步配置与凭据逻辑放 `src/main/sync-*.ts`，**可单测的纯逻辑**（URL 校验、警告文案判定、网盘目录启发式、配置归一化）抽到渲染层 `src/renderer/src/sync/` 下与源文件同目录放单测，与仓库现有做法一致。

凭据只经 `safeStorage` 加密后写进本机状态文件（`userData`），**不进工作区、不进远端**。密码不得出现在任何日志、错误信息或 IPC 返回值里。

## 树类目扩展的界面侧（承接 01a）

[01a](01a-sync-package-and-webdav-client.md) 已把 `TreeEntryKind` 扩成 `"dir" | "md" | "file"` 并让扫描收下全部非点开头文件。本票把这件事做完到界面：

- `FileTree.tsx` 渲染 `file` 项（非 `.md` 用与 `.md` 有区分的图标；`.md` 照旧去掉扩展名显示，其余保留扩展名）；
- 非 `.md` 项不可打开为笔记——点击给明确提示或不响应，**不得静默无反应**；
- `Sidebar` 搜索的遍历改吃新类目，搜索命中口径与原来一致（仍按 `.md` 收文件命中）；
- `use-file-operations` 的选中 / 重命名 / 删除 / 拖拽移动对 `file` 项与 `md` 项一视同仁（它们都是磁盘上的普通文件）；
- 右键菜单里笔记专属项对 `file` 项应置灰而不是消失。

## 验收清单

- [x] 「文件 → 同步设置…」菜单项（`Cmd.syncSettings`）为**当前工作区**打开对话框；未打开工作区时给出明确提示
- [x] 填入地址、用户名、密码 → 「测试连接」区分「可达」「认证失败」「目录不存在」三种结果
- [x] 远端目录非空时给出说明，文案明确写出「不会删除任何文件」
- [x] 「远端以明文存储，请确认你信任该服务器」在对话框内可见
- [x] 地址为 `http` 时出现密码明文过网的警告；改为 `https` 后警告消失
- [x] 「信任此服务器的证书」默认关闭；开启时出现警告
- [x] 工作区位于常见网盘同步目录内时出现一次提示；检测只用于提示，不参与任何自动决定（OneDrive 读环境变量，其余按路径名）
- [x] 密码经 `safeStorage` 加密后写入本机状态文件，重启应用后无需重输
- [x] 凭据解密失败（换机器、换 Windows 账户）时提示重新输入，**不静默失败**
- [x] 工作区被移动或改名后，对话框显示「未找到该工作区」
- [x] 同步配置按工作区存放，不写进工作区，不写进远端
- [x] 对话框内写明硬排除名单（点开头条目、`Thumbs.db`、`desktop.ini`），并说明用户自己的点开头目录不会被同步
- [x] 文件树显示非 `.md` 文件（图片/PDF 等），图标与 `.md` 可区分，扩展名保留
- [x] 非 `.md` 项在树里可见、可选中、可重命名、可删除、可拖拽移动，但不会被当作笔记打开
- [x] `npm run typecheck`、`npm test`、`npm run lint:boundaries` 全绿

## 单测覆盖（穷举）

- 三种测试连接结果（可达 / 认证失败 / 目录不存在）各自的文案与判定；
- `http` vs `https` 的警告开关；
- 自签证书开关默认值与警告；
- 网盘同步目录启发式：OneDrive 环境变量命中 / 路径名命中 / 无关路径不命中；
- 工作区不存在（被移动或改名）的判定；
- 凭据加密存取的往返；解密失败路径；
- **密码遮蔽**：构造一个含密码的错误，断言错误信息与序列化结果里不含密码。

## Answer

**收官 2026-09-14**（commit `769f4b7`，分支 `sync-01b`，已并入 `feat/webdav-sync`）。

三件套实测：`npm run typecheck` 通过；`npm test` **291 用例 / 36 文件全过**（01a 后 255/32，本票新增 4 个测试文件）；`npm run lint:boundaries` 零违规（165 模块 / 304 依赖）。

### 交付的 IPC 通道（02–07 往这加）

`IPC` 常量：`syncSettingsGet` / `syncSettingsSave` / `syncTestConnection`。

`ConfidantApi`：`getSyncSettings(workspacePath)` / `saveSyncSettings(workspacePath, input)` / `testSyncConnection(input)`。类型经 `@shared/sync` 转发（`@shared/ipc` re-export）：`SyncSettingsView`、`SyncSettingsInput`、`SyncConnectionInput`、`SyncConnectionResult`、`SyncConnectionKind`（`"reachable" | "auth-failed" | "not-found" | "error"`）、`SyncPasswordStatus`、`CloudEnv`。

密码语义：`SyncSettingsInput.password` 省略＝保留已存密码，`""`＝清除，非空＝覆盖；`SyncConnectionInput.password` 省略＝用已存密码（**渲染层不掌握明文**）。

主进程的 sync IPC 注册块在 `src/main/index.ts` 的 `registerIpc()` 末尾，后续票只往块内加 handler。

### 02 的接线点

- 菜单 id `Cmd.syncSettings` = `"sync-settings"`，位于「文件」子菜单、紧邻「偏好设置…」之前。注册处 `use-menu-bridge-registration.ts` 的 `openSyncSettings`。
- 对话框 `src/renderer/src/sync/SyncSettingsDialog.tsx`，props `{ workspacePath: string | null; onClose }`。
- 挂载点在 `App.tsx` 根部末位。**02 在此处接「同步」按钮与进度**。

### 已知缺口（已在票 02 承接）

**`trustSelfSignedCert` 开关的传输层未实现**：开关已存储、已透传进 `WebdavConfig`，但 `packages/sync` 默认走全局 `fetch`，Node/Electron 的 `fetch` 不接受自签证书，因此**自签服务器当前连不上**。决议 41 与票 08 都要求它可用，故该缺口移交**票 02**（在 `src/main` 侧用 `node:http`/`node:https` 实现注入式 `FetchLike`），票 08 只做真机验证。上面「自签证书开关默认值与警告」一项**只做到了默认值与文案，实际连通性未实现**——勾选反映的是本票范围内的完成度。

「首次配置」目前用「本工作区是否已有存过的配置」近似（规格的真信号是状态表缺失，归票 02）；02 拿到状态表后应收紧。

### 顺带改动

`App.tsx` / `use-menu-bridge-registration.ts` 的最小接线（让菜单项按验收清单可用），地点集中便于 02 扩展。`Sidebar` 搜索无需改动：现有 `else if (e.kind === "md")` 已天然跳过 `"file"`。01a 的 `packages/sync/**` 未被改动，也未发现其 bug。
