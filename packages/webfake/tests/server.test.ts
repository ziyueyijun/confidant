// @vitest-environment node
// 假服务端自身的独立验证:走真 http.Server + 真 fetch,断言协议应答与畸形开关。

import { afterEach, describe, expect, it } from "vitest";
import { startWebfakeServer, type WebfakeServer } from "../index";

const servers: WebfakeServer[] = [];
async function fake(opts?: Parameters<typeof startWebfakeServer>[0]): Promise<WebfakeServer> {
  const s = await startWebfakeServer(opts);
  servers.push(s);
  return s;
}
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

function call(s: WebfakeServer, method: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${s.url}${path}`, { method, ...init });
}

describe("PROPFIND", () => {
  it("Depth:1 返回自身 + 直接子项;Depth:0 只返回自身", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "hello");
    s.mkdirp("/dav/notes/sub");
    const body1 = await (await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } })).text();
    expect(body1).toContain("<D:collection/>");
    expect(body1).toContain("/dav/notes/a.md");
    expect(body1).toContain("/dav/notes/sub/");
    expect(body1).toContain("<D:getcontentlength>5</D:getcontentlength>");
    expect(body1).toContain("<D:getetag>");
    const body0 = await (await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "0" } })).text();
    expect(body0).not.toContain("/dav/notes/a.md");
  });

  it("空 multistatus 开关:成功码 207 + 无 response", async () => {
    const s = await fake({ quirks: { emptyListing: true } });
    s.putFile("/dav/notes/a.md", "x");
    const res = await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } });
    expect(res.status).toBe(207);
    expect(await res.text()).not.toContain("<D:response>");
  });

  it("列举非成功状态码开关", async () => {
    const s = await fake({ quirks: { listingStatus: 500 } });
    expect((await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } })).status).toBe(500);
  });

  it("omitEtag:PROPFIND 不含 getetag", async () => {
    const s = await fake({ quirks: { omitEtag: true } });
    s.putFile("/dav/notes/a.md", "x");
    expect(await (await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } })).text()).not.toContain("getetag");
  });
});

describe("href 编码", () => {
  it("默认:空格 / 中文百分号编码", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a b.md", "x");
    s.putFile("/dav/notes/笔记.md", "x");
    const body = await (await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } })).text();
    expect(body).toContain("%20");
    expect(body).toContain("%E7%AC%94%E8%AE%B0");
  });

  it("rawHrefNames:& / < 以 XML 实体转义", async () => {
    const s = await fake({ quirks: { rawHrefNames: true } });
    s.putFile("/dav/notes/a&b<c.md", "x");
    const body = await (await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } })).text();
    expect(body).toContain("a&amp;b&lt;c.md");
  });
});

describe("MKCOL", () => {
  it("标准:新建 201;已存在 405;中间层缺失 409", async () => {
    const s = await fake();
    s.mkdirp("/dav/notes");
    expect((await call(s, "MKCOL", "/dav/notes/d1")).status).toBe(201);
    expect((await call(s, "MKCOL", "/dav/notes/d1")).status).toBe(405);
    expect((await call(s, "MKCOL", "/dav/notes/missing/deep")).status).toBe(409);
  });

  it("quirk:多级返 405、已存在返 400", async () => {
    const q = await fake({ quirks: { mkcolMultiLevel405: true, mkcolExisting400: true } });
    q.mkdirp("/dav/notes/d1");
    expect((await call(q, "MKCOL", "/dav/notes/nope/deep")).status).toBe(405);
    expect((await call(q, "MKCOL", "/dav/notes/d1")).status).toBe(400);
  });
});

describe("GET / PUT / DELETE / MOVE", () => {
  it("PUT 创建、GET 取回、DELETE 移除", async () => {
    const s = await fake();
    s.mkdirp("/dav/notes");
    const put = await call(s, "PUT", "/dav/notes/a.md", { body: new TextEncoder().encode("hi") });
    expect(put.status).toBe(201);
    expect(put.headers.get("etag")).toBeTruthy();
    const got = await call(s, "GET", "/dav/notes/a.md");
    expect(await got.text()).toBe("hi");
    expect((await call(s, "GET", "/dav/notes/missing.md")).status).toBe(404);
    expect((await call(s, "DELETE", "/dav/notes/a.md")).status).toBe(204);
    expect(s.has("/dav/notes/a.md")).toBe(false);
  });

  it("PUT If-None-Match:* 对已存在返 412", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "old");
    expect((await call(s, "PUT", "/dav/notes/a.md", { headers: { "If-None-Match": "*" }, body: "new" })).status).toBe(412);
  });

  it("MOVE 子树改名;源缺失 404", async () => {
    const s = await fake();
    s.putFile("/dav/notes/dir/a.md", "x");
    expect((await call(s, "MOVE", "/dav/notes/dir", { headers: { Destination: `${s.url}/dav/notes/moved` } })).status).toBe(201);
    expect(s.has("/dav/notes/moved/a.md")).toBe(true);
    expect(s.has("/dav/notes/dir/a.md")).toBe(false);
    expect((await call(s, "MOVE", "/dav/notes/ghost", { headers: { Destination: `${s.url}/dav/notes/z` } })).status).toBe(404);
  });
});

describe("认证", () => {
  it("缺凭据 401 且带 WWW-Authenticate;错凭据 401;对凭据 200", async () => {
    const s = await fake({ credentials: { username: "u", password: "p" } });
    s.mkdirp("/dav/notes");
    const noAuth = await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1" } });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get("www-authenticate")).toContain("Basic");
    const bad = `Basic ${Buffer.from("u:nope").toString("base64")}`;
    expect((await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1", Authorization: bad } })).status).toBe(401);
    const good = `Basic ${Buffer.from("u:p").toString("base64")}`;
    expect((await call(s, "PROPFIND", "/dav/notes", { headers: { Depth: "1", Authorization: good } })).status).toBe(207);
  });

  it("authFailureStatus 可设为 403", async () => {
    const s = await fake({ credentials: { username: "u", password: "p" }, quirks: { authFailureStatus: 403 } });
    expect((await call(s, "PROPFIND", "/dav", { headers: { Depth: "0" } })).status).toBe(403);
  });
});
