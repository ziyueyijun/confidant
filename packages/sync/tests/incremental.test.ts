// @vitest-environment node
// 增量同步——变更探测的判定矩阵(票 03;规格决议 20–21、35、48–49)。
//
// 真临时目录 + webfake 真服务器(不写假客户端)。断言的是「本地 / 远端 / 状态表
// 三方初始状态 → 同步后三方终态与报告」,以及 HTTP 请求形态(外部契约)。
//
// 核心命题:**内容 hash 才是权威,验证符只做变化探测**。本文件最重要的一条是
// 「验证符不变、内容已变」(见 A5):若引擎只看验证符就跳过下载,就是静默丢内容。

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  type SyncEngine,
  type SyncFileRecord,
  type SyncProgress,
  type SyncReport,
  type SyncThresholds,
} from "../index";
import { createWebdavClient, WebdavError } from "../client";
import { startWebfakeServer, type WebfakeQuirks, type WebfakeServer } from "../../webfake";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function tempDir(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  cleanups.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

interface Harness {
  ws: string;
  stateDir: string;
  server: WebfakeServer;
  store: ReturnType<typeof createSyncStateStore>;
  run: (signal?: AbortSignal, onProgress?: (p: SyncProgress) => void) => Promise<SyncReport>;
  /** 某文件的基准记录(状态表里必须有)。 */
  recordOf: (rel: string) => Promise<SyncFileRecord>;
  /** 自某次快照以来的请求(断言「零传输」用)。 */
  since: (mark: number) => WebfakeServer["requests"];
}

async function harness(
  over: {
    thresholds?: Partial<SyncThresholds>;
    attempts?: number;
    delayMs?: number;
    timeoutMs?: number;
    quirks?: WebfakeQuirks;
  } = {},
): Promise<Harness> {
  const ws = await tempDir("confidant-sync-ws-");
  const stateDir = await tempDir("confidant-sync-state-");
  const quirks: WebfakeQuirks = {
    ...(over.quirks ?? {}),
    ...(over.delayMs ? { delayMs: over.delayMs } : {}),
  };
  const server = await startWebfakeServer({ quirks });
  server.mkdirp("/dav/notes");
  cleanups.push(() => server.close());

  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });
  const client = createWebdavClient({
    baseUrl: `${server.url}/dav/notes`,
    username: "u",
    password: "p",
    timeoutMs: over.timeoutMs ?? 5000,
  });
  const engine: SyncEngine = createSyncEngine({
    config: {
      workspacePath: ws,
      remoteBaseUrl: `${server.url}/dav/notes`,
      thresholds: { ...DEFAULT_SYNC_THRESHOLDS, ...over.thresholds },
      retry: { ...DEFAULT_SYNC_RETRY, attempts: over.attempts ?? 0, baseDelayMs: 0 },
    },
    deps: { createClient: () => client, trashFile: async () => undefined },
    store,
  });
  return {
    ws,
    stateDir,
    server,
    store,
    run: (s, p) => engine.run(s, p),
    recordOf: async (rel) => {
      const st = await store.load();
      const rec = st?.records[rel];
      if (!rec) throw new Error(`状态表里没有 ${rel} 的记录`);
      return rec;
    },
    since: (mark) => server.requests.slice(mark),
  };
}

const WS_PATH = "/dav/notes";

