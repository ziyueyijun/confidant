# 01a: sync 功能包与自研 WebDAV 客户端

> 本票是原「票 01:连接配置与测试连接」拆出的**下半截**（纯包，不碰 Electron）。
> 拆分依据见 [00-split-note.md](00-split-note.md)。上半截是 [01b](01b-credentials-ipc-and-settings-dialog.md)。

**What to build:** 立起 **`packages/sync`** 与 **`packages/webfake`** 两个新包，并通过全部单测。

- `packages/sync`：自研薄 WebDAV 客户端（列目录 / 下载 / 上传 / 删除 / 建目录 / 移动六个动词）+ 路径编码与 href 归一化 + 同步状态表的读写。
- `packages/webfake`：内存版假 WebDAV 服务端，可挂到一个真实 `http.Server` 上，并能模拟畸形响应。

这一票**不做**任何 Electron、IPC、渲染层与凭据的事——那是 [01b](01b-credentials-ipc-and-settings-dialog.md)。本票的产物是后续每一票（02–07）都要长在上面的地基。

规格依据：决议 5、14、35、38–49、65–66；ADR-0003。

**Blocked by:** None (can start immediately)

**Status:** done

## 包边界（重要）

两个包都遵守 `packages/README.md` 的 deep module 规则，并各自**多入口点、禁 barrel**：

```
packages/sync/
  index.ts      ← 入口点：同步引擎与状态表（后续票在此生长）
  client.ts     ← 入口点：WebDAV 客户端与它的类型契约
  lib/          ← 私有实现
  tests/        ← 私有测试
packages/webfake/
  index.ts      ← 入口点：假服务端构造 + 畸形行为开关
  lib/
  tests/
```

`packages/sync` 的测试经 `packages/webfake` 的**入口点**导入假服务端（这是 dep-cruiser 允许的：跨包只走入口点）。这样「假服务端」既是测试夹具又是可独立验证的组件。

**包不依赖 Electron**：`packages/sync` 只依赖 Node 与 `fast-xml-parser`。回收站、safeStorage、文件监听等 Electron 能力由 `src/main` 注入，不在本票。

## 客户端契约（后续票按此对接）

`client.ts` 至少导出：

- `createWebdavClient(config)` → 一个实现了六个动词的对象；`config` 含 `baseUrl`、`username`、`password`、`trustSelfSignedCert`、`timeoutMs`、可注入的 `fetch`。
- 列目录**只用深度 1**（`PROPFIND` + `Depth: 1`），由调用方逐层遍历。
- 上传带 `If-None-Match: *`（创建保护）；`If-Match` 尽力而为，**绝不作为正确性保证**。
- 建目录**逐级创建，一次一层**；**400 与 405 都当作「已存在」**。
- 认证只做 Basic；`http` 与 `https` 都允许（`http` 的警告在 01b 的界面上）。
- 显式请求超时；所有请求串行（并发数 1 由引擎侧保证，客户端本身不做池）。
- 错误要能区分出**认证失败**（401/403）与其它失败，供后续票单独识别。

## 假服务端要能模拟的畸形行为

规格第 66 条的清单，本票全部落地：

- 多级 `MKCOL` 返 405（即便中间层不存在）；
- 对已存在集合返 400；
- `PROPFIND` 不返回验证符（ETag）；
- 文件名含 XML 实体（`&`、`<`）时正确编解码；
- 列举静默返回空（成功状态码 + 空 multistatus）；
- 非 ASCII 与含空格路径；
- 列举返回非成功状态码。

## 树类目扩展（同步需要看见非 .md 文件）

**已定口径（用户裁决）：工作区树显示同步覆盖的全部文件。**

同步覆盖工作区整棵树（含图片、PDF 等非 `.md` 文件），而现有扫描只收目录与 `.md`。若不放宽，图片会被同步却不在树里出现——等于「应用自动写入/删除了你树里看不见的文件」，与「绝不静默」的产品基调相悖。

本票负责**数据侧的类目扩展**（`packages/files/lib/tree.ts`）：`TreeEntryKind` 从 `"dir" | "md"` 扩成 `"dir" | "md" | "file"`，扫描时 `d.isFile()` 一律收（不止 `.md`），点开头与 `Thumbs.db` / `desktop.ini` 照旧排除。

界面侧（`FileTree.tsx` 渲染 `file` 项、`Sidebar` 搜索、`use-file-operations` 的选中与删除口径）在 [01b](01b-credentials-ipc-and-settings-dialog.md) 落地——那是渲染层的活，与本票的包无关。

注意保持既有行为不回归：排序仍是「文件夹在前、组内自然序」，`collectMarkdownPaths` 仍只收 `.md`（搜索与打开笔记的口径不变），`src/shared/tree.ts` 的 `countMarkdown` 计数口径不变。

## 验收清单

