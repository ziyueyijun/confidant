// @vitest-environment node
// 同步引擎:决策表矩阵 + 排除/符号链接/上限/取消/锁/进度 + 增量。
// 真临时目录 + webfake 真服务器(不写假客户端);断言的是「本地/远端/状态表三方
// 初始状态 → 同步后三方终态与报告」。

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  SyncBusyError,
  type SyncEngine,
  type SyncProgress,
  type SyncReport,
  type SyncThresholds,
} from "../index";
import { createWebdavClient } from "../client";
import { startWebfakeServer, type WebfakeServer } from "../../webfake";

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
  engine: SyncEngine;
  run: (signal?: AbortSignal, onProgress?: (p: SyncProgress) => void) => Promise<SyncReport>;
}

async function harness(
  over: {
    thresholds?: Partial<SyncThresholds>;
    attempts?: number;
    lockDir?: string;
    delayMs?: number;
  } = {},
): Promise<Harness> {
  const ws = await tempDir("confidant-sync-ws-");
  const stateDir = await tempDir("confidant-sync-state-");
  const server = await startWebfakeServer(over.delayMs ? { quirks: { delayMs: over.delayMs } } : {});
  server.mkdirp("/dav/notes");
  cleanups.push(() => server.close());

  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });
  const client = createWebdavClient({
    baseUrl: `${server.url}/dav/notes`,
    username: "u",
    password: "p",
    timeoutMs: 5000,
  });
  const engine = createSyncEngine({
    config: {
      workspacePath: ws,
      remoteBaseUrl: `${server.url}/dav/notes`,
      thresholds: { ...DEFAULT_SYNC_THRESHOLDS, ...over.thresholds },
      retry: { ...DEFAULT_SYNC_RETRY, attempts: over.attempts ?? 0, baseDelayMs: 0 },
    },
    deps: { createClient: () => client, trashFile: async () => undefined },
    store,
    lockDir: over.lockDir,
  });
  return { ws, stateDir, server, store, engine, run: (s, p) => engine.run(s, p) };
}