async function writeWs(ws: string, rel: string, content: string): Promise<void> {
  const abs = join(ws, rel.replace(/\//g, "\\"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function readWs(ws: string, rel: string): Promise<string> {
  return readFile(join(ws, rel.replace(/\//g, "\\")), "utf8");
}

async function mtimeMs(ws: string, rel: string): Promise<number> {
  return (await stat(join(ws, rel.replace(/\//g, "\\")))).mtimeMs;
}

function remoteText(server: WebfakeServer, rel: string): string | undefined {
  const b = server.getFile(`${WS_PATH}/${rel}`);
  return b ? new TextDecoder().decode(b) : undefined;
}

function methods(entries: WebfakeServer["requests"], method: string): string[] {
  return entries.filter((e) => e.method === method).map((e) => e.path);
}

// ─── A. 传输最少化与「hash 才是权威」 ──────────────────────────────────────

describe("A. 变更判定:传输最少化与 hash 权威", () => {
  it("A1 仅本地修改 → 只上传该文件,其余零传输(无 GET)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "v1");
    await writeWs(h.ws, "b.md", "same");
    h.server.putFile(`${WS_PATH}/b.md`, "same");
    await h.run(); // 建基准

    await writeWs(h.ws, "a.md", "v2");
    const mark = h.server.requests.length;
    const r = await h.run();
    const delta = h.since(mark);

    expect(r.uploaded).toBe(1);
    expect(methods(delta, "PUT")).toEqual([`${WS_PATH}/a.md`]);
    expect(methods(delta, "GET")).toEqual([]); // 未变的 b.md 不 GET
    expect(remoteText(h.server, "a.md")).toBe("v2");
    expect(await readWs(h.ws, "b.md")).toBe("same");
  });

  it("A2 仅远端修改 → 只下载该文件,其余零传输(无 PUT)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "v1");
    await writeWs(h.ws, "b.md", "keep");
    await h.run();

    h.server.putFile(`${WS_PATH}/a.md`, "v2-remote"); // 远端内容已变
    const mark = h.server.requests.length;
    const r = await h.run();
    const delta = h.since(mark);

    expect(r.downloaded).toBe(1);
    expect(methods(delta, "GET")).toEqual([`${WS_PATH}/a.md`]);
    expect(methods(delta, "PUT")).toEqual([]);
    expect(await readWs(h.ws, "a.md")).toBe("v2-remote");
    expect(await readWs(h.ws, "b.md")).toBe("keep");
  });

  it("A3 两侧都未改 → 零传输:不 GET、不 PUT、不写盘", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "same-bytes");
    h.server.putFile(`${WS_PATH}/a.md`, "same-bytes");
    await h.run(); // 保守合并:GET 确认一次并记基准

    const mtimeBefore = await mtimeMs(h.ws, "a.md");
    const mark = h.server.requests.length;
    const r = await h.run();
    const delta = h.since(mark);

    expect(r).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 });
    expect(methods(delta, "GET")).toEqual([]);
    expect(methods(delta, "PUT")).toEqual([]);
    expect(await mtimeMs(h.ws, "a.md")).toBe(mtimeBefore); // 未写盘
  });

  it("A4 验证符变了但内容没变 → 下载确认后 hash 相同 ⇒ 只更新状态表,不写盘", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "stable");
    h.server.putFile(`${WS_PATH}/a.md`, "stable", { etag: '"E1"', lastModified: "T1" });
    await h.run();
    const hashBefore = (await h.recordOf("a.md")).baseHash;
    const mtimeBefore = await mtimeMs(h.ws, "a.md");

    h.server.setEtag(`${WS_PATH}/a.md`, '"E2"'); // 只改验证符,内容与时间不动
    const mark = h.server.requests.length;
    const r = await h.run();
    const delta = h.since(mark);

    expect(r).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 });
    expect(methods(delta, "GET")).toEqual([`${WS_PATH}/a.md`]); // 下载确认确实发生
    expect(await readWs(h.ws, "a.md")).toBe("stable");
    expect(await mtimeMs(h.ws, "a.md")).toBe(mtimeBefore); // 未写盘
    const rec = await h.recordOf("a.md");
    expect(rec.baseHash).toBe(hashBefore); // 基准 hash 不变
    expect(rec.etag).toBe('"E2"'); // 状态表更新到新验证符
  });

  it("A5【核心】验证符没变但内容变了 → 仍下载确认并发现变化(绝不静默丢内容)", async () => {
    // 构造「验证符相同、内容已变」的服务端——真实形态:mod_deflate 改写验证符、
    // 或时间戳粒度问题。这里让远端内容被覆盖、**长度不变、验证符原样保持**,
    // 唯一变化的是修改时间。若引擎只看验证符就会跳过 ⇒ 静默丢内容。
    const h = await harness();
    await writeWs(h.ws, "a.md", "AAAA");
    h.server.putFile(`${WS_PATH}/a.md`, "AAAA", {
      etag: '"FIXED"',
      lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
    });
    await h.run();
    const recBefore = await h.recordOf("a.md");

    h.server.putFile(`${WS_PATH}/a.md`, "BBBB", {
      etag: '"FIXED"', // 验证符刻意不变
      lastModified: "Mon, 01 Jan 2024 00:01:00 GMT", // 只有时间变了
    });
    // 先坐实「验证符与大小都未变」:唯一信号是修改时间
    const after = h.server.stat(`${WS_PATH}/a.md`)!;
    expect(after.etag).toBe(recBefore.etag);
    expect(after.size).toBe(recBefore.remoteSize);

    const mark = h.server.requests.length;
    const r = await h.run();
    const delta = h.since(mark);

    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("BBBB"); // 内容没丢
    expect(methods(delta, "GET")).toEqual([`${WS_PATH}/a.md`]);
  });

  it("A6 协议固有上限:验证符/时间/大小三者全等时无法探测(本用例记录边界,非保护)", async () => {
    // 三信号完全一致 ⇒ 引擎无从感知远端内容被动过。这是 WebDAV 的固有上限
    // (Nextcloud「同一秒内覆盖且验证符不变」的极端形态),记录在案以便票 08 复核。
    const h = await harness();
    await writeWs(h.ws, "a.md", "AAAA");
    h.server.putFile(`${WS_PATH}/a.md`, "AAAA", { etag: '"FIXED"', lastModified: "T" });
    await h.run();

    h.server.putFile(`${WS_PATH}/a.md`, "BBBB", { etag: '"FIXED"', lastModified: "T" });
    const r = await h.run();

    expect(r.downloaded).toBe(0); // 无任何信号 ⇒ 不下载
    expect(await readWs(h.ws, "a.md")).toBe("AAAA"); // 本地保持(此处演示上限,不是保护)
  });
});

