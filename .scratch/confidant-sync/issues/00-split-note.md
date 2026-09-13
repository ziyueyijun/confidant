# 票 01 拆分说明

原「票 01:连接配置与测试连接」囊括了新包、自研 WebDAV 客户端、假服务端、凭据存储、设置对话框与整条 IPC，上下文预算贴着上限。动工前按**包 / 应用**这条天然缝拆成两张：

- **[01a: sync 功能包与自研 WebDAV 客户端](01a-sync-package-and-webdav-client.md)** —— 纯包，不碰 Electron。产物：`packages/sync`（六个动词的客户端 + 路径归一化 + 同步状态表读写）与 `packages/webfake`（可模拟畸形响应的内存假服务端）。
- **[01b: 凭据存储、IPC 与同步设置对话框](01b-credentials-ipc-and-settings-dialog.md)** —— Electron 与渲染层。产物：`safeStorage` 凭据、同步配置状态、菜单入口、模态对话框、测试连接。

拆在这条缝上的理由：01a 的验收完全由单测判定（真实 `http.Server` + 真 `fetch`），不依赖任何 Electron 运行时；01b 的验收是界面行为与凭据存储，复用 01a 的入口点。两张票可以分别独立收官，且 01b 若力竭时留下的是一块可用的对话框，而不是半截包。

**依赖变化**：票 02 的 `Blocked by` 由 `01` 改为 `01a, 01b`。03–07 的依赖不变（仍挂在 03 之后）。本拆分不改变任何规格口径。
