// IPC 协议(主 ↔ 预载 ↔ 渲染 三侧共用;通道一律 invoke/handle 单向调用)。
// 结果类型统一走 ok/error 判别式,跨上下文不丢错误信息。

export const IPC = {
  openNoteDialog: "dialog:open-note",
  readTextFile: "files:read-text",
  writeTextFile: "files:write-text",
  /** 主进程请求渲染层打开指定文件(冒烟驱动 / 外部唤入共用通道)。 */
  openFileRequest: "app:open-file-request",
} as const;

export interface ErrorInfo {
  code: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorInfo };

/** 渲染进程可见的桥面(经 preload 注入 window.confidant)。随工单渐进扩展。 */
export interface ConfidantApi {
  /** 原生对话框选一个 .md 笔记(01 过渡入口;04 立起树后由工作区打开替换)。取消返回 null。 */
  openNoteDialog(): Promise<string | null>;
  readTextFile(path: string): Promise<Result<string>>;
  writeTextFile(path: string, content: string): Promise<Result<void>>;
  /** 订阅主进程的「打开文件」请求(冒烟驱动与菜单打开共用)。返回退订函数。 */
  onOpenFile(cb: (path: string) => void): () => void;
}

declare global {
  interface Window {
    confidant: ConfidantApi;
  }
}
