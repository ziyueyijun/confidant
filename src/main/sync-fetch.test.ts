// @vitest-environment node
// 注入式传输层:真 webfake(含自签 HTTPS) + 真 node:http/https。断言「默认完整校验连不上
// 自签服务器;开启信任后仅该传输层可连;http 两种设置都可用」(票 02 决议 41)。

import { afterEach, describe, expect, it } from "vitest";
import { createWebdavClient } from "../../packages/sync/client";
import { startWebfakeServer, type WebfakeServer } from "../../packages/webfake";
import { createSyncFetch } from "./sync-fetch";

const servers: WebfakeServer[] = [];

afterEach(async () => {
  while (servers.length > 0) await servers.pop()!.close();
});

async function fake(tls: boolean): Promise<WebfakeServer> {
  const s = await startWebfakeServer(tls ? { tls: true } : {});
  s.mkdirp("/dav/notes");
  s.putFile("/dav/notes/a.md", "x");
  servers.push(s);
  return s;
}

function clientFor(
  server: WebfakeServer,
  trustSelfSignedCert: boolean,
): ReturnType<typeof createWebdavClient> {
  return createWebdavClient({
    baseUrl: `${server.url}/dav/notes`,
    username: "u",
    password: "p",
    timeoutMs: 3000,
    fetch: createSyncFetch({ trustSelfSignedCert }),
  });
}

describe("自签 HTTPS 传输层", () => {
  it("默认(完整校验)拒绝自签服务器;开启信任后仅该传输层可连", async () => {
    const s = await fake(true);
    expect(s.url.startsWith("https://")).toBe(true);

    await expect(clientFor(s, false).list("")).rejects.toBeTruthy();

    const trusted = clientFor(s, true);
    expect((await trusted.list("")).map((e) => e.name)).toContain("a.md");
    // PUT 走本传输层(验证请求体、content-length、回读)
    await trusted.put("b.md", new TextEncoder().encode("hello"));
    expect(new TextDecoder().decode(await trusted.get("b.md"))).toBe("hello");
  });

  it("http 传输:信任开关与否都可用(对 http 无影响)", async () => {
    const s = await fake(false);
    expect((await clientFor(s, false).list("")).map((e) => e.name)).toContain("a.md");
    expect((await clientFor(s, true).list("")).map((e) => e.name)).toContain("a.md");
  });

  it("拒绝自签证书的错误可被归类(不静默接受)", async () => {
    const s = await fake(true);
    try {
      await clientFor(s, false).list("");
      throw new Error("期望连不上");
    } catch (err) {
      expect((err as { name?: string }).name).toBe("WebdavError");
    }
  });
});
