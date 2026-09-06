// 本地图片资产协议 confidant-img://asset/<encodeURIComponent(绝对路径)>
// 渲染层 <img> 经此加载工作区内外的本地图片(dev http 与 prod file 同口径),
// 仅放行常见图片扩展名与本地绝对路径,不存在/非法一律 404。

import { protocol } from "electron";
import { net } from "electron";
import { pathToFileURL } from "node:url";
import { IMAGE_EXT_RE } from "@shared/path";

const SCHEME = "confidant-img";

/** app ready 前注册(privileged:standard/secure,使 URL 形态常规)。 */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** app ready 后安装 handler。 */
export function installImageProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const raw = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    // 仅放行 Windows 本地绝对路径(盘符/UNC)与图片扩展名
    if (!/^[A-Za-z]:[\\/]/.test(raw) && !raw.startsWith("//")) {
      return new Response("invalid path", { status: 400 });
    }
    if (!IMAGE_EXT_RE.test(raw)) {
      return new Response("not an image", { status: 400 });
    }
    try {
      const res = await net.fetch(pathToFileURL(raw).toString());
      if (res.ok) return res;
      return new Response("not found", { status: 404 });
    } catch {
      return new Response("read failed", { status: 404 });
    }
  });
}

export function imageSchemeOf(absPath: string): string {
  return `${SCHEME}://asset/${encodeURIComponent(absPath)}`;
}
