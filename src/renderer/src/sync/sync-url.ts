// 同步设置对话框的地址纯逻辑(01b):URL 校验与协议判定。
// 归一化(normalizeBaseUrl)在 @shared/sync(主进程也要用);此处只放渲染层判定。

import { normalizeBaseUrl } from "@shared/sync";

export { normalizeBaseUrl };

export type UrlScheme = "http" | "https" | "other";

/** 协议判定(大小写不敏感)。 */
export function urlScheme(url: string): UrlScheme {
  const t = url.trim().toLowerCase();
  if (t.startsWith("https://")) return "https";
  if (t.startsWith("http://")) return "http";
  return "other";
}

/** 校验远端地址:合法返回 null,否则返回错误文案。 */
export function validateBaseUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return "请填写远端地址。";
  if (urlScheme(t) === "other") return "地址必须以 http:// 或 https:// 开头。";
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    return "地址格式不正确。";
  }
  if (!parsed.hostname) return "地址缺少主机名。";
  return null;
}