async function writeWs(ws: string, rel: string, content: string): Promise<void> {
  const abs = join(ws, rel.replace(/\//g, "\\"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function readWs(ws: string, rel: string): Promise<string> {
  return readFile(join(ws, rel.replace(/\//g, "\\")), "utf8");
}

function remoteText(server: WebfakeServer, rel: string): string | undefined {
  const b = server.getFile(`/dav/notes/${rel}`);
  return b ? new TextDecoder().decode(b) : undefined;
}

// ─── 保守合并矩阵(load() === null) ────────────────────────────────────────

describe("首次同步(保守合并:绝不删除)", () => {
  it("本地无、远端有 → 下载(逐级建目录)", async () => {
    const h = await harness();
    h.server.putFile("/dav/notes/sub/deep/a.md", "hello");
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(r.uploaded).toBe(0);
    expect(r.conflicts).toBe(0);
    expect(await readWs(h.ws, "sub/deep/a.md")).toBe("hello");
    expect((await h.store.load())!.records["sub/deep/a.md"]).toBeDefined();
  });

  it("本地有、远端无 → 上传(含子目录逐级创建)", async () => {
    const h = await harness();
    await writeWs(h.ws, "sub/deep/a.md", "hello");
    const r = await h.run();
    expect(r.uploaded).toBe(1);
    expect(r.downloaded).toBe(0);
    expect(remoteText(h.server, "sub/deep/a.md")).toBe("hello");
    expect((await h.store.load())!.records["sub/deep/a.md"]).toBeDefined();
  });

  it("同名同内容 → 视为已同步,只记基准,不重复传输", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "same-bytes");
    h.server.putFile("/dav/notes/a.md", "same-bytes");
    const r = await h.run();
    expect(r.uploaded).toBe(0);
    expect(r.downloaded).toBe(0);
    expect(r.conflicts).toBe(0);
    const rec = (await h.store.load())!.records["a.md"]!;
    expect(rec.relPath).toBe("a.md");
    expect(rec.baseHash).toHaveLength(64);
    // 未产生写:无 PUT,也未把本地文件覆盖写回磁盘
    expect(h.server.requests.some((q) => q.method === "PUT")).toBe(false);
  });

  it("同名不同内容 → 两份都保留(远端版本落成冲突副本),两侧各两版", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "LOCAL-VERSION");
    h.server.putFile("/dav/notes/a.md", "REMOTE-VERSION");
    const r = await h.run();
    expect(r.conflicts).toBe(1);
    // 本地主名保持本地版本不变
    expect(await readWs(h.ws, "a.md")).toBe("LOCAL-VERSION");
    // 本地出现冲突副本,内容为远端版本
    const copyName = (await readdir(h.ws)).find((f) => f.includes("冲突 来自远端"));
    expect(copyName).toBeTruthy();
    expect(await readWs(h.ws, copyName!)).toBe("REMOTE-VERSION");
    // 远端:主名=本地版本,副本=远端版本
    expect(remoteText(h.server, "a.md")).toBe("LOCAL-VERSION");
    expect(remoteText(h.server, copyName!)).toBe("REMOTE-VERSION");
  });

  it("两侧皆无(空工作区 + 空远端)→ 无事", async () => {
    const h = await harness();
    const r = await h.run();
    expect(r).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0, skipped: [], failed: [] });
  });

  it("空工作区、远端有一堆文件 → 全部下载", async () => {
    const h = await harness();
    h.server.putFile("/dav/notes/a.md", "1");
    h.server.putFile("/dav/notes/dir/b.md", "2");
    const r = await h.run();
    expect(r.downloaded).toBe(2);
    expect(await readWs(h.ws, "dir/b.md")).toBe("2");
  });

  it("空远端、本地有一堆文件 → 全部上传", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "1");
    await writeWs(h.ws, "x/y/b.md", "2");
    const r = await h.run();
    expect(r.uploaded).toBe(2);
    expect(remoteText(h.server, "x/y/b.md")).toBe("2");
  });

  it("首次同步后再次同步:稳定,无新增传输(含冲突文件)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "LOCAL");
    h.server.putFile("/dav/notes/a.md", "REMOTE");
    await h.run();
    const r2 = await h.run();
    expect(r2.uploaded).toBe(0);
    expect(r2.downloaded).toBe(0);
    expect(r2.conflicts).toBe(0);
  });

  it("状态表损坏 → 退化为无状态表(保守合并),不删任何远端文件", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "hello");
    await h.run(); // 先建状态表
    const stateFile = (await readdir(h.stateDir))[0]!;
    await writeFile(join(h.stateDir, stateFile), "{ 这不是 JSON", "utf8");
    expect(await h.store.load()).toBeNull();
    // 本机删掉 a.md(模拟「本地已删」);保守合并应把远端那份拉回来,绝不删远端
    await rm(join(h.ws, "a.md"));
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(remoteText(h.server, "a.md")).toBe("hello");
    expect(await readWs(h.ws, "a.md")).toBe("hello");
  });
});

// ─── 排除 / 符号链接 / 上限 ────────────────────────────────────────────────

describe("范围与排除(决议 16–18)", () => {
  it("硬排除名单:点开头条目 + Thumbs.db/desktop.ini + 原子写临时文件", async () => {
    const h = await harness();
    await writeWs(h.ws, "keep.md", "keep");
    await writeWs(h.ws, ".git/config", "x");
    await writeWs(h.ws, ".hidden.md", "x");
    await writeWs(h.ws, ".keep.md.confidant-tmp-1-abcd", "x");
    await writeWs(h.ws, "Thumbs.db", "x");
    await writeWs(h.ws, "desktop.ini", "x");
    // 远端也放一份点开头条目,确保不被下载
    h.server.putFile("/dav/notes/.remote-hidden.md", "x");
    h.server.putFile("/dav/notes/remote-keep.md", "y");

    const r = await h.run();
    expect(r.uploaded).toBe(1);
    expect(remoteText(h.server, "keep.md")).toBe("keep");
    // 本地点开头条目一律不上传
    for (const excluded of [".git/config", ".hidden.md", "Thumbs.db", "desktop.ini", ".keep.md.confidant-tmp-1-abcd"]) {
      expect(remoteText(h.server, excluded)).toBeUndefined();
    }
    // 远端点开头条目一律不下载
    await expect(readWs(h.ws, ".remote-hidden.md")).rejects.toBeTruthy();
    // 远端普通文件照常下载
    expect(await readWs(h.ws, "remote-keep.md")).toBe("y");
  });

  it("符号链接不跟随、跳过并报告", async (ctx) => {
    const h = await harness();
    const outside = await tempDir("confidant-sync-outside-");
    await writeFile(join(outside, "secret.txt"), "SECRET", "utf8");
    await writeWs(h.ws, "real.md", "real");
    try {
      await symlink(join(outside, "secret.txt"), join(h.ws, "link.md"), "file");
    } catch {
      ctx.skip(); // Windows 无权限创建符号链接
      return;
    }
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath)).toContain("link.md");
    expect(r.uploaded).toBe(1);
    // 链接目标绝不外传
    expect(remoteText(h.server, "link.md")).toBeUndefined();
    expect(remoteText(h.server, "secret.txt")).toBeUndefined();
  });

  it("单文件上限:本地与远端超限文件均跳过并报告,不算失败/成功", async () => {
    const h = await harness({ thresholds: { maxFileSizeBytes: 4 } });
    await writeWs(h.ws, "small.md", "1234");
    await writeWs(h.ws, "big-local.md", "12345");
    h.server.putFile("/dav/notes/big-remote.md", "123456");
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath).sort()).toEqual(["big-local.md", "big-remote.md"]);
    expect(r.uploaded).toBe(1);
    expect(r.downloaded).toBe(0);
    expect(r.failed).toHaveLength(0);
    expect(remoteText(h.server, "big-local.md")).toBeUndefined();
    await expect(readWs(h.ws, "big-remote.md")).rejects.toBeTruthy();
  });
});