// ─── B. 服务端不返回验证符:退化到「修改时间 + 大小」 ──────────────────────

describe("B. 无验证符服务端(Alist 形态)退化到 修改时间 + 大小", () => {
  it("B1 大小变了 → 下载;随后不变 → 零传输", async () => {
    const h = await harness({ quirks: { omitEtag: true } });
    await writeWs(h.ws, "a.md", "v1");
    await h.run();
    expect((await h.recordOf("a.md")).etag).toBeNull(); // 从没拿到验证符

    h.server.putFile(`${WS_PATH}/a.md`, "v2-longer"); // 长度不同
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("v2-longer");

    const mark = h.server.requests.length;
    const r2 = await h.run();
    expect(r2).toMatchObject({ downloaded: 0, uploaded: 0 });
    expect(methods(h.since(mark), "GET")).toEqual([]);
  });

  it("B2 大小相同、修改时间不同 → 仍下载(退化为时间判定)", async () => {
    const h = await harness({ quirks: { omitEtag: true } });
    await writeWs(h.ws, "a.md", "AAAA");
    h.server.putFile(`${WS_PATH}/a.md`, "AAAA", { lastModified: "Mon, 01 Jan 2024 00:00:00 GMT" });
    await h.run();

    h.server.putFile(`${WS_PATH}/a.md`, "BBBB", { lastModified: "Mon, 01 Jan 2024 00:01:00 GMT" });
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("BBBB");
  });

  it("B3 修改时间与大小都没变 → 不下载(正常跳过路径)", async () => {
    const h = await harness({ quirks: { omitEtag: true } });
    await writeWs(h.ws, "a.md", "same");
    h.server.putFile(`${WS_PATH}/a.md`, "same", { lastModified: "T" });
    await h.run();

    const mark = h.server.requests.length;
    const r = await h.run();
    expect(r).toMatchObject({ downloaded: 0, uploaded: 0 });
    expect(methods(h.since(mark), "GET")).toEqual([]);
  });
});

// ─── C. 弱验证符与引号:按不透明字符串比较 ─────────────────────────────────

