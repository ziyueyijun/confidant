// @vitest-environment node
// 票 06:边界与失败处理(决议 17–19、41–43、58–62、64)。
//
// 真临时目录 + webfake 真服务器;断言的是「本地 / 远端 / 状态表三方初始状态 → 同步后
// 三方终态与报告」。本文件重点:
//   · 边界条目(非法字符 / 大小写冲突 / 超长路径 / 上限 / 未知类型)跳过并报告,
//     **跳过的绝不算作成功**,也绝不因「跳过 = 缺失」而把另一侧的文件当删除处理掉;
//   · 单文件重试 2 次后放弃、其他文件继续;部分失败的计数口径;
//   · 认证失败立即停、不重试;错误原因与日志不含密码;
//   · 取消(关窗/切工作区的中断底座):已完成进度落盘、未完成不判定。

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  classifyLocalDirent,
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  exceedsWindowsPathLimit,
  SyncFatalError,
  WINDOWS_MAX_PATH_CHARS,
  type SyncEngine,
  type SyncProgress,
  type SyncReport,
  type SyncThresholds,
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

const WS_PATH = "/dav/notes";

interface Harness {
  ws: string;
  server: WebfakeServer;
  store: ReturnType<typeof createSyncStateStore>;
  trashed: string[];
  logs: string[];
  run: (signal?: AbortSignal, onProgress?: (p: SyncProgress) => void) => Promise<SyncReport>;
}

async function harness(
  over: {
    thresholds?: Partial<SyncThresholds>;
    attempts?: number;
    quirks?: WebfakeQuirks;
    credentials?: WebfakeCredentials;
    clientPassword?: string;
    redact?: (t: string) => string;
  } = {},
): Promise<Harness> {
  const ws = await tempDir("confidant-sync-bnd-ws-");
  const stateDir = await tempDir("confidant-sync-bnd-state-");
  const server = await startWebfakeServer({
    quirks: over.quirks ?? {},
    credentials: over.credentials ?? null,
  });
  server.mkdirp(WS_PATH);
  cleanups.push(() => server.close());

  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });
  const client = createWebdavClient({
    baseUrl: `${server.url}${WS_PATH}`,
    username: "u",
    password: over.clientPassword ?? "p",
    timeoutMs: 5000,
  });
  const trashed: string[] = [];
  const logs: string[] = [];
  const engine: SyncEngine = createSyncEngine({
    config: {
      workspacePath: ws,
      remoteBaseUrl: `${server.url}${WS_PATH}`,
      thresholds: { ...DEFAULT_SYNC_THRESHOLDS, ...over.thresholds },
      retry: { ...DEFAULT_SYNC_RETRY, attempts: over.attempts ?? 0, baseDelayMs: 0 },
    },
    deps: {
      createClient: () => client,
      trashFile: async (absPath) => {
        trashed.push(absPath);
      },
      redact: over.redact,
      logger: (line) => logs.push(line),
    },
    store,
  });
  return { ws, server, store, trashed, logs, run: (s, p) => engine.run(s, p) };
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
  const b = server.getFile(`${WS_PATH}/${rel}`);
  return b ? new TextDecoder().decode(b) : undefined;
}

function putCount(server: WebfakeServer, path: string): number {
  return server.requests.filter((q) => q.method === "PUT" && q.path === path).length;
}

// ─── 1. 边界条目:跳过 + 报告,绝不算成功 ───────────────────────────────────

