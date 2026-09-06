// 会话层共享小件(10-12/02 域):错误文案、自身操作回声抑制、空保存态。
// 从 App.tsx 拆分上移(22);纯函数,可单测。

import type { SaveState } from "../editor/save-pipeline";

/** IPC Result 失败 → Error(带 code,给管线 throw)。 */
export function toThrownError(res: { ok: false; error: { code: string; message: string } }): Error {
  return Object.assign(new Error(res.error.message), { code: res.error.code });
}

/** 保存失败文案(02 状态条)。 */
export function describeWriteError(error: { code: string; message: string } | null): string | null {
  if (!error) return null;
  switch (error.code) {
    case "ENOENT":
      return "文件不存在或已被移动,无法保存。";
    case "EACCES":
    case "EPERM":
    case "EBUSY":
      return "无法写入:文件可能被占用或只读。请检查后重试。";
    default:
      return `保存失败:${error.message}`;
  }
}

/** 文件操作(10/11)错误文案:按 code 映射为中文,兜底给原样错误。 */
export function fileOpErrorText(code: string | undefined, fallback: string): string {
  switch (code) {
    case "EEXIST":
      return "同名文件或文件夹已存在,操作未执行。";
    case "EINVAL":
      return "名称包含非法字符,操作未执行。";
    case "ECYCLE":
      return "不能把文件夹移入自身或它的子文件夹。";
    case "EPERM":
    case "EACCES":
    case "EBUSY":
      return "没有权限或文件被占用,操作失败。";
    default:
      return fallback;
  }
}

/** 文件操作失败的对话框提示。 */
export function showFileOpError(
  r: { ok: false; error: { code: string; message: string } },
  what: string,
): void {
  void window.confidant.infoDialog(fileOpErrorText(r.error.code, `${what}:${r.error.message}`));
}

/** 自身文件操作回声抑制(12):登记绝对路径 + 时间戳,2s 时间盒内同名 watcher 事件视为自我回声。 */
export interface OwnOpGuard {
  markOwnOp(absPath: string): void;
  isOwnOpRecent(absPath: string): boolean;
}

export function createOwnOpGuard(): OwnOpGuard {
  const map = new Map<string, number>();
  const norm = (p: string): string => p.replace(/\\/g, "/").toLowerCase();
  return {
    markOwnOp(absPath: string): void {
      const now = Date.now();
      for (const [k, v] of map) {
        if (now - v > 2000) map.delete(k);
      }
      map.set(norm(absPath), now);
    },
    isOwnOpRecent(absPath: string): boolean {
      const ts = map.get(norm(absPath));
      return ts !== undefined && Date.now() - ts < 2000;
    },
  };
}

export const EMPTY_SAVE_STATE: SaveState = {
  dirty: false,
  saving: false,
  savedAt: null,
  error: null,
};
