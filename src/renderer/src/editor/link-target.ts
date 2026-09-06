// 链接目标分类(16):http(s) → 系统浏览器;工作区内 .md → 应用内打开(含 #标题 锚点);
// 其他本地路径 → 资源管理器显示。

import { dirname, isAbsolute, resolveRelative } from "@shared/path";

const WEB_SCHEME = /^(https?|mailto):/i;
const DRIVE_RE = /^[A-Za-z]:[\\/]/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const MD_EXT = /\.md$/i;

export interface LinkTarget {
  kind: "web" | "note" | "local";
  /** 去掉锚点后的 href 原样。 */
  hrefPath: string;
  /** 解码后的标题锚点(仅 note 且带锚点)。 */
  anchor: string | null;
  /** note 目标的绝对路径。 */
  abs?: string;
  /** note 目标相对工作区的 relPath(供树联动)。 */
  relPath?: string;
}

export function classifyLink(docPath: string, wsRoot: string | null, rawHref: string): LinkTarget {
  const [hrefPart, rawAnchor] = splitAnchor(rawHref);
  const anchor = rawAnchor ? decodeURIComponent(rawAnchor.replace(/\+/g, " ")).trim() : null;
  const href = hrefPart.trim();

  // 纯锚点 = 本文档内跳转
  if (href === "" && anchor) {
    return { kind: "note", hrefPath: href, anchor, abs: docPath };
  }
  if (WEB_SCHEME.test(href)) {
    return { kind: "web", hrefPath: href, anchor: null };
  }
  // 本地路径解析:绝对(盘符/UNC)或相对当前笔记目录
  let abs: string;
  if (isAbsolute(href)) {
    abs = href.replace(/\\/g, "/");
  } else {
    abs = resolveRelative(dirname(docPath), href);
  }
  const local = DRIVE_RE.test(abs) || abs.startsWith("//");
  if (!local) {
    // 其他 scheme(未知协议)按 web 语义走系统处理
    if (SCHEME_RE.test(href)) return { kind: "web", hrefPath: href, anchor: null };
    return { kind: "local", hrefPath: href, anchor: null };
  }
  // 工作区内 .md → 应用内打开
  if (wsRoot && MD_EXT.test(abs)) {
    const root = wsRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const absNorm = abs.replace(/\\/g, "/");
    if (absNorm.toLowerCase().startsWith(root.toLowerCase() + "/")) {
      return {
        kind: "note",
        hrefPath: abs,
        anchor,
        abs,
        relPath: absNorm.slice(root.length + 1),
      };
    }
  }
  return { kind: "local", hrefPath: abs, anchor: null };
}

function splitAnchor(href: string): [string, string | null] {
  const idx = href.indexOf("#");
  if (idx < 0) return [href, null];
  return [href.slice(0, idx), href.slice(idx + 1)];
}