describe("边界条目跳过并报告(决议 17–19、61–62)", () => {
  it("远端文件名含 Windows 非法字符 → 跳过并报告,不落盘", async () => {
    const h = await harness();
    h.server.putFile(`${WS_PATH}/a:b.md`, "x");
    h.server.putFile(`${WS_PATH}/c?d.md`, "y");
    h.server.putFile(`${WS_PATH}/ok.md`, "ok");
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath).sort()).toEqual(["a:b.md", "c?d.md"]);
    expect(r.skipped.every((s) => s.reason.includes("非法字符"))).toBe(true);
    expect(r.downloaded).toBe(1);
    expect(r.failed).toHaveLength(0);
    await expect(readWs(h.ws, "a:b.md")).rejects.toBeTruthy();
    await expect(readWs(h.ws, "c?d.md")).rejects.toBeTruthy();
    expect(await readWs(h.ws, "ok.md")).toBe("ok");
  });

  it("重试用尽后跳过失败项、其他文件继续(部分失败计数口径)", async () => {
    const h = await harness({
      attempts: 2,
      quirks: { failRules: [{ method: "PUT", path: `${WS_PATH}/bad.md`, times: Number.POSITIVE_INFINITY }] },
    });
    await writeWs(h.ws, "bad.md", "B");
    await writeWs(h.ws, "good.md", "G");
    const r = await h.run();
    // 成功只在 good.md;bad.md 计入失败,绝不并入成功。
    expect(r.uploaded).toBe(1);
    expect(r.downloaded).toBe(0);
    expect(r.skipped).toHaveLength(0);
    expect(r.failed.map((f) => f.relPath)).toEqual(["bad.md"]);
    expect(remoteText(h.server, "good.md")).toBe("G");
    expect(remoteText(h.server, "bad.md")).toBeUndefined();
    // 首试 + 2 次重试 = 3 次 PUT
    expect(putCount(h.server, `${WS_PATH}/bad.md`)).toBe(3);
  });

  it("单文件失败重试 2 次内成功 → 计入成功,不产生失败", async () => {
    const h = await harness({
      attempts: 2,
      quirks: { failRules: [{ method: "PUT", path: `${WS_PATH}/a.md`, times: 2 }] },
    });
    await writeWs(h.ws, "a.md", "A");
    const r = await h.run();
    expect(r.uploaded).toBe(1);
    expect(r.failed).toHaveLength(0);
    expect(remoteText(h.server, "a.md")).toBe("A");
    expect(putCount(h.server, `${WS_PATH}/a.md`)).toBe(3); // 2 失败 + 1 成功
  });

  it("远端大小写冲突(Note.md 与 note.md 并存)→ 两个都跳过,不落盘", async () => {
    const h = await harness();
    h.server.putFile(`${WS_PATH}/Note.md`, "upper");
    h.server.putFile(`${WS_PATH}/note.md`, "lower");
    h.server.putFile(`${WS_PATH}/fine.md`, "ok");
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath).sort()).toEqual(["Note.md", "note.md"]);
    expect(r.skipped.every((s) => s.reason.includes("大小写冲突"))).toBe(true);
    expect(r.downloaded).toBe(1);
    await expect(readWs(h.ws, "Note.md")).rejects.toBeTruthy();
    expect(await readWs(h.ws, "fine.md")).toBe("ok");
  });

  it("大小写冲突不得把本地同名文件当「远端已删」而进回收站(红线)", async () => {
    const h = await harness();
    await writeWs(h.ws, "Note.md", "v1");
    await h.run(); // 建状态表,远端有 Note.md
    // 远端后来多出一个仅大小写不同的 note.md
    h.server.putFile(`${WS_PATH}/note.md`, "another");
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath).sort()).toEqual(["Note.md", "note.md"]);
    expect(r.deletedLocal).toBe(0);
    expect(h.trashed).toHaveLength(0);
    // 本地主名内容原样保留
    expect(await readWs(h.ws, "Note.md")).toBe("v1");
    expect(remoteText(h.server, "Note.md")).toBe("v1");
  });

  it("超长路径(落到本地会超 Windows 上限)→ 跳过并报告,不落盘", async () => {
    const h = await harness();
    const longName = `${"x".repeat(240)}.md`; // 240 + 根路径 > 260
    h.server.putFile(`${WS_PATH}/${longName}`, "L");
    h.server.putFile(`${WS_PATH}/ok.md`, "ok");
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath)).toEqual([longName]);
    expect(r.skipped[0]!.reason).toContain("路径长度");
    expect(r.downloaded).toBe(1);
    await expect(readWs(h.ws, longName)).rejects.toBeTruthy();
  });

  it("超上限文件(远端 + 本地)跳过并报告,不算失败也不算成功", async () => {
    const h = await harness({ thresholds: { maxFileSizeBytes: 4 } });
    await writeWs(h.ws, "small.md", "1234");
    await writeWs(h.ws, "big-local.md", "12345");
    h.server.putFile(`${WS_PATH}/big-remote.md`, "123456");
    const r = await h.run();
    expect(r.skipped.map((s) => s.relPath).sort()).toEqual(["big-local.md", "big-remote.md"]);
    expect(r.uploaded).toBe(1);
    expect(r.downloaded).toBe(0);
    expect(r.failed).toHaveLength(0);
    expect(remoteText(h.server, "big-local.md")).toBeUndefined();
  });

  it("跳过项的 reason 逐条可查(供状态条报「K 个跳过(原因)」)", async () => {
    const h = await harness();
    h.server.putFile(`${WS_PATH}/a:b.md`, "x");
    const r = await h.run();
    expect(r.skipped).toEqual([{ relPath: "a:b.md", reason: "文件名含 Windows 非法字符,已跳过" }]);
  });
});

// ─── 2. 分类纯函数:未知条目类型 / 超长路径判定 ──────────────────────────────

