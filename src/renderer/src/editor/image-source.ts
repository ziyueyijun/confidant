// 图片引用解析(06;与 05 落盘同一目录语义):
// markdown 引用文本 → 渲染 URL / 本地绝对路径。远程图不请求(网络图裁决为出)。

import { dirname, IMAGE_EXT_RE, isAbsolute, resolveRelative } from "@shared/path";

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
/** Windows 盘符(D:\ 或 D:/)不是 URL scheme。 */
const DRIVE_RE = /^[A-Za-z]:[\\/]/;

function isRemote(srcRaw: string): boolean {
  return SCHEME_RE.test(srcRaw) && !DRIVE_RE.test(srcRaw);
}

/**
 * 解析图片显示源:
 * - http(s)/其他协议:返回 null(不请求网络图;不渲染)。
 * - 相对/本地路径 → confidant-img 资产 URL;非图片扩展名/解析失败返回 null。
 */
export function resolveImageSourceUrl(notePath: string, srcRaw: string): string | null {
  if (isRemote(srcRaw)) return null; // 远程/未知协议一律不渲染
  const baseDir = dirname(notePath);
  const abs = isAbsolute(srcRaw) ? srcRaw.replace(/\\/g, "/") : resolveRelative(baseDir, srcRaw);
  if (!abs) return null;
  if (!/^[A-Za-z]:/.test(abs) && !abs.startsWith("//")) return null;
  if (!IMAGE_EXT_RE.test(abs)) return null;
  return `confidant-img://asset/${encodeURIComponent(abs)}`;
}

/** 与 resolveImageSourceUrl 同口径的本地绝对路径(右键操作/存在性判定用)。 */
export function resolveImageAbsPath(notePath: string, srcRaw: string): string | null {
  if (isRemote(srcRaw)) return null;
  if (isAbsolute(srcRaw)) return srcRaw.replace(/\\/g, "/");
  const abs = resolveRelative(dirname(notePath), srcRaw);
  if (!/^[A-Za-z]:/.test(abs) && !abs.startsWith("//")) return null;
  return abs;
}

/** 引用是否为远程(展示用文案分流)。 */
export function isRemoteSrc(srcRaw: string): boolean {
  return isRemote(srcRaw);
}
