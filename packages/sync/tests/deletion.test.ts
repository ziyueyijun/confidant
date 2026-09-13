// @vitest-environment node
// 票 05:删除传播与保护——状态机穷举(决议 24–28、63)。
//
// 真临时目录 + webfake 真服务器;断言的是「本地 / 远端 / 状态表三方初始状态 → 同步后
// 三方终态与报告」,以及「是否发起 DELETE 请求」。trashFile 注入记录器,断言本地删除
// **确实走了回收站回调**,而非直接抹掉。
//
// 本文件是「会删用户笔记」的一票,重点用例:
//   · load() 为 null / 状态表损坏 → 保守合并,零删除(红线 1);
//   · 远端根 0 条而状态表非空 → 列举闸门报错,零删除(红线 4,决议 63);
//   · 本地已改、远端已删 → 冲突,绝不删本地(红线 2,决议 26);
//   · 熔断阈值(数量 / 占比 / 恰好相等)与「拒绝 → 零删除」(红线 5、6)。

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  SyncFatalError,
  type DeleteGuardPrompt,
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

const WS_PATH = "/dav/notes";

interface Harness {
  ws: string;
  stateDir: string;
  server: WebfakeServer;
  store: ReturnType<typeof createSyncStateStore>;
  /** trashFile 调用记录(本地删除的绝对路径)。 */
  trashed: string[];
  /** confirmDeletes 调用记录。 */
  confirmCalls: DeleteGuardPrompt[];
  setConfirm: (v: boolean) => void;
  run: (signal?: AbortSignal, onProgress?: (p: SyncProgress) => void) => Promise<SyncReport>;
  recordOf: (rel: string) => Promise<SyncFileRecord>;
  hasRecord: (rel: string) => Promise<boolean>;
  since: (mark: number) => WebfakeServer["requests"];
}

async function harness(
  over: { thresholds?: Partial<SyncThresholds>; quirks?: WebfakeQuirks } = {},
): Promise<Harness> {
  const ws = await tempDir("confidant-sync-del-ws-");
  const stateDir = await tempDir("confidant-sync-del-state-");
  const server = await startWebfakeServer({ quirks: over.quirks ?? {} });
  server.mkdirp(WS_PATH);
  cleanups.push(() => server.close());

  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });
  const client = createWebdavClient({
    baseUrl: `${server.url}${WS_PATH}`,
    username: "u",
    password: "p",
    timeoutMs: 5000,
  });

  const trashed: string[] = [];
  const confirmCalls: DeleteGuardPrompt[] = [];
  let confirmAnswer = true; // 默认「确认」:传播用例直接跑;熔断用例再翻假。

  const engine: SyncEngine = createSyncEngine({
    config: {
      workspacePath: ws,
      remoteBaseUrl: `${server.url}${WS_PATH}`,
      // 默认放宽熔断阈值(只测传播);熔断用例自行收紧。
      thresholds: {
        ...DEFAULT_SYNC_THRESHOLDS,
        deleteGuardMax: 1000,
        deleteGuardRatio: 1,
        ...over.thresholds,
      },
      retry: { ...DEFAULT_SYNC_RETRY, attempts: 0, baseDelayMs: 0 },
    },
    deps: {
      createClient: () => client,
      trashFile: async (absPath) => {
        trashed.push(absPath);
        await rm(absPath, { force: true }); // 模拟移入回收站:从磁盘消失
      },
      confirmDeletes: async (p) => {
        confirmCalls.push(p);
        return confirmAnswer;
      },
    },
    store,
  });

  return {
    ws,
    stateDir,
    server,
    store,
    trashed,
    confirmCalls,
    setConfirm: (v) => {
      confirmAnswer = v;
    },
    run: (s, p) => engine.run(s, p),
    recordOf: async (rel) => {
      const st = await store.load();
      const rec = st?.records[rel];
      if (!rec) throw new Error(`状态表里没有 ${rel} 的记录`);
      return rec;
    },
    hasRecord: async (rel) => {
      const st = await store.load();
      return Boolean(st?.records[rel]);
    },
    since: (mark) => server.requests.slice(mark),
  };
}

