// 自研薄 WebDAV 客户端实现(ADR-0003)。只做六个动词;Basic 认证;显式超时;
// href 归一化与 XML 解析都在本地真跑。请求由调用方串行(本客户端不做池)。

import {
  WebdavError,
  type FetchLike,
  type WebdavClient,
  type WebdavConfig,
  type WebdavEntry,
  type WebdavErrorKind,
  type WebdavPutOptions,
} from "./webdav-types";
import { buildUrl, nameOfRelPath, normalizeHref, parentOfRelPath } from "./paths";
import { parseMultistatus } from "./xml";

const DEFAULT_TIMEOUT_MS = 30000;

const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<D:propfind xmlns:D="DAV:"><D:prop>' +
  "<D:resourcetype/><D:getcontentlength/><D:getetag/><D:getlastmodified/>" +
  "</D:prop></D:propfind>";

function kindForStatus(status: number): WebdavErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 412) return "precondition";
  return "http";
}

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/^\/+/, "").replace(/\/+$/, "");
}

function defaultFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

export function createWebdavClientImpl(config: WebdavConfig): WebdavClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl: FetchLike = config.fetch ?? defaultFetch;

  async function doRequest(method: string, url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (config.username || config.password) {
      const token = Buffer.from(`${config.username}:${config.password}`, "utf8").toString("base64");
      headers.set("authorization", `Basic ${token}`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, headers, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new WebdavError("timeout", method, url, null, `WebDAV ${method} ${url} 超时(${timeoutMs}ms)`);
      }
      throw new WebdavError("network", method, url, null, `WebDAV ${method} ${url} 网络失败: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  function assertOk(res: Response, method: string, url: string): void {
    if (!res.ok) throw new WebdavError(kindForStatus(res.status), method, url, res.status);
  }

  async function list(relPath: string): Promise<WebdavEntry[]> {
    const url = buildUrl(config.baseUrl, relPath, { trailingSlash: true });
    const res = await doRequest("PROPFIND", url, {
      method: "PROPFIND",
      headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body: PROPFIND_BODY,
    });
    assertOk(res, "PROPFIND", url);
    const raw = parseMultistatus(await res.text());
    const selfPath = normalizeRelPath(relPath);
    const entries: WebdavEntry[] = [];
    for (const r of raw) {
      const rel = normalizeHref(r.href, config.baseUrl);
      if (rel === selfPath) continue; // Depth:1 会带回集合自身
      if (parentOfRelPath(rel) !== selfPath) continue; // 只认直接子项
      entries.push({
        relPath: rel,
        name: nameOfRelPath(rel),
        isCollection: r.isCollection,
        etag: r.etag,
        lastModified: r.lastModified,
        size: r.size,
      });
    }
    return entries;
  }

  async function get(relPath: string): Promise<Uint8Array> {
    const url = buildUrl(config.baseUrl, relPath);
    const res = await doRequest("GET", url, { method: "GET" });
    assertOk(res, "GET", url);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function put(
    relPath: string,
    data: Uint8Array,
    opts?: WebdavPutOptions,
  ): Promise<{ etag: string | null }> {
    const url = buildUrl(config.baseUrl, relPath);
    const headers: Record<string, string> = {};
    if (opts?.createOnly) headers["If-None-Match"] = "*";
    if (opts?.ifMatch) headers["If-Match"] = opts.ifMatch;
    const res = await doRequest("PUT", url, {
      method: "PUT",
      headers,
      // Uint8Array 是合法 BodyInit;@types/node 的 ArrayBufferLike 泛型使联合收窄失败,故断言。
      body: data as unknown as BodyInit,
    });
    assertOk(res, "PUT", url);
    return { etag: res.headers.get("etag") };
  }

  async function remove(relPath: string): Promise<void> {
    const url = buildUrl(config.baseUrl, relPath);
    const res = await doRequest("DELETE", url, { method: "DELETE" });
    assertOk(res, "DELETE", url);
  }

  async function mkcol(relPath: string): Promise<"created" | "exists"> {
    const url = buildUrl(config.baseUrl, relPath, { trailingSlash: true });
    const res = await doRequest("MKCOL", url, { method: "MKCOL" });
    if (res.status === 201 || res.status === 200 || res.status === 204) return "created";
    // 400 与 405 都当作「已存在」(决议 46:绿联对已存在共享根返 400、对多级返 405)。
    if (res.status === 400 || res.status === 405) return "exists";
    throw new WebdavError(kindForStatus(res.status), "MKCOL", url, res.status);
  }

  async function move(fromRelPath: string, toRelPath: string): Promise<void> {
    const fromUrl = buildUrl(config.baseUrl, fromRelPath);
    const toUrl = buildUrl(config.baseUrl, toRelPath, { trailingSlash: true });
    const res = await doRequest("MOVE", fromUrl, {
      method: "MOVE",
      headers: { Destination: toUrl, Overwrite: "T" },
    });
    assertOk(res, "MOVE", fromUrl);
  }

  async function ensureDir(relPath: string): Promise<void> {
    let acc = "";
    for (const seg of normalizeRelPath(relPath).split("/").filter(Boolean)) {
      acc = acc ? `${acc}/${seg}` : seg;
      await mkcol(acc); // 一次一层(决议 46)
    }
  }

  return { list, get, put, remove, mkcol, move, ensureDir };
}