describe("C. 弱验证符与引号:按不透明字符串比较,不解析语义", () => {
  it("C1 弱验证符 W/\"...\" 原样存储;远端一变即下载", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "v1");
    h.server.putFile(`${WS_PATH}/a.md`, "v1", { etag: 'W/"weak1"' });
    await h.run();
    expect((await h.recordOf("a.md")).etag).toBe('W/"weak1"'); // 原样,不剥离 W/

    h.server.putFile(`${WS_PATH}/a.md`, "v2", { etag: 'W/"weak2"' });
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("v2");
  });

  it("C2 服务端去掉引号 → 按字符串比较触发一次探测;hash 同只更新状态表;形态稳定后停止探测", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "hello");
    h.server.putFile(`${WS_PATH}/a.md`, "hello", { etag: '"abc"', lastModified: "T" });
    await h.run();

    h.server.setEtag(`${WS_PATH}/a.md`, "abc"); // 去引号,内容与时间不动
    const mark = h.server.requests.length;
    const r = await h.run();
    expect(r).toMatchObject({ downloaded: 0, uploaded: 0 });
    expect(methods(h.since(mark), "GET")).toEqual([`${WS_PATH}/a.md`]); // 不归一化 ⇒ 保守探测
    expect((await h.recordOf("a.md")).etag).toBe("abc"); // 原样记住新形态

    const mark2 = h.server.requests.length;
    await h.run(); // 形态稳定后不再探测
    expect(methods(h.since(mark2), "GET")).toEqual([]);
  });
});

// ─── D. 决议 48/49:条件写与超时 ────────────────────────────────────────────

describe("D. 决议 48/49:If-None-Match 创建保护、If-Match 尽力而为、请求超时", () => {
  it("D1 新建上传带 If-None-Match: *(保护创建)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "new");
    await h.run();
    const put = h.server.requests.find((q) => q.method === "PUT")!;
    expect(put.ifNoneMatch).toBe("*");
    expect(put.ifMatch).toBeNull();
  });

  it("D2 已存在文件的本地修改上传带 If-Match(尽力而为)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "v1");
    await h.run();
    const rec = await h.recordOf("a.md");
    await writeWs(h.ws, "a.md", "v2");

    const mark = h.server.requests.length;
    await h.run();
    const put = h.since(mark).find((q) => q.method === "PUT")!;
    expect(put.ifMatch).toBe(rec.etag);
    expect(put.ifNoneMatch).toBeNull();
  });

  it("D3 服务端忽略 If-Match(不支持条件写)→ 结果仍正确(不作为正确性保证)", async () => {
    // 回归护栏:服务端完全不支持条件写时,上传仍须落地。正确性不来自 If-Match,
    // 而来自「同步前的状态比对 + 上传后回读校验大小」(决议 47/48)。
    const h = await harness({ quirks: { ignoreIfMatch: true } });
    await writeWs(h.ws, "a.md", "v1");
    await h.run();
    await writeWs(h.ws, "a.md", "v2");
    const r = await h.run();
    expect(r.uploaded).toBe(1);
    expect(r.failed).toEqual([]);
    expect(remoteText(h.server, "a.md")).toBe("v2");
  });

  it("D4 请求超时 → 整体失败(WebdavError timeout)", async () => {
    const h = await harness({ delayMs: 200, timeoutMs: 40 });
    await writeWs(h.ws, "a.md", "x");
    let caught: unknown;
    try {
      await h.run();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WebdavError);
    expect((caught as WebdavError).kind).toBe("timeout");
  });
});

// ─── E. 每次同步重新列举远端(决议 45) ────────────────────────────────────

describe("E. 每次同步重新列举远端(不跨次缓存)", () => {
  it("E1 第二次同步重新列举,发现期间新增的远端文件并下载", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "local");
    await h.run();

    h.server.putFile(`${WS_PATH}/later.md`, "REMOTE-NEW"); // 同步之间远端新增
    const mark = h.server.requests.length;
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, "later.md")).toBe("REMOTE-NEW");
    // 确实重新列举了(PROPFIND 再次发生)
    expect(methods(h.since(mark), "PROPFIND").length).toBeGreaterThan(0);
  });
});
