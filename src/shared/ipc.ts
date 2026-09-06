// IPC 协议(主 ↔ 预载 ↔ 渲染 三侧共用;通道一律 invoke/handle 单向调用)。
// 结果类型统一走 ok/error 判别式,跨上下文不丢错误信息。

export const IPC = {
  openNoteDialog: "dialog:open-note",
  readTextFile: "files:read-text",
  writeTextFile: "files:write-text",
  /** 主进程请求渲染层打开指定文件(冒烟驱动 / 外部唤入共用通道)。 */
  openFileRequest: "app:open-file-request",
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
  /** 原生对话框选一个 .md 笔记(01 过渡入口;04 立起树后由工作区打开替换)。取消返回 null。 */
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
  /** 订阅主进程的「关闭前 flush」请求;处理完后必须调 flushAck。 */
  onFlushRequest(cb: () => void): () => void;
  /** 通知主进程 flush 已完成。 */
  flushAck(): void;
}

declare global {
  interface Window {
    confidant: ConfidantApi;
  }
}