async function writeWs(ws: string, rel: string, content: string): Promise<void> {
  const abs = join(ws, rel.replace(/\//g, "\\"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function readWs(ws: string, rel: string): Promise<string> {
  return readFile(join(ws, rel.replace(/\//g, "\\")), "utf8");
}

async function existsWs(ws: string, rel: string): Promise<boolean> {
  try {
    await readFile(join(ws, rel.replace(/\//g, "\\")));
    return true;
  } catch {
    return false;
  }
}

function remoteText(server: WebfakeServer, rel: string): string | undefined {
  const b = server.getFile(`${WS_PATH}/${rel}`);
  return b ? new TextDecoder().decode(b) : undefined;
}

function remoteExists(server: WebfakeServer, rel: string): boolean {
  return server.getFile(`${WS_PATH}/${rel}`) !== undefined;
}

function methods(entries: WebfakeServer["requests"], method: string): string[] {
  return entries.filter((e) => e.method === method).map((e) => e.path);
}

// ─── A. 双向删除传播 ────────────────────────────────────────────────────────

describe("A. 删除传播", () => {
  it("A1 本地删除 → 远端对应文件被删除;记录清除", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "x");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    await rm(join(h.ws, "a.md"));
    const r = await h.run();

    expect(r.deletedRemote).toBe(1);
    expect(r.deletedLocal).toBe(0);
    expect(remoteText(h.server, "a.md")).toBeUndefined();
    expect(await h.hasRecord("a.md")).toBe(false);
    expect(remoteText(h.server, "keep.md")).toBe("keep"); // 未波及
  });

  it("A2 远端删除 → 本地进回收站(trashFile 被调用,而非直接抹掉)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "x");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    h.server.removeFile(`${WS_PATH}/a.md`); // 别处删了远端那份
    const r = await h.run();

    expect(r.deletedLocal).toBe(1);
    expect(r.deletedRemote).toBe(0);
    expect(h.trashed).toEqual([join(h.ws, "a.md")]); // 走了回收站回调,路径正确
    expect(await existsWs(h.ws, "a.md")).toBe(false); // 已从磁盘移走
    expect(await h.hasRecord("a.md")).toBe(false);
    expect(await readWs(h.ws, "keep.md")).toBe("keep");
  });

  it("A3 同步触发的本地删除走回收站(不经任何不可恢复删除)", async () => {
    // 与 A2 同一机制,显式确认「同步删除」这条路径用 trashFile。
    const h = await harness();
    await writeWs(h.ws, "note.md", "body");
    await writeWs(h.ws, "other.md", "other");
    await h.run();

    h.server.removeFile(`${WS_PATH}/note.md`);
    const mark = h.server.requests.length;
    const r = await h.run();

    expect(h.trashed).toHaveLength(1);
    expect(h.trashed[0]).toBe(join(h.ws, "note.md"));
    // 同步删除只走回调,不额外发 DELETE(远端那份已不在)
    expect(methods(h.since(mark), "DELETE")).toEqual([]);
    expect(r.deletedLocal).toBe(1);
  });
});

// ─── B. 改 / 删冲突:绝不删本地、绝不丢内容 ──────────────────────────────────

describe("B. 改 vs 删冲突", () => {
  it("B1 本地已改、远端已删 → 冲突:本地不删,保留双份(远端被恢复)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    await writeWs(h.ws, "a.md", "local-modified"); // 本地改了
    h.server.removeFile(`${WS_PATH}/a.md`); // 远端删了
    const r = await h.run();

    expect(r.conflicts).toBe(1);
    expect(r.deletedLocal).toBe(0); // 红线:绝不删本地
    expect(h.trashed).toEqual([]);
    expect(await readWs(h.ws, "a.md")).toBe("local-modified"); // 本地版本完好
    expect(remoteText(h.server, "a.md")).toBe("local-modified"); // 远端也被恢复
    expect(await h.hasRecord("a.md")).toBe(true);
  });

  it("B2 本地已删、远端已改 → 冲突:不删远端,远端内容恢复到本地", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    await rm(join(h.ws, "a.md")); // 本地删了
    h.server.putFile(`${WS_PATH}/a.md`, "remote-modified"); // 远端改了
    const mark = h.server.requests.length;
    const r = await h.run();

    expect(r.conflicts).toBe(1);
    expect(r.deletedRemote).toBe(0);
    expect(methods(h.since(mark), "DELETE")).toEqual([]); // 绝不删远端
    expect(remoteText(h.server, "a.md")).toBe("remote-modified"); // 远端内容完好
    expect(await readWs(h.ws, "a.md")).toBe("remote-modified"); // 恢复到本地
  });
});

// ─── C. 双侧同删 → 记录清理 ─────────────────────────────────────────────────

describe("C. 双侧同删", () => {
  it("C1 两侧都已删除 → 只清记录,不产生任何删除/传输", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "x");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    await rm(join(h.ws, "a.md"));
    h.server.removeFile(`${WS_PATH}/a.md`);
    const mark = h.server.requests.length;
    const r = await h.run();

    expect(await h.hasRecord("a.md")).toBe(false);
    expect(r.deletedLocal).toBe(0);
    expect(r.deletedRemote).toBe(0);
    expect(methods(h.since(mark), "DELETE")).toEqual([]);
    expect(methods(h.since(mark), "PUT")).toEqual([]);
    expect(await readWs(h.ws, "keep.md")).toBe("keep");
    expect(remoteText(h.server, "keep.md")).toBe("keep");
  });
});

// ─── D. 列举闸门(决议 63) ──────────────────────────────────────────────────

describe("D. 列举闸门", () => {
  it("D1 远端根列举 0 条而状态表非空 → 报错停止,零删除", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "aaa");
    await writeWs(h.ws, "b.md", "bbb");
    await h.run();

    h.server.removeFile(`${WS_PATH}/a.md`); // 另一端把远端清空
    h.server.removeFile(`${WS_PATH}/b.md`);
    const mark = h.server.requests.length;
    let caught: unknown;
    try {
      await h.run();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SyncFatalError);
    expect((caught as SyncFatalError).kind).toBe("listing-guard");
    expect(methods(h.since(mark), "DELETE")).toEqual([]); // 零删除
    expect(await readWs(h.ws, "a.md")).toBe("aaa"); // 本地一份不少
    expect(await readWs(h.ws, "b.md")).toBe("bbb");
  });

  it("D2 列举静默返回空(服务端缺陷形态)→ 同样报错,零删除", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "aaa");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    h.server.setQuirks({ emptyListing: true }); // 「上传正常、列举为空」
    const mark = h.server.requests.length;
    let caught: unknown;
    try {
      await h.run();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SyncFatalError);
    expect((caught as SyncFatalError).kind).toBe("listing-guard");
    expect(methods(h.since(mark), "DELETE")).toEqual([]);
    expect(await readWs(h.ws, "a.md")).toBe("aaa");
  });

  it("D3 列举返回非成功状态码 → 整体失败,绝不当作远端为空", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "aaa");
    await h.run();
    expect(remoteText(h.server, "a.md")).toBe("aaa");

    h.server.setQuirks({ listingStatus: 500 });
    const mark = h.server.requests.length;
    let caught: unknown;
    try {
      await h.run();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(WebdavError); // 协议失败,不是「空远端」
    expect(methods(h.since(mark), "DELETE")).toEqual([]);
    expect(methods(h.since(mark), "PUT")).toEqual([]); // 没把「空」当成事实去补
    expect(remoteText(h.server, "a.md")).toBe("aaa"); // 远端原样
    expect(await readWs(h.ws, "a.md")).toBe("aaa"); // 本地原样
  });
});

