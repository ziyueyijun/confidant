// @vitest-environment node
// WebDAV 客户端六动词:全部走真 http.Server(webfake)+ 真 fetch,不注入替身。
// 畸形响应按规格决议 66 全清单落地。

import { afterEach, describe, expect, it } from "vitest";
import { createWebdavClient, WebdavError } from "../client";
import { startWebfakeServer, type WebfakeOptions, type WebfakeServer } from "../../webfake";

const servers: WebfakeServer[] = [];

async function fake(opts?: WebfakeOptions): Promise<WebfakeServer> {
  const s = await startWebfakeServer(opts);
  s.mkdirp("/dav/notes"); // 远端目录在现实中是先存在的(用户配置的目录)
  servers.push(s);
  return s;
}

afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

function clientFor(server: WebfakeServer, over: Partial<Parameters<typeof createWebdavClient>[0]> = {}) {
  return createWebdavClient({
    baseUrl: `${server.url}/dav/notes`,
    username: "u",
    password: "p",
    timeoutMs: 3000,
    ...over,
  });
}

async function rejectsKind(p: Promise<unknown>, kind: string, status?: number): Promise<WebdavError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(WebdavError);
    const we = err as WebdavError;
    expect(we.kind).toBe(kind);
    if (status !== undefined) expect(we.status).toBe(status);
    return we;
  }
  throw new Error("期望抛 WebdavError,实际成功");
}

describe("list (PROPFIND Depth:1)", () => {
  it("成功:只列直接子项、区分文件与集合、带大小", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "hello");
    s.putFile("/dav/notes/sub/b.md", "world");
    const c = clientFor(s);
    const entries = await c.list("");
    const byName = new Map(entries.map((e) => [e.name, e]));
    expect([...byName.keys()].sort()).toEqual(["a.md", "sub"]);
    expect(byName.get("a.md")).toMatchObject({ relPath: "a.md", isCollection: false, size: 5 });
    expect(byName.get("sub")).toMatchObject({ relPath: "sub", isCollection: true });
    // 逐层遍历:直接子项不含 sub/b.md
    expect(byName.has("b.md")).toBe(false);
    // 请求形态:Depth 1
    expect(s.requests.filter((r) => r.method === "PROPFIND").every((r) => r.depth === "1")).toBe(true);
  });

  it("子目录列举返回相对 base 的完整路径", async () => {
    const s = await fake();
    s.putFile("/dav/notes/sub/b.md", "world");
    const c = clientFor(s);
    expect((await c.list("sub"))[0]).toMatchObject({ relPath: "sub/b.md", name: "b.md" });
  });

  it("畸形:成功码 + 空 multistatus → 返回空数组(不抛)", async () => {
    const s = await fake({ quirks: { emptyListing: true } });
    s.putFile("/dav/notes/a.md", "hello");
    expect(await clientFor(s).list("")).toEqual([]);
  });

  it("畸形:列举返回非成功状态码 → 抛 http(绝不当作远端为空)", async () => {
    const s = await fake({ quirks: { listingStatus: 500 } });
    await rejectsKind(clientFor(s).list(""), "http", 500);
  });

  it("畸形:PROPFIND 不返回 ETag → etag 为 null,其余字段仍在", async () => {
    const s = await fake({ quirks: { omitEtag: true } });
    s.putFile("/dav/notes/a.md", "hello");
    const [e] = await clientFor(s).list("");
    expect(e!.etag).toBeNull();
    expect(e!.size).toBe(5);
    expect(e!.lastModified).not.toBeNull();
  });

  it("目录不存在 → not-found", async () => {
    const s = await fake();
    await rejectsKind(clientFor(s).list("nope"), "not-found", 404);
  });

  it("非 ASCII base 前缀:中文 + 空格目录名正确列举(回归锚点)", async () => {
    const s = await fake();
    s.putFile("/dav/笔记 目录/a.md", "x");
    const c = clientFor(s, { baseUrl: `${s.url}/dav/笔记 目录` });
    expect((await c.list(""))[0]).toMatchObject({ relPath: "a.md" });
  });
});

describe("XML 实体与特殊字符文件名", () => {
  it("文件名含 & 与 <:默认(百分号编码)服务端往返一致", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a&b<c.md", "x");
    const c = clientFor(s);
    expect((await c.list("")).map((e) => e.name)).toContain("a&b<c.md");
    expect(new TextDecoder().decode(await c.get("a&b<c.md"))).toBe("x");
  });

  it("文件名含 & 与 <:rawHrefNames 服务端(XML 实体转义)也正确解码", async () => {
    const s = await fake({ quirks: { rawHrefNames: true } });
    s.putFile("/dav/notes/a&b<c.md", "x");
    expect((await clientFor(s).list("")).map((e) => e.name)).toContain("a&b<c.md");
  });

  it("特殊字符全矩阵:中文 / 空格 / # / % 在 put→list→get 上往返", async () => {
    const s = await fake();
    const name = "中文 空格#井%号.md";
    const c = clientFor(s);
    const bytes = new TextEncoder().encode("内容 payload");
    await c.put(name, bytes);
    // 服务端侧确实落到了该文件
    expect(new TextDecoder().decode(s.getFile(`/dav/notes/${name}`))).toBe("内容 payload");
    expect((await c.list("")).map((e) => e.name)).toContain(name);
    expect(await c.get(name)).toEqual(bytes);
  });
});