describe("条目分类纯函数(决议 18、61)", () => {
  it("classifyLocalDirent:符号链接 / 目录 / 文件 / 未知类型", () => {
    const d = (o: Partial<{ sym: boolean; dir: boolean; file: boolean }>) => ({
      isSymbolicLink: () => o.sym ?? false,
      isDirectory: () => o.dir ?? false,
      isFile: () => o.file ?? false,
    });
    expect(classifyLocalDirent(d({ sym: true, file: true }))).toBe("symlink"); // 符号链接优先
    expect(classifyLocalDirent(d({ dir: true }))).toBe("dir");
    expect(classifyLocalDirent(d({ file: true }))).toBe("file");
    // 具名管道 / 套接字 / 设备等:既非文件也非目录 → 未知类型(Windows 上造不出来)
    expect(classifyLocalDirent(d({}))).toBe("unknown");
  });

  it("exceedsWindowsPathLimit 以 MAX_PATH 为界", () => {
    const root = "C:/a"; // 长度 4
    // 4 + 1 + rel > 260 → rel > 255
    expect(exceedsWindowsPathLimit(root, "x".repeat(255))).toBe(false);
    expect(exceedsWindowsPathLimit(root, "x".repeat(256))).toBe(true);
    expect(WINDOWS_MAX_PATH_CHARS).toBe(260);
  });
});

// ─── 3. 认证失败:立即停、不重试(决议 59) ─────────────────────────────────

describe("认证失败(决议 59)", () => {
  it("枚举阶段认证失败 → SyncFatalError(auth),只发一次 PROPFIND,不重试", async () => {
    const h = await harness({
      credentials: { username: "u", password: "correct" },
      clientPassword: "wrong",
      attempts: 2,
    });
    await writeWs(h.ws, "a.md", "A");
    let err: unknown;
    try {
      await h.run();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SyncFatalError);
    expect((err as SyncFatalError).kind).toBe("auth");
    expect((err as Error).message).toContain("用户名或密码错误");
    const propfinds = h.server.requests.filter((q) => q.method === "PROPFIND");
    expect(propfinds).toHaveLength(1); // 认证失败立即停,不重试
  });

  it("执行阶段认证失败 → 立即停、不重试,不继续其他文件", async () => {
    const h = await harness({
      attempts: 2,
      quirks: { failRules: [{ method: "PUT", path: `${WS_PATH}/a.md`, times: 5, status: 401 }] },
    });
    await writeWs(h.ws, "a.md", "A");
    await writeWs(h.ws, "b.md", "B");
    await expect(h.run()).rejects.toMatchObject({ kind: "auth" });
    expect(putCount(h.server, `${WS_PATH}/a.md`)).toBe(1); // 一次即停
    expect(remoteText(h.server, "b.md")).toBeUndefined(); // 后续文件不再处理
  });
});

// ─── 4. 错误原因与日志不含密码(决议 43) ───────────────────────────────────

describe("错误原因与日志不含密码(决议 43)", () => {
  it("注入的 redact 覆盖报告里的失败原因与日志", async () => {
    const SECRET = "topsecret";
    const h = await harness({
      redact: (t) => t.split(SECRET).join("***"),
      quirks: { failRules: [{ method: "PUT", path: `${WS_PATH}/${SECRET}.md`, times: Number.POSITIVE_INFINITY }] },
    });
    await writeWs(h.ws, `${SECRET}.md`, "X");
    const r = await h.run();
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.reason).not.toContain(SECRET);
    expect(r.failed[0]!.reason).toContain("***");
    expect(h.logs.join("\n")).not.toContain(SECRET);
    expect(h.logs.join("\n")).toContain("***");
  });
});

// ─── 5. 中断:已完成进度落盘、未完成不判定(决议 64 底座) ──────────────────

describe("取消(关窗 / 切工作区中断底座;决议 64)", () => {
  it("中途取消 → run 返回已完成部分;已完成文件的记录已落盘,未完成的不写", async () => {
    const h = await harness({ quirks: { delayMs: 30 } });
    await writeWs(h.ws, "a.md", "A");
    await writeWs(h.ws, "b.md", "B");
    await writeWs(h.ws, "c.md", "C");
    const ac = new AbortController();
    const r = await h.run(ac.signal, (p) => {
      if (p.done >= 1) ac.abort(); // 第一个文件完成后立即取消
    });
    expect(r.uploaded).toBe(1); // 已完成的操作保留
    const state = await h.store.load();
    expect(state).not.toBeNull();
    expect(state!.records["a.md"]).toBeDefined(); // 已落盘
    expect(state!.records["b.md"]).toBeUndefined(); // 未完成不写
    expect(remoteText(h.server, "a.md")).toBe("A");
    expect(remoteText(h.server, "b.md")).toBeUndefined();
  });

  it("已中止的信号 → 立即停下,零传输(切工作区时同步可能尚未开始)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "A");
    const ac = new AbortController();
    ac.abort();
    const r = await h.run(ac.signal);
    expect(r.uploaded).toBe(0);
    expect(remoteText(h.server, "a.md")).toBeUndefined();
  });
});
