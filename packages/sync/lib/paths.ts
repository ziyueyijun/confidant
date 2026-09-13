// 路径编码与 href 归一化(ADR-0003:href→相对路径是 WebDAV 客户端 bug 的头号来源)。
//
// 真实事故(规格 Further Notes):实现若把「已编码的 href」与「未编码的 base 前缀」比较,
// 路径含非 ASCII 时前缀永不命中 → 列举静默清空 → 与删除传播相遇就是本地全删。
// 对策:base 与 href 都逐段解码后再比较,永不在「一半编码、一半未编码」上比较。

/** 逐段 UTF-8 解码;非法转义(裸 `%`)原样保留,绝不抛错。 */
export function decodePathname(rawPath: string): string {
  return rawPath
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
}

/** 归一化 URL 路径:解码 → 去尾斜杠(根变 "")。只保证前导 "/" 与大小写原样。 */
export function normalizeUrlPath(pathname: string): string {
  const decoded = decodePathname(pathname);
  let q = decoded;
  while (q.length > 1 && q.endsWith("/")) q = q.slice(0, -1);
  if (q === "/") q = "";
  return q;
}

function ensureTrailingSlash(url: string): string {
  const u = new URL(url);
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  return u.toString();
}

/**
 * 构造请求 URL:相对 base 的 relPath 逐段百分号编码后拼到 base 路径下。
 * 编码覆盖 `#`(→%23)、`%`(→%25)、空格(→%20)与非 ASCII。
 */
export function buildUrl(baseUrl: string, relPath: string, opts?: { trailingSlash?: boolean }): string {
  const base = new URL(baseUrl);
  let basePath = base.pathname;
  if (!basePath.endsWith("/")) basePath += "/";
  const encoded = relPath
    .split("/")
    .filter((s) => s !== "")
    .map((s) => encodeURIComponent(s))
    .join("/");
  let pathname = basePath + encoded;
  if (opts?.trailingSlash && !pathname.endsWith("/")) pathname += "/";
  return `${base.origin}${pathname}`;
}

/**
 * href → 相对 base 的路径。支持绝对 URL、根绝对路径与相对 href;
 * base 与 href 都逐段解码后做前缀匹配(修掉非 ASCII 永不命中的缺陷)。
 */
export function normalizeHref(href: string, baseUrl: string): string {
  const base = new URL(ensureTrailingSlash(baseUrl));
  let target: URL;
  try {
    target = new URL(href, base);
  } catch {
    return normalizeUrlPath(href).replace(/^\//, "");
  }
  const basePath = normalizeUrlPath(base.pathname);
  const hrefPath = normalizeUrlPath(target.pathname);
  if (basePath === "") return hrefPath.replace(/^\//, "");
  if (hrefPath === basePath) return "";
  if (hrefPath.startsWith(basePath + "/")) return hrefPath.slice(basePath.length + 1);
  // 前缀不匹配(通常是配错 base):退回 href 自身相对形式,绝不返回 "" 冒充命中。
  return hrefPath.replace(/^\//, "");
}

/** 相对路径最后一段(空路径返回 "")。 */
export function nameOfRelPath(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? relPath : relPath.slice(i + 1);
}

/** 相对路径的父目录(根下第一层返回 "")。 */
export function parentOfRelPath(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i < 0 ? "" : relPath.slice(0, i);
}