- [x] `packages/sync` 与 `packages/webfake` 建立，各自通过 `npm run lint:boundaries`
- [x] WebDAV 客户端实现列目录 / 下载 / 上传 / 删除 / 建目录 / 移动六个动词
- [x] 列目录只用深度 1；逐层遍历由调用方完成
- [x] 建目录逐级创建，一次一层；**400 与 405 都当作「已存在」**
- [x] 上传带 `If-None-Match: *`；`If-Match` 尽力而为
- [x] Basic 认证；`http` 与 `https` 均可用；`trustSelfSignedCert` 开关存在（默认关）
- [x] 显式请求超时；超时可配置
- [x] 认证失败可与其它失败区分
- [x] 路径编码与 href 归一化有单测覆盖：中文、空格、`#`、`%`、非 ASCII 目录名、base 前缀不同、末尾斜杠
- [x] XML 实体（`&`、`<`）在文件名里正确往返
- [x] 假服务端可应答六个动词，且能模拟上列全部畸形行为
- [x] 假服务端挂在真实 `http.Server` 上（测试里起真端口，走真 `fetch`）
- [x] 同步状态表的读写单测：按工作区为键、每完成一个文件写一次、**读取失败退化为「无状态表」而非静默重建为空表**
- [x] `TreeEntryKind` 扩展为 `"dir" | "md" | "file"`；扫描收下全部非点开头文件（含图片/PDF）
- [x] 点开头条目、`Thumbs.db`、`desktop.ini` 仍被排除
- [x] 排序口径不变（文件夹在前、组内名称自然序）；`collectMarkdownPaths` 仍只收 `.md`
- [x] `npm run typecheck`、`npm test`、`npm run lint:boundaries` 全绿

## 单测覆盖（穷举，不要只测顺路）

- 六个动词各自的成功路径与失败路径；
- 路径归一化矩阵：`/dav/` 前缀、URL 编码过的 href、非 ASCII、空格、`#`、`%`、尾斜杠、绝对路径 vs 相对 href；
- MKCOL 的三种应答：201 创建成功 / 405 多级 / 400 已存在；
- PROPFIND 的三种应答：正常 / 无 ETag / 空结果；
- 认证失败 401、403；
- 状态表：正常读写 / 文件损坏 / 文件不存在 / 中间写入。

## Answer

**收官 2026-09-14**（commit `8178a29`，分支 `sync-01a`，已并入 `feat/webdav-sync`）。

三件套实测：`npm run typecheck` 通过；`npm test` **255 用例 / 32 文件全过**（基线 192 / 27，本票新增 5 个测试文件）；`npm run lint:boundaries` 通过（154 modules，282 dependencies，零违规）。

### 交付的接口形状（02–07 长在这上面）

`packages/sync/client.ts`：

```ts
createWebdavClient(config: WebdavConfig): WebdavClient
interface WebdavConfig { baseUrl; username; password; trustSelfSignedCert?; timeoutMs?; fetch? }
interface WebdavClient {
  list(relPath): Promise<WebdavEntry[]>;   // Depth:1,已滤掉自身、只留直接子项
  get(relPath): Promise<Uint8Array>;
  put(relPath, data, opts?: { createOnly?; ifMatch? }): Promise<{ etag: string | null }>;
  remove(relPath): Promise<void>;
  mkcol(relPath): Promise<"created" | "exists">;   // 400/405 → "exists"
  move(fromRelPath, toRelPath): Promise<void>;
  ensureDir(relPath): Promise<void>;               // 逐级、一次一层
}
type WebdavErrorKind = "auth" | "not-found" | "conflict" | "precondition" | "timeout" | "network" | "http";
```

`relPath` 一律是相对 `baseUrl` 的正斜杠路径，根为 `""`。另导出 `buildUrl` / `normalizeHref` / `normalizeUrlPath` / `decodePathname` / `nameOfRelPath` / `parentOfRelPath` / `parseMultistatus`。

`packages/sync/index.ts`：`SyncDeps` / `SyncConfig` / `SyncThresholds` / `SyncRetryPolicy` / `SyncProgress` / `SyncReport` / `SyncEngine` 类型，`createSyncStateStore`，`DEFAULT_SYNC_THRESHOLDS`（100 MB / 20 个 / 20%）、`DEFAULT_SYNC_RETRY`（2 次，退避 200ms 起）。

`packages/webfake/index.ts`：`startWebfakeServer({ credentials?, quirks? })` → 真 `http.Server`；`quirks` 可开 `mkcolMultiLevel405` / `mkcolExisting400` / `omitEtag` / `emptyListing` / `listingStatus` / `authFailureStatus` / `delayMs` / `rawHrefNames`。

**本票未提供 `createSyncEngine`** —— 引擎工厂的形状留给票 02 决定并在 `lib/` 加模块。

### 留给后续票的坑（已记入工程简报 §2.5）

- `store.upsert()` 在表不存在时**会建新表**。引擎只能在「已判定为首次同步」时这样做，**绝不能因 `load()` 返回 null 就 upsert 空表再据此删文件**。`load()` 本身从不写盘。
- `state.workspace` 与 `opts.workspacePath` 严格相等比较；Windows 大小写不敏感，`src/main` 侧传入前要归一化。
- 决议 63 的列举闸门不在本票：客户端用「返回 `[]`」区分空列举、「抛 `WebdavError`」区分非成功状态码，闸门判定留给票 05。
- `trustSelfSignedCert` 只是配置字段，本包不做 TLS 处置（Node fetch 无 agent 选项），需注入的 `fetch`（如 Electron `net.fetch`）承担。
- `webfake` 的 `rawHrefNames` 模式无法往返文件名里的裸 `#`（URL 片段分隔符）；`#` 只在默认百分号编码模式测。
- `src/test/setup.ts` 新增的 DOM 存在性守卫是 node 环境测试的前提，**不要回退**。

### 顺带改动

树类目扩展（`packages/files/lib/tree.ts` 的 `TreeEntryKind` → `dir|md|file`、新增 `isExcludedName` 导出）落地在此，界面侧归票 01b。`src/shared/tree.ts` 的计数口径不变。