describe("get", () => {
  it("成功返回字节;缺失 → not-found", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "hello");
    const c = clientFor(s);
    expect(new TextDecoder().decode(await c.get("a.md"))).toBe("hello");
    await rejectsKind(c.get("missing.md"), "not-found", 404);
  });
});

describe("put", () => {
  it("成功创建并返回验证符", async () => {
    const s = await fake();
    const r = await clientFor(s).put("a.md", new TextEncoder().encode("hi"));
    expect(r.etag).toBeTruthy();
    expect(new TextDecoder().decode(s.getFile("/dav/notes/a.md"))).toBe("hi");
  });

  it("createOnly 对已存在目标 → precondition(412)", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "old");
    await rejectsKind(clientFor(s).put("a.md", new TextEncoder().encode("new"), { createOnly: true }), "precondition", 412);
    // 未被覆盖
    expect(new TextDecoder().decode(s.getFile("/dav/notes/a.md"))).toBe("old");
  });

  it("If-Match 命中放行、错值 412(尽力而为,不作正确性保证)", async () => {
    const s = await fake();
    const c = clientFor(s);
    const r = await c.put("a.md", new TextEncoder().encode("v1"));
    await c.put("a.md", new TextEncoder().encode("v2"), { ifMatch: r.etag });
    expect(new TextDecoder().decode(s.getFile("/dav/notes/a.md"))).toBe("v2");
    await rejectsKind(c.put("a.md", new TextEncoder().encode("v3"), { ifMatch: '"wrong"' }), "precondition", 412);
  });
});

describe("remove", () => {
  it("删除存在的文件;缺失 → not-found", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "x");
    const c = clientFor(s);
    await c.remove("a.md");
    expect(s.has("/dav/notes/a.md")).toBe(false);
    await rejectsKind(c.remove("a.md"), "not-found", 404);
  });
});

describe("mkcol / ensureDir", () => {
  it("MKCOL 三种应答:201 创建 / 405 已存在 / 400 已存在(quirk)", async () => {
    const s = await fake();
    const c = clientFor(s);
    expect(await c.mkcol("d1")).toBe("created");
    expect(await c.mkcol("d1")).toBe("exists"); // 标准 405
    const s400 = await fake({ quirks: { mkcolExisting400: true } });
    expect(await clientFor(s400).mkcol("x")).toBe("created");
    expect(await clientFor(s400).mkcol("x")).toBe("exists"); // 绿联 400
  });

  it("多级建目录返 405 的服务端:ensureDir 逐级、一次一层,仍全部建成", async () => {
    const s = await fake({ quirks: { mkcolMultiLevel405: true } });
    const c = clientFor(s);
    await c.ensureDir("x/y/z");
    expect(s.has("/dav/notes/x")).toBe(true);
    expect(s.has("/dav/notes/x/y")).toBe(true);
    expect(s.has("/dav/notes/x/y/z")).toBe(true);
    const mkcols = s.requests.filter((r) => r.method === "MKCOL").map((r) => r.path);
    expect(mkcols).toEqual(["/dav/notes/x", "/dav/notes/x/y", "/dav/notes/x/y/z"]);
  });

  it("ensureDir 对已存在的层不报错(400/405 都当已存在)", async () => {
    const s = await fake({ quirks: { mkcolExisting400: true } });
    s.mkdirp("/dav/notes/x");
    await clientFor(s).ensureDir("x/y");
    expect(s.has("/dav/notes/x/y")).toBe(true);
  });
});

describe("move", () => {
  it("MOVE 改名;源缺失 → not-found", async () => {
    const s = await fake();
    s.putFile("/dav/notes/a.md", "x");
    const c = clientFor(s);
    await c.move("a.md", "b.md");
    expect(s.has("/dav/notes/a.md")).toBe(false);
    expect(new TextDecoder().decode(s.getFile("/dav/notes/b.md"))).toBe("x");
    await rejectsKind(c.move("ghost.md", "z.md"), "not-found", 404);
  });
});

describe("认证", () => {
  it("正确凭据通过;错误凭据 → auth(401)", async () => {
    const s = await fake({ credentials: { username: "u", password: "right" } });
    s.putFile("/dav/notes/a.md", "x");
    await expect(clientFor(s, { password: "right" }).list("")).resolves.toHaveLength(1);
    await rejectsKind(clientFor(s, { password: "wrong" }).list(""), "auth", 401);
  });

  it("服务端返 403 时也是 auth", async () => {
    const s = await fake({ credentials: { username: "u", password: "right" }, quirks: { authFailureStatus: 403 } });
    await rejectsKind(clientFor(s, { password: "wrong" }).list(""), "auth", 403);
  });
});

describe("超时", () => {
  it("超过 timeoutMs → timeout", async () => {
    const s = await fake({ quirks: { delayMs: 300 } });
    await rejectsKind(clientFor(s, { timeoutMs: 40 }).list(""), "timeout");
  });
});
