// 内存版假 WebDAV 服务端(规格决议 65–66):挂在真实 node:http 上,按 WebDAV 语义
// 应答 PROPFIND/GET/PUT/DELETE/MKCOL/MOVE,并可按 quirk 模拟畸形态。
// 全部为真 HTTP:测试走真 fetch,客户端不注入任何替身。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { escapeXml, xmlDocument } from "./xml";
import { SELFSIGNED_CERT_PEM, SELFSIGNED_KEY_PEM } from "./cert";
import type {
  WebfakeFileMeta,
  WebfakeFileStat,
  WebfakeOptions,
  WebfakeQuirks,
  WebfakeRequestLogEntry,
  WebfakeServer,
} from "./types";

interface DirNode {
  kind: "dir";
}
interface FileNode {
  kind: "file";
  data: Uint8Array;
  etag: string;
  lastModified: string;
}
type Node = DirNode | FileNode;

/** 逐段 UTF-8 解码;非法转义(裸 `%`)原样保留。 */
function decodePathname(rawPath: string): string {
  return rawPath
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join("/");
}

/** 归一化:去尾斜杠、根为 ""、确保前导 "/"。 */
function normPath(p: string): string {
  let q = p;
  while (q.length > 1 && q.endsWith("/")) q = q.slice(0, -1);
  if (q === "/") return "";
  if (q !== "" && !q.startsWith("/")) q = "/" + q;
  return q;
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

function makeEtag(): string {
  return `"${randomBytes(8).toString("hex")}"`;
}

/** 建文件节点;meta 可钉住验证符/修改时间(默认随机验证符 + 当前时间)。 */
function makeFileNode(data: string | Uint8Array, meta?: WebfakeFileMeta): FileNode {
  return {
    kind: "file",
    data: toBytes(data),
    etag: meta?.etag ?? makeEtag(),
    lastModified: meta?.lastModified ?? new Date().toUTCString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendXml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": 'application/xml; charset="utf-8"' });
  res.end(body);
}

/** 归一化后的路径 → href(集合带尾斜杠)。默认百分号编码;rawHrefNames 时只做 XML 转义。 */
function encodeHref(p: string, isDir: boolean, quirks: WebfakeQuirks): string {
  let href = quirks.rawHrefNames
    ? escapeXml(p)
    : p
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/");
  if (isDir && !href.endsWith("/")) href += "/";
  if (href === "") href = "/";
  return href;
}

function responseXml(p: string, node: Node, quirks: WebfakeQuirks): string {
  const isDir = node.kind === "dir";
  const href = encodeHref(p, isDir, quirks);
  const props: string[] = [];
  props.push(`<D:resourcetype>${isDir ? "<D:collection/>" : ""}</D:resourcetype>`);
  if (node.kind === "file") {
    props.push(`<D:getcontentlength>${node.data.byteLength}</D:getcontentlength>`);
    if (!quirks.omitEtag) props.push(`<D:getetag>${escapeXml(node.etag)}</D:getetag>`);
    props.push(`<D:getlastmodified>${escapeXml(node.lastModified)}</D:getlastmodified>`);
  } else {
    props.push(`<D:getlastmodified>${new Date(0).toUTCString()}</D:getlastmodified>`);
  }
  return (
    `<D:response><D:href>${href}</D:href>` +
    `<D:propstat><D:prop>${props.join("")}</D:prop>` +
    `<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
  );
}

function multistatus(responses: string[]): string {
  return xmlDocument(`<D:multistatus xmlns:D="DAV:">${responses.join("")}</D:multistatus>`);
}

export async function startWebfakeServer(opts: WebfakeOptions = {}): Promise<WebfakeServer> {
  const quirks: WebfakeQuirks = opts.quirks ?? {};
  const credentials = opts.credentials ?? null;
  const nodes = new Map<string, Node>([["", { kind: "dir" }]]);
  const requests: WebfakeRequestLogEntry[] = [];

  function childrenOf(dirPath: string): string[] {
    const out: string[] = [];
    for (const k of nodes.keys()) {
      if (k !== dirPath && parentOf(k) === dirPath) out.push(k);
    }
    return out;
  }

  function checkAuth(req: IncomingMessage): boolean {
    if (!credentials) return true;
    const h = req.headers.authorization;
    if (typeof h !== "string" || !h.startsWith("Basic ")) return false;
    const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
    return decoded === `${credentials.username}:${credentials.password}`;
  }

  function propfind(path: string, req: IncomingMessage, res: ServerResponse): void {
    if (typeof quirks.listingStatus === "number") {
      res.writeHead(quirks.listingStatus);
      res.end("listing error");
      return;
    }
    const node = nodes.get(path);
    if (!node) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (quirks.emptyListing) {
      sendXml(res, 207, multistatus([]));
      return;
    }
    const depth = typeof req.headers.depth === "string" ? req.headers.depth : "infinity";
    const paths: string[] = [path];
    if (depth !== "0" && node.kind === "dir") paths.push(...childrenOf(path));
    sendXml(res, 207, multistatus(paths.map((p) => responseXml(p, nodes.get(p)!, quirks))));
  }

  function getFileRes(path: string, res: ServerResponse): void {
    const node = nodes.get(path);
    if (!node || node.kind !== "file") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(node.data.byteLength),
      etag: node.etag,
    });
    res.end(Buffer.from(node.data));
  }

  async function put(path: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const exists = nodes.has(path);
    if (req.headers["if-none-match"] === "*" && exists) {
      res.writeHead(412);
      res.end();
      return;
    }
    const ifMatch = req.headers["if-match"];
    // ignoreIfMatch:不支持条件写的服务端——验证「If-Match 尽力而为,不作为正确性保证」。
    if (!quirks.ignoreIfMatch && typeof ifMatch === "string" && ifMatch !== "*") {
      const cur = nodes.get(path);
      if (!cur || cur.kind !== "file" || cur.etag !== ifMatch) {
        res.writeHead(412);
        res.end();
        return;
      }
    }
    if (path !== "" && nodes.get(parentOf(path))?.kind !== "dir") {
      res.writeHead(409);
      res.end();
      return;
    }
    if (nodes.get(path)?.kind === "dir") {
      res.writeHead(405);
      res.end();
      return;
    }
    const node = makeFileNode(new Uint8Array(body));
    nodes.set(path, node);
    res.writeHead(exists ? 204 : 201, { etag: node.etag });
    res.end();
  }

  function removeSubtree(path: string): void {
    for (const k of [...nodes.keys()]) {
      if (k === path || k.startsWith(path + "/")) nodes.delete(k);
    }
  }

  function del(path: string, res: ServerResponse): void {
    const node = nodes.get(path);
    if (!node || path === "") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (node.kind === "dir") removeSubtree(path);
    else nodes.delete(path);
    res.writeHead(204);
    res.end();
  }

  function mkcol(path: string, res: ServerResponse): void {
    const existing = nodes.get(path);
    if (existing) {
      const status = existing.kind === "dir" && quirks.mkcolExisting400 ? 400 : 405;
      res.writeHead(status);
      res.end();
      return;
    }
    if (path !== "" && nodes.get(parentOf(path))?.kind !== "dir") {
      res.writeHead(quirks.mkcolMultiLevel405 ? 405 : 409);
      res.end();
      return;
    }
    nodes.set(path, { kind: "dir" });
    res.writeHead(201);
    res.end();
  }

  function move(path: string, req: IncomingMessage, res: ServerResponse): void {
    const src = nodes.get(path);
    if (!src || path === "") {
      res.writeHead(404);
      res.end();
      return;
    }
    const destHeader = req.headers.destination;
    if (typeof destHeader !== "string") {
      res.writeHead(400);
      res.end();
      return;
    }
    let destPath: string;
    try {
      destPath = normPath(decodePathname(new URL(destHeader, "http://localhost").pathname));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (destPath === "" || destPath === path) {
      res.writeHead(403);
      res.end();
      return;
    }
    const overwrite = String(req.headers.overwrite ?? "T").toUpperCase();
    const destExists = nodes.has(destPath);
    if (destExists && overwrite === "F") {
      res.writeHead(412);
      res.end();
      return;
    }
    if (nodes.get(parentOf(destPath))?.kind !== "dir") {
      res.writeHead(409);
      res.end();
      return;
    }
    if (destExists) removeSubtree(destPath);
    const moving: Array<[string, Node]> = [];
    for (const [k, v] of nodes) {
      if (k === path || (src.kind === "dir" && k.startsWith(path + "/"))) moving.push([k, v]);
    }
    for (const [k] of moving) nodes.delete(k);
    for (const [k, v] of moving) nodes.set(destPath + k.slice(path.length), v);
    res.writeHead(201);
    res.end();
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const u = new URL(req.url ?? "/", "http://localhost");
    const path = normPath(decodePathname(u.pathname));
    const method = req.method ?? "";
    requests.push({
      method,
      path,
      depth: typeof req.headers.depth === "string" ? req.headers.depth : null,
      ifMatch: typeof req.headers["if-match"] === "string" ? req.headers["if-match"] : null,
      ifNoneMatch: typeof req.headers["if-none-match"] === "string" ? req.headers["if-none-match"] : null,
    });

    if (typeof quirks.delayMs === "number" && quirks.delayMs > 0) await sleep(quirks.delayMs);

    if (!checkAuth(req)) {
      const status = quirks.authFailureStatus ?? 401;
      if (status === 401) res.setHeader("WWW-Authenticate", 'Basic realm="webfake"');
      res.writeHead(status);
      res.end("auth failed");
      return;
    }

    switch (method) {
      case "PROPFIND":
        propfind(path, req, res);
        return;
      case "GET":
        getFileRes(path, res);
        return;
      case "PUT":
        await put(path, req, res);
        return;
      case "DELETE":
        del(path, res);
        return;
      case "MKCOL":
        mkcol(path, res);
        return;
      case "MOVE":
        move(path, req, res);
        return;
      default:
        res.writeHead(405);
        res.end();
    }
  }

  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    void handle(req, res).catch(() => {
      try {
        res.writeHead(500);
        res.end();
      } catch {
        // 响应可能已发出;忽略
      }
    });
  };
  const tls = opts.tls ?? false;
  const server = tls
    ? createHttpsServer(
        typeof tls === "object" ? { cert: tls.cert, key: tls.key } : { cert: SELFSIGNED_CERT_PEM, key: SELFSIGNED_KEY_PEM },
        handler,
      )
    : createServer(handler);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const scheme = tls ? "https" : "http";

  function mkdirp(path: string): void {
    const n = normPath(path);
    if (n === "") return;
    let acc = "";
    for (const seg of n.split("/").filter(Boolean)) {
      acc += "/" + seg;
      if (!nodes.has(acc)) nodes.set(acc, { kind: "dir" });
    }
  }

  return {
    url: `${scheme}://127.0.0.1:${port}`,
    port,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    putFile(path, data, meta) {
      const n = normPath(path);
      mkdirp(parentOf(n));
      nodes.set(n, makeFileNode(data, meta));
    },
    getFile(path) {
      const node = nodes.get(normPath(path));
      return node?.kind === "file" ? node.data : undefined;
    },
    stat(path) {
      const node = nodes.get(normPath(path));
      if (!node || node.kind !== "file") return undefined;
      return { etag: node.etag, lastModified: node.lastModified, size: node.data.byteLength };
    },
    setEtag(path, etag) {
      const node = nodes.get(normPath(path));
      if (node && node.kind === "file") node.etag = etag;
    },
    setLastModified(path, lastModified) {
      const node = nodes.get(normPath(path));
      if (node && node.kind === "file") node.lastModified = lastModified;
    },
    mkdirp,
    has: (path) => nodes.has(normPath(path)),
    list: () => [...nodes.keys()],
  };
}