// ─── E. 熔断(决议 27) ──────────────────────────────────────────────────────

describe("E. 熔断守卫", () => {
  it("E1 数量超限:拒绝 → 整次同步零删除;确认 → 继续执行", async () => {
    const h = await harness({ thresholds: { deleteGuardMax: 2, deleteGuardRatio: 1 } });
    for (const n of ["a", "b", "c"]) await writeWs(h.ws, `${n}.md`, n);
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    for (const n of ["a", "b", "c"]) await rm(join(h.ws, `${n}.md`));
    h.setConfirm(false);
    const mark = h.server.requests.length;
    await expect(h.run()).rejects.toMatchObject({ name: "SyncFatalError", kind: "delete-guard" });

    expect(h.confirmCalls).toHaveLength(1);
    expect(h.confirmCalls[0]).toMatchObject({ count: 3, remoteDeletes: 3, triggeredByMax: true });
    expect(methods(h.since(mark), "DELETE")).toEqual([]); // 拒绝 ⇒ 零删除
    expect(remoteExists(h.server, "a.md")).toBe(true);

    h.setConfirm(true);
    const r = await h.run();
    expect(r.deletedRemote).toBe(3);
    expect(remoteExists(h.server, "a.md")).toBe(false);
  });

  it("E2 占比超限:3 个文件的库删 3 个 → 触发", async () => {
    const h = await harness({ thresholds: { deleteGuardMax: 1000, deleteGuardRatio: 0.2 } });
    for (const n of ["a", "b", "c"]) await writeWs(h.ws, `${n}.md`, n);
    await h.run();

    for (const n of ["a", "b", "c"]) await rm(join(h.ws, `${n}.md`));
    h.setConfirm(false);
    let caught: unknown;
    try {
      await h.run();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SyncFatalError);
    expect((caught as SyncFatalError).kind).toBe("delete-guard");
    expect(h.confirmCalls[0]).toMatchObject({ triggeredByRatio: true, remoteDeletes: 3, remoteTotal: 3 });
    expect(remoteExists(h.server, "a.md")).toBe(true); // 零删除
  });

  it("E3 恰好等于数量阈值 → 不触发(边界取「超过」)", async () => {
    const h = await harness({ thresholds: { deleteGuardMax: 3, deleteGuardRatio: 1 } });
    for (const n of ["a", "b", "c"]) await writeWs(h.ws, `${n}.md`, n);
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    for (const n of ["a", "b", "c"]) await rm(join(h.ws, `${n}.md`));
    const r = await h.run();

    expect(h.confirmCalls).toHaveLength(0); // 未触发确认
    expect(r.deletedRemote).toBe(3);
  });

  it("E4 恰好等于比例阈值 → 不触发", async () => {
    const h = await harness({ thresholds: { deleteGuardMax: 1000, deleteGuardRatio: 0.2 } });
    for (const n of ["a", "b", "c", "d", "e"]) await writeWs(h.ws, `${n}.md`, n);
    await h.run();

    await rm(join(h.ws, "a.md")); // 1 / 5 = 0.2,等于阈值
    const r = await h.run();

    expect(h.confirmCalls).toHaveLength(0);
    expect(r.deletedRemote).toBe(1);
  });

  it("E5 拒绝熔断 → 整次同步零删除也零传输(不是只删一部分)", async () => {
    const h = await harness({ thresholds: { deleteGuardMax: 0, deleteGuardRatio: 1 } });
    await writeWs(h.ws, "a.md", "a");
    await writeWs(h.ws, "b.md", "b");
    await h.run();

    await rm(join(h.ws, "a.md")); // 要删一个
    await writeWs(h.ws, "b.md", "b-modified"); // 还改了一个(本应上传)
    h.setConfirm(false);
    const mark = h.server.requests.length;
    await expect(h.run()).rejects.toBeInstanceOf(SyncFatalError);

    const delta = h.since(mark);
    expect(methods(delta, "DELETE")).toEqual([]);
    expect(methods(delta, "PUT")).toEqual([]); // 连上传也没发生:立即停止
    expect(remoteText(h.server, "b.md")).toBe("b"); // 未上传
    expect(remoteExists(h.server, "a.md")).toBe(true); // 未删
  });
});

