// packages/sync —— 入口点:WebDAV 客户端与它的类型契约。
// 六个动词 + 逐级建目录辅助;路径归一化与 XML 解析也在本入口点暴露(它们是本功能
// 的外部契约,测试经此验证)。同步引擎在 index.ts;状态表在 index.ts。

import { createWebdavClientImpl } from "./lib/client-impl";
import type { WebdavClient, WebdavConfig } from "./lib/webdav-types";

/**
 * 建自研薄 WebDAV 客户端。`config.fetch` 可注入传输层(生产用真 fetch;
 * 测试指向 webfake 起的真 http.Server)。请求由调用方串行。
 */
export function createWebdavClient(config: WebdavConfig): WebdavClient {
  return createWebdavClientImpl(config);
}

export {
  buildUrl,
  decodePathname,
  nameOfRelPath,
  normalizeHref,
  normalizeUrlPath,
  parentOfRelPath,
} from "./lib/paths";
export { parseMultistatus } from "./lib/xml";
export type { DavResponseRaw } from "./lib/xml";
export { WebdavError } from "./lib/webdav-types";
export type {
  FetchLike,
  WebdavClient,
  WebdavConfig,
  WebdavEntry,
  WebdavErrorKind,
  WebdavPutOptions,
} from "./lib/webdav-types";