// ─── 进度 / 取消 / 锁 ──────────────────────────────────────────────────────

describe("进度、取消与锁", () => {
  it("进度:回调收到递增的 done,末次 done === total", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "1");
    await writeWs(h.ws, "b.md", "2");
    const seen: SyncProgress[] = [];
    const r = await h.run(undefined, (p) => seen.push({ ...p }));
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1]!;
    expect(last.done).toBe(last.total);
    expect(last.total).toBe(2);
    expect(r.uploaded).toBe(2);
  });

  it("取消:已中止的信号 → 立即停下,不产生传输,返回 0 计数", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "1");
    const ac = new AbortController();
    ac.abort();
    const r = await h.run(ac.signal);
    expect(r.uploaded).toBe(0);
    expect(remoteText(h.server, "a.md")).toBeUndefined();
  });

  it("锁:同一工作区第二个同步被拒(SyncBusyError)", async () => {
    const lockDir = await tempDir("confidant-sync-lock-");
    const h = await harness({ lockDir, delayMs: 60 });
    await writeWs(h.ws, "a.md", "1");
    const first = h.run();
    await new Promise((r) => setTimeout(r, 25)); // 让第一个取到锁并进入网络等待
    await expect(h.run()).rejects.toBeInstanceOf(SyncBusyError);
    await first;
    // 第一个释放后,可再次取锁
    await expect(h.run()).resolves.toBeTruthy();
  });
});

// ─── 增量(最小实现;票 03 细化) ─────────────────────────────────────────

describe("增量同步(状态表存在时)", () => {
  it("仅本地修改 → 只上传该文件", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "v1");
    await writeWs(h.ws, "b.md", "same");
    h.server.putFile("/dav/notes/b.md", "same");
    await h.run();
    await writeWs(h.ws, "a.md", "v2");
    const r = await h.run();
    expect(r.uploaded).toBe(1);
    expect(remoteText(h.server, "a.md")).toBe("v2");
  });

  it("仅远端修改 → 只下载该文件", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "v1");
    await writeWs(h.ws, "b.md", "keep");
    await h.run();
    h.server.putFile("/dav/notes/a.md", "v2-remote");
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("v2-remote");
    expect(await readWs(h.ws, "b.md")).toBe("keep");
  });

  it("两侧都改且内容不同 → 保留双份", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await h.run();
    await writeWs(h.ws, "a.md", "local-2");
    h.server.putFile("/dav/notes/a.md", "remote-2");
    const r = await h.run();
    expect(r.conflicts).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("local-2");
    const copyName = (await readdir(h.ws)).find((f) => f.includes("冲突 来自远端"))!;
    expect(await readWs(h.ws, copyName)).toBe("remote-2");
  });

  it("本地删除 → 远端对应文件被删除(删除传播;票 05)", async () => {
    // 阈值放宽:本用例只验证传播本身;熔断与闸门见 deletion.test.ts。
    const h = await harness({ thresholds: { deleteGuardMax: 100, deleteGuardRatio: 1 } });
    await writeWs(h.ws, "a.md", "x");
    await h.run();
    await rm(join(h.ws, "a.md"));
    const r = await h.run();
    expect(r.deletedRemote).toBe(1);
    expect(r.deletedLocal).toBe(0);
    expect(remoteText(h.server, "a.md")).toBeUndefined(); // 远端已删
  });
});