// ─── F. 恢复与保守合并 ──────────────────────────────────────────────────────

describe("F. 恢复与保守合并", () => {
  it("F1 从服务端回收站恢复文件 → 下次同步按「远端新增」拉回(决议 28)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "x");
    await writeWs(h.ws, "keep.md", "keep");
    await h.run();

    h.server.removeFile(`${WS_PATH}/a.md`); // 远端删
    const r1 = await h.run();
    expect(r1.deletedLocal).toBe(1);
    expect(await h.hasRecord("a.md")).toBe(false); // 记录已清除

    h.server.putFile(`${WS_PATH}/a.md`, "restored"); // 从服务端回收站恢复
    const r2 = await h.run();
    expect(r2.downloaded).toBe(1);
    expect(await readWs(h.ws, "a.md")).toBe("restored");
  });

  it("F2 状态表读取失败 → 保守合并 → 零删除(红线 1)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "aaa");
    await writeWs(h.ws, "b.md", "bbb");
    await h.run();

    const stateFile = (await readdir(h.stateDir))[0]!;
    await writeFile(join(h.stateDir, stateFile), "{ 这不是 JSON", "utf8"); // 损坏 → 无状态表
    h.server.removeFile(`${WS_PATH}/a.md`); // 远端少了 a.md

    const mark = h.server.requests.length;
    const r = await h.run();

    expect(r.deletedLocal).toBe(0); // 保守合并:绝不删除
    expect(r.deletedRemote).toBe(0);
    expect(methods(h.since(mark), "DELETE")).toEqual([]);
    expect(await readWs(h.ws, "a.md")).toBe("aaa"); // 本地保留
    expect(remoteText(h.server, "a.md")).toBe("aaa"); // 只补:重新上传
  });

  it("F3 无状态表时本地有、远端无 → 只上传,绝不删除任何一侧", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "aaa");
    await writeWs(h.ws, "b.md", "bbb");
    // 不建立状态表:第一次同步就是「无状态表」
    const r = await h.run();
    expect(r.uploaded).toBe(2);
    expect(r.deletedLocal).toBe(0);
    expect(r.deletedRemote).toBe(0);
    expect(methods(h.server.requests, "DELETE")).toEqual([]);
  });

  it("F4 无状态表时本地已删、远端仍在 → 下载还原,绝不删远端(红线 1)", async () => {
    const h = await harness();
    h.server.putFile(`${WS_PATH}/a.md`, "remote"); // 只有远端有
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(r.deletedLocal).toBe(0);
    expect(r.deletedRemote).toBe(0);
    expect(methods(h.server.requests, "DELETE")).toEqual([]);
    expect(remoteText(h.server, "a.md")).toBe("remote"); // 远端原样
    expect(await readWs(h.ws, "a.md")).toBe("remote");
  });
});
