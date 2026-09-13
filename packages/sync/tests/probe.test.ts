// @vitest-environment node
// 启动只读探测(票 07;规格决议 8)。
//
// 真临时目录 + webfake 真服务器(不写假客户端)。断言:有变更 → 亮;无变更 → 不亮;
// 探测失败(离线 / 认证失败 / 目录不可达)→ 静默降级不抛;未配置 → 零网络请求;
// 不做轮询(一次探测只建一个客户端、只列举一次远端根)。另断言探测**只读**:
// 状态表字节不变。

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  probeRemoteChanges,
  type SyncProbeResult,
  type SyncStateStore,
} from "../index";
import { createWebdavClient } from "../client";
import {
  startWebfakeServer,
  type WebfakeCredentials,
  type WebfakeQuirks,
  type WebfakeServer,
} from "../../webfake";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function tempDir(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  cleanups.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

const DAV = "/dav/notes";

interface Harness {
  ws: string;
  stateDir: string;
  server: WebfakeServer;
  store: SyncStateStore;
  baseUrl: string;
  /** 探测;createClient 调用计数可查(不做轮询断言用)。 */
  probe: (override?: { remoteBaseUrl: string | null }) => Promise<SyncProbeResult>;
  createClientCalls: () => number;
  /** 跑一次真同步(建基准状态表用)。 */
  run: () => Promise<unknown>;
}

async function harness(
  over: {
    quirks?: WebfakeQuirks;
    credentials?: WebfakeCredentials | null;
    clientPassword?: string;
  } = {},
): Promise<Harness> {
  const ws = await tempDir("confidant-probe-ws-");
  const stateDir = await tempDir("confidant-probe-state-");
  const server = await startWebfakeServer({
    quirks: over.quirks,
    credentials: over.credentials,
  });
  server.mkdirp(DAV);
  cleanups.push(() => server.close());

  const baseUrl = `${server.url}${DAV}`;
  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });
  let calls = 0;
  const makeClient = (): ReturnType<typeof createWebdavClient> => {
    calls++;
    return createWebdavClient({
      baseUrl,
      username: over.credentials?.username ?? "u",
      password: over.clientPassword ?? over.credentials?.password ?? "p",
      timeoutMs: 3000,
    });
  };

  const engine = createSyncEngine({
    config: {
      workspacePath: ws,
      remoteBaseUrl: baseUrl,
      thresholds: DEFAULT_SYNC_THRESHOLDS,
      retry: { ...DEFAULT_SYNC_RETRY, attempts: 0, baseDelayMs: 0 },
    },
    deps: { createClient: () => makeClient(), trashFile: async () => undefined },
    store,
  });

  return {
    ws,
    stateDir,
    server,
    store,
    baseUrl,
    createClientCalls: () => calls,
    run: () => engine.run(),
    probe: (override) => {
      const target = override ? override.remoteBaseUrl : baseUrl;
      return probeRemoteChanges({
        remoteBaseUrl: target,
        store,
        createClient: () => makeClient(),
      });
    },
  };
}

async function writeWs(ws: string, rel: string, content: string): Promise<void> {
  const abs = join(ws, rel.replace(/\//g, "\\"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

/** 状态目录里唯一的文件内容与 mtime(「探测只读」断言用)。 */
async function stateFileSnapshot(stateDir: string): Promise<{ bytes: string; mtimeMs: number } | null> {
  const names = await readdir(stateDir);
  const name = names[0];
  if (!name) return null;
  const p = join(stateDir, name);
  return { bytes: await readFile(p, "utf8"), mtimeMs: (await stat(p)).mtimeMs };
}

// ─── A. 有变更 → 圆点亮 ─────────────────────────────────────────────────────

describe("A. 有本机未知变更 → hasUnknownChanges", () => {
  it("A1 无状态表 + 远端非空:每个远端条目都算「本机未知」", async () => {
    const h = await harness();
    h.server.putFile(`${DAV}/a.md`, "one");
    h.server.putFile(`${DAV}/b.md`, "two");

    const r = await h.probe();
    expect(r.status).toBe("checked");
    expect(r.hasUnknownChanges).toBe(true);
    expect(r.changeCount).toBe(2);
  });

  it("A2 有状态表但远端新增条目 → 亮", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    h.server.putFile(`${DAV}/a.md`, "one");
    await h.run(); // 两侧一致,建基准(只记 a.md)

    h.server.putFile(`${DAV}/b.md`, "brand-new"); // 远端新增
    const r = await h.probe();
    expect(r.hasUnknownChanges).toBe(true);
    expect(r.changeCount).toBe(1);
  });

  it("A3 有状态表且远端条目已变(复用 remoteEntryChanged)→ 亮", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    h.server.putFile(`${DAV}/a.md`, "one");
    await h.run();

    h.server.putFile(`${DAV}/a.md`, "one-changed"); // 远端内容/时间/大小变
    const r = await h.probe();
    expect(r.hasUnknownChanges).toBe(true);
    expect(r.changeCount).toBe(1);
  });

  it("A4 有状态表且远端**删掉**了有记录的文件 → 亮(对称的一半)", async () => {
    // 只遍历远端存在的条目会漏掉删除:圆点永远不亮,用户在手动同步前毫无提示。
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    await writeWs(h.ws, "b.md", "two");
    h.server.putFile(`${DAV}/a.md`, "one");
    h.server.putFile(`${DAV}/b.md`, "two");
    await h.run(); // 建基准:a.md + b.md

    h.server.removeFile(`${DAV}/b.md`); // 另一端删了 b.md
    const r = await h.probe();
    expect(r.hasUnknownChanges).toBe(true);
    expect(r.changeCount).toBe(1); // 恰好 b.md 这一个「远端已无」
  });

  it("A5 本机新记录的文件远端从未有过 → 不算「远端删除」的误报", async () => {
    // 未同步过的本地新文件不产生记录,故不该被算成远端删除。
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    h.server.putFile(`${DAV}/a.md`, "one");
    await h.run();
    await writeWs(h.ws, "local-only.md", "not yet synced"); // 本地新增,未同步

    const r = await h.probe();
    expect(r.hasUnknownChanges).toBe(false);
    expect(r.changeCount).toBe(0);
  });
});

// ─── B. 无变更 → 圆点不亮 ───────────────────────────────────────────────────

describe("B. 无本机未知变更 → 不亮", () => {
  it("B1 状态表与远端一致(引擎刚跑过)→ 不亮", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    await writeWs(h.ws, "sub/b.md", "two");
    h.server.putFile(`${DAV}/a.md`, "one");
    h.server.putFile(`${DAV}/sub/b.md`, "two");
    await h.run();

    const r = await h.probe();
    expect(r.status).toBe("checked");
    expect(r.hasUnknownChanges).toBe(false);
    expect(r.changeCount).toBe(0);
  });

  it("B2 空远端 + 有状态表 → 不亮", async () => {
    const h = await harness();
    const r = await h.probe();
    expect(r.hasUnknownChanges).toBe(false);
    expect(r.changeCount).toBe(0);
  });
});

