// IPC 协议(主 ↔ 预载 ↔ 渲染 三侧共用;通道一律 invoke/handle 单向调用)。
// 结果类型统一走 ok/error 判别式,跨上下文不丢错误信息。

import type { TreeEntry } from "../../packages/files";
export type { TreeEntry } from "../../packages/files";

export const IPC = {
  openNoteDialog: "dialog:open-note",
  readTextFile: "files:read-text",
  writeTextFile: "files:write-text",
  /** 主进程请求渲染层打开指定文件(冒烟驱动 / 外部唤入共用通道)。 */
  openFileRequest: "app:open-file-request",
  /** 主进程请求渲染层打开指定工作区(冒烟驱动共用通道)。 */
  openWorkspaceRequest: "app:open-workspace-request",
  /** 主进程请求渲染层 flush 未落盘内容(窗口关闭前,02 票)。 */
  flushRequest: "app:flush-request",
  /** 渲染层 flush 完成回执。 */
  flushAck: "app:flush-ack",
  /** 渲染层整表下发菜单模板(启动/结构变化时;native 菜单按此构建)。 */
  menuSetTemplate: "menu:set-template",
  /** 渲染层批量推送菜单项状态(启用/勾选/文案)。 */
  menuUpdateItems: "menu:update-items",
  /** 主进程点击菜单项 → 渲染层命令(id)。 */
  menuCommand: "menu:command",
  /** 关于对话框。 */
  aboutDialog: "dialog:about",
  /** 关闭窗口(退出命令;走与点 X 相同的 flush 路径)。 */
  closeWindow: "window:close",
  /** 原生「打开文件夹(工作区)」对话框。 */
  pickFolderDialog: "dialog:pick-folder",
  /** 打开工作区:主进程起监听并返回初始整树。 */
  workspaceOpen: "workspace:open",
  /** 关闭当前工作区监听。 */
  workspaceClose: "workspace:close",
  /** 主进程 → 渲染层:工作区树已更新(外部变更重扫后推送)。 */
  workspaceTreeUpdated: "workspace:tree-updated",
  /** 渲染层 → 主进程:某文件已作为当前文档打开(会话恢复数据)。 */
  fileOpened: "file:opened",
  /** 读取持久状态片段。 */
  stateGet: "state:get",
  /** 写入持久状态片段(主进程防抖落盘)。 */
  stateSet: "state:set",
  /** 位图字节落盘(剪贴板粘贴通道;落盘规则见 packages/files image-save)。 */
  imageSaveBytes: "image:save-bytes",
  /** 图片文件复制落盘(拖入/菜单选取通道)。 */
  imageSaveCopy: "image:save-copy",
  /** 原生「选择图片文件」对话框(插入图片通道)。 */
  imagePickDialog: "dialog:pick-image",
  /** 临时上下文菜单(右键;返回所选项 id 或 null)。 */
  showContextMenu: "menu:popup-context",
  /** 在系统资源管理器中显示并选中目标(打开所在文件夹)。 */
  showItemInFolder: "shell:show-item-in-folder",
  /** 把本地图片文件数据写入系统剪贴板(复制图片)。 */
  imageCopyToClipboard: "image:copy-to-clipboard",
  /** 移入系统回收站。 */
  trashItem: "shell:trash-item",
  /** 原生确认对话框。 */
  confirmDialog: "dialog:confirm",
  /** 原生信息对话框。 */
  infoDialog: "dialog:info",
  /** 路径是否存在(悬空引用判定)。 */
  pathExists: "fs:path-exists",
} as const;

export interface ErrorInfo {
  code: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorInfo };

/** 菜单模板项(渲染层定义,主进程构建 native Menu;click 经 id 回发)。 */
export interface MenuItemTemplate {
  id: string;
  type?: "normal" | "separator" | "submenu" | "role";
  label?: string;
  accelerator?: string;
  role?: string;
  /** 上下文菜单(临时 popup)项可用态;应用菜单由 updateItems 驱动,忽略此项。 */
  enabled?: boolean;
  submenu?: MenuItemTemplate[];
}

/** 菜单项状态更新(渲染层推送)。 */
export interface MenuItemState {
  id: string;
  enabled: boolean;
  checked?: boolean;
}

