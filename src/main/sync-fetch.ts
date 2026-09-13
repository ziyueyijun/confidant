// 注入式 HTTP 传输层(票 02「本票额外承接:传输层与自签证书」)。
//
// 用 Node 内置 node:http / node:https 实现 WebdavClient 的 `fetch` 注入点,**不加新依赖**
// (undici 的全局 fetch 无法在不引入 dispatcher 包的前提下按请求关闭证书校验)。
//
// 决议 41:默认路径走**完整证书校验**;`trustSelfSignedCert` 为真时,仅该传输层实例的
// https 请求使用 `rejectUnauthorized: false` 的 agent。绝不静默接受任何证书。
// 对 http 无影响(决议 40)。本模块不依赖 Electron,可单测。

import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import type { FetchLike } from "../../packages/sync/client";

export interface SyncFetchOptions {
  /** 信任自签证书(默认 false)。仅影响本传输层实例发起的 https 请求。 */
  trustSelfSignedCert?: boolean;
}

function headersToObject(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  new Headers(init).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function bodyToBuffer(body: BodyInit | null | undefined): Buffer | null {
  if (body === null || body === undefined) return null;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  throw new Error("同步传输层只支持 string / Uint8Array 请求体");
}

function responseHeaders(raw: IncomingHttpHeaders): Headers {
  const h = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) h.append(key, item);
    else h.set(key, value);
  }
  return h;
}

/**
 * 建传输层。返回的函数符合 `FetchLike`(WebdavClient 的 `config.fetch`)。
 * 请求方(WebdavClient)自带超时 AbortSignal;本层如实转发 init.signal。
 */
export function createSyncFetch(opts: SyncFetchOptions = {}): FetchLike {
  const insecureAgent = opts.trustSelfSignedCert ? new HttpsAgent({ rejectUnauthorized: false }) : null;

  return (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const isHttps = url.protocol === "https:";
    if (url.protocol !== "http:" && !isHttps) {
      return Promise.reject(new Error(`不支持的同步协议:${url.protocol}`));
    }
    const method = init?.method ?? "GET";
    const headers = headersToObject(init?.headers);
    const bodyBuf = bodyToBuffer(init?.body);
    if (bodyBuf && headers["content-length"] === undefined) {
      headers["content-length"] = String(bodyBuf.length);
    }
    const agent = isHttps && insecureAgent ? insecureAgent : undefined;

    return new Promise<Response>((resolve, reject) => {
      const requestFn = isHttps ? httpsRequest : httpRequest;
      const req = requestFn(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          ...(agent ? { agent } : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("error", reject);
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            const status = res.statusCode ?? 0;
            const noBody = status === 204 || status === 304 || method === "HEAD";
            resolve(
              new Response(noBody || buf.length === 0 ? null : buf, {
                status,
                statusText: res.statusMessage ?? "",
                headers: responseHeaders(res.headers),
              }),
            );
          });
        },
      );
      req.on("error", reject);

      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          req.destroy(new Error("aborted"));
          return;
        }
        const onAbort = (): void => {
          req.destroy(new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        req.on("close", () => signal.removeEventListener("abort", onAbort));
      }

      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  };
}