// ─── C. 探测失败 → 静默降级,不抛 ───────────────────────────────────────────

describe("C. 探测失败 → status=failed,不抛、不亮", () => {
  it("C1 离线(地址不可达)→ 静默降级", async () => {
    const h = await harness();
    // 起一个服务器拿到端口再关掉 → 该端口随后必然拒绝连接。
    const dead = await startWebfakeServer({});
    const deadUrl = `${dead.url}${DAV}`;
    await dead.close();

    const r = await probeRemoteChanges({
      remoteBaseUrl: deadUrl,
      store: h.store,
      createClient: () =>
        createWebdavClient({ baseUrl: deadUrl, username: "u", password: "p", timeoutMs: 800 }),
    });
    expect(r.status).toBe("failed");
    expect(r.hasUnknownChanges).toBe(false);
  });

  it("C2 认证失败 → 静默降级(不重试、不抛)", async () => {
    const h = await harness({
      credentials: { username: "u", password: "secret" },
      clientPassword: "wrong",
    });
    h.server.putFile(`${DAV}/a.md`, "one");

    const r = await h.probe();
    expect(r.status).toBe("failed");
    expect(r.hasUnknownChanges).toBe(false);
  });

  it("C3 目录不可达(列举返回 500)→ 静默降级", async () => {
    const h = await harness({ quirks: { listingStatus: 500 } });
    h.server.putFile(`${DAV}/a.md`, "one");

    const r = await h.probe();
    expect(r.status).toBe("failed");
    expect(r.hasUnknownChanges).toBe(false);
  });
});

// ─── D. 未配置同步 → 零网络请求 ─────────────────────────────────────────────

describe("D. 未配置同步 → 零网络请求", () => {
  for (const empty of [null, "", "   "]) {
    it(`D remoteBaseUrl=${JSON.stringify(empty)} → not-configured,不建客户端、零请求`, async () => {
      const h = await harness();
      h.server.putFile(`${DAV}/a.md`, "one");
      const before = h.server.requests.length;

      const r = await h.probe({ remoteBaseUrl: empty });
      expect(r.status).toBe("not-configured");
      expect(r.hasUnknownChanges).toBe(false);
      expect(h.createClientCalls()).toBe(0); // 客户端工厂未被调用
      expect(h.server.requests.length).toBe(before); // 零网络请求
    });
  }
});

// ─── E. 不做轮询:一次探测 = 一个客户端 + 一次根列举 ────────────────────────

describe("E. 不做轮询", () => {
  it("E1 一次探测只建一个客户端、只列举一次远端根(无重复请求)", async () => {
    const h = await harness();
    h.server.putFile(`${DAV}/a.md`, "one"); // 扁平远端:根列举一次即够
    const mark = h.createClientCalls();

    await h.probe();

    expect(h.createClientCalls() - mark).toBe(1); // 只建一个客户端
    const rootLists = h.server.requests.filter(
      (e) => e.method === "PROPFIND" && (e.path === DAV || e.path === `${DAV}/`),
    );
    expect(rootLists.length).toBe(1); // 只列举一次远端根
  });
});

// ─── F. 只读:探测不改状态表 ────────────────────────────────────────────────

describe("F. 探测只读", () => {
  it("F1 探测前后状态表字节与 mtime 不变", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    h.server.putFile(`${DAV}/a.md`, "one");
    await h.run();

    const before = await stateFileSnapshot(h.stateDir);
    expect(before).not.toBeNull();
    await h.probe();
    const after = await stateFileSnapshot(h.stateDir);
    expect(after).toEqual(before);
  });
});