/** 渲染进程可见的桥面(经 preload 注入 window.confidant)。随工单渐进扩展。 */
export interface ConfidantApi {
  /** 原生「选择 .md 笔记」对话框(01 过渡入口遗留,04 后被工作区形态替换)。取消返回 null。 */
  openNoteDialog(): Promise<string | null>;
  readTextFile(path: string): Promise<Result<string>>;
  writeTextFile(path: string, content: string): Promise<Result<void>>;
  /** 整表重建 native 应用菜单(03 票框架;结构变化才调用)。 */
  setMenuTemplate(template: MenuItemTemplate[]): void;
  /** 批量推送菜单项启用/勾选状态(频繁调用,轻量)。 */
  updateMenuItems(states: MenuItemState[]): void;
  /** 订阅 native 菜单命令(id)。返回退订函数。 */
  onMenuCommand(cb: (id: string) => void): () => void;
  /** 关于对话框(产品名 + 版本)。 */
  showAbout(): Promise<void>;
  /** 关闭主窗口(与点 X 同路径:先 flush 再销毁)。 */
  closeWindow(): void;
  /** 订阅主进程的「打开文件」请求(冒烟驱动与菜单打开共用)。返回退订函数。 */
  onOpenFile(cb: (path: string) => void): () => void;
  /** 订阅主进程的「打开工作区」请求(冒烟驱动共用)。返回退订函数。 */
  onOpenWorkspace(cb: (path: string) => void): () => void;
  /** 订阅主进程的「关闭前 flush」请求;处理完后必须调 flushAck。 */
  onFlushRequest(cb: () => void): () => void;
  /** 通知主进程 flush 已完成。 */
  flushAck(): void;
  /** 原生「选择文件夹(工作区)」对话框。取消返回 null。 */
  pickFolderDialog(): Promise<string | null>;
  /** 打开工作区(主进程起监听、记录最近打开),返回初始整树。 */
  openWorkspace(path: string): Promise<Result<TreeEntry[]>>;
  /** 关闭当前工作区监听。 */
  closeWorkspace(): void;
  /** 订阅工作区树更新(外部变更重扫;整树替换)。返回退订函数。 */
  onWorkspaceTree(cb: (tree: TreeEntry[]) => void): () => void;
  /** 上报「某文件已成为当前文档」(主进程记录会话恢复数据)。 */
  noteOpened(path: string): void;
  /** 读取持久状态片段(不存在返回 null)。 */
  stateGet(key: string): Promise<unknown>;
  /** 写入持久状态片段(主进程防抖落盘)。 */
  stateSet(key: string, value: unknown): void;
  /** 位图字节落盘到笔记同目录(命名防撞见落盘规则);返回文件名(相对引用用)。 */
  saveClipboardImage(params: {
    dirAbs: string;
    noteStem: string;
    mime: string;
    bytes: Uint8Array;
  }): Promise<Result<{ fileName: string }>>;
  /** 把源图片文件复制落盘到笔记同目录(沿用源扩展名);返回文件名。 */
  copyImageFromPath(params: {
    dirAbs: string;
    noteStem: string;
    sourcePath: string;
  }): Promise<Result<{ fileName: string }>>;
  /** 原生选择图片文件(「插入图片」);取消返回 null。 */
  pickImageFile(): Promise<string | null>;
  /** 渲染层 File → 磁盘路径(拖入文件必需;webUtils)。非文件返回空串。 */
  pathForFile(file: File): string;
  /** 右键上下文菜单;返回所选正常项 id(关闭/跳出为 null)。 */
  showContextMenu(items: MenuItemTemplate[]): Promise<string | null>;
  /** 资源管理器中定位目标文件/文件夹。 */
  showItemInFolder(targetPath: string): Promise<void>;
  /** 图片文件内容写入系统剪贴板。 */
  copyImageToClipboard(path: string): Promise<Result<void>>;
  /** 移入系统回收站(删除通道;回收站可还原)。 */
  trashItem(path: string): Promise<Result<void>>;
  /** 原生确认框(删除确认等)。 */
  confirmDialog(message: string, detail?: string): Promise<boolean>;
  /** 原生信息框(明确提示,不静默)。 */
  infoDialog(message: string, detail?: string): Promise<void>;
  /** 路径是否存在(悬空引用判定)。 */
  pathExists(path: string): Promise<boolean>;
}

declare global {
  interface Window {
    confidant: ConfidantApi;
  }
}
