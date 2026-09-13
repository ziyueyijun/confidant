// @vitest-environment node
// 冲突——保留双份(票 04;规格决议 20–23、55)。
//
// 真临时目录 + webfake 真服务器(不写假客户端)。断言的是「本地 / 远端 / 状态表
// 三方初始状态 → 同步后三方终态与报告」。
//
// 核心命题:**冲突判定 = 两侧内容都离开了基准版本(决议 21),用 hash 判断,
// 绝不用验证符**(票 03 已证明验证符会失真)。本文件最重要的一条是
// 「远端验证符变了但内容仍等于基准 + 本地已改」:它不是冲突,只是「仅本地改」。
// 若引擎拿验证符当判定依据,就会凭空造出一个假的冲突副本。

import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  type SyncEngine,
  type SyncProgress,
  type SyncReport,
} from "../index";
import {
  CONFLICT_COPY_INFIX,
  conflictCopyRelPath,
  formatConflictStamp,
  isConflictCopyName,
} from "../conflict";
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

const WS_PATH = "/dav/notes";

/** 固定时钟:让冲突副本名确定,并强制「同戳 → 走防撞后缀」。 */
const FIXED_NOW = (): number => new Date(2026, 8, 14, 15, 30, 12).getTime();
const FIXED_STAMP = "2026-09-14 15-30-12";

interface Harness {
  ws: string;
  server: WebfakeServer;
  run: (signal?: AbortSignal, onProgress?: (p: SyncProgress) => void) => Promise<SyncReport>;
}

async function harness(over: { now?: () => number } = {}): Promise<Harness> {
  const ws = await tempDir("confidant-sync-ws-");
  const stateDir = await tempDir("confidant-sync-state-");
  const server = await startWebfakeServer({});
  server.mkdirp(WS_PATH);
  cleanups.push(() => server.close());

  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });
  const client = createWebdavClient({
    baseUrl: `${server.url}${WS_PATH}`,
    username: "u",
    password: "p",
    timeoutMs: 5000,
  });
  const engine: SyncEngine = createSyncEngine({
    config: {
      workspacePath: ws,
      remoteBaseUrl: `${server.url}${WS_PATH}`,
      thresholds: { ...DEFAULT_SYNC_THRESHOLDS },
      retry: { ...DEFAULT_SYNC_RETRY, attempts: 0, baseDelayMs: 0 },
    },
    deps: {
      createClient: () => client,
      trashFile: async () => undefined,
      ...(over.now ? { now: over.now } : {}),
    },
    store,
  });
  return { ws, server, run: (s, p) => engine.run(s, p) };
}

async function writeWs(ws: string, rel: string, content: string): Promise<void> {
  const abs = join(ws, rel.replace(/\//g, "\\"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function readWs(ws: string, rel: string): Promise<string> {
  return readFile(join(ws, rel.replace(/\//g, "\\")), "utf8");
}

async function listWs(ws: string): Promise<string[]> {
  return [...(await readdir(ws))].sort();
}

function remoteText(server: WebfakeServer, rel: string): string | undefined {
  const b = server.getFile(`${WS_PATH}/${rel}`);
  return b ? new TextDecoder().decode(b) : undefined;
}

function remoteHas(server: WebfakeServer, rel: string): boolean {
  return server.has(`${WS_PATH}/${rel}`);
}

function conflictCopiesOf(server: WebfakeServer, probe: string): string[] {
  return server
    .list()
    .filter((p) => p.startsWith(`${WS_PATH}/`) && p.includes(probe) && isConflictCopyName(p.slice(WS_PATH.length + 1)))
    .map((p) => p.slice(WS_PATH.length + 1))
    .sort();
}

// ─── 0. 命名与识别(纯逻辑) ───────────────────────────────────────────────

describe("冲突副本命名与识别(决议 22)", () => {
  it("时间戳用 - 分隔(: 在 Windows 文件名中非法)", () => {
    const stamp = formatConflictStamp(new Date(2026, 8, 14, 15, 30, 12));
    expect(stamp).toBe("2026-09-14 15-30-12");
    expect(stamp).not.toContain(":");
  });

  it("命名形如 `笔记名 (冲突 来自远端 年-月-日 时-分-秒).md`,保留原扩展名", () => {
    const date = new Date(2026, 8, 14, 15, 30, 12);
    expect(conflictCopyRelPath("笔记.md", date)).toBe(`笔记${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`);
    expect(conflictCopyRelPath("sub/pic.png", date)).toBe(`sub/pic${CONFLICT_COPY_INFIX}${FIXED_STAMP}).png`);
    // 多点扩展名:只在最后一个点后插入
    expect(conflictCopyRelPath("a.b.md", date)).toBe(`a.b${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`);
  });

  it("isConflictCopyName 只认本引擎产出的形态(含防撞后缀),不误报普通名", () => {
    expect(isConflictCopyName(`a${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`)).toBe(true);
    expect(isConflictCopyName(`a${CONFLICT_COPY_INFIX}${FIXED_STAMP}) (2).md`)).toBe(true);
    expect(isConflictCopyName(`pic${CONFLICT_COPY_INFIX}${FIXED_STAMP}).png`)).toBe(true);
    expect(isConflictCopyName("a.md")).toBe(false);
    expect(isConflictCopyName("a (2).md")).toBe(false);
    expect(isConflictCopyName("a (冲突 来自远端 不是时间).md")).toBe(false);
  });
});

// ─── 1. 判定矩阵:谁离开了基准版本(决议 21) ──────────────────────────────

describe("冲突判定:两侧内容都离开基准才算冲突(用 hash)", () => {
  it("仅本地改 → 不冲突,只上传", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await h.run(); // 建基准
    await writeWs(h.ws, "a.md", "local-2");

    const r = await h.run();
    expect(r).toMatchObject({ uploaded: 1, downloaded: 0, conflicts: 0 });
    expect(remoteText(h.server, "a.md")).toBe("local-2");
    expect(remoteHas(h.server, `a${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`)).toBe(false);
  });

  it("仅远端改 → 不冲突,只下载", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await h.run();
    h.server.putFile(`${WS_PATH}/a.md`, "remote-2");

    const r = await h.run();
    expect(r).toMatchObject({ uploaded: 0, downloaded: 1, conflicts: 0 });
    expect(await readWs(h.ws, "a.md")).toBe("remote-2");
  });

  it("两侧都改且内容相同 → 不冲突(基准对齐,不写盘、不传输)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await h.run();
    await writeWs(h.ws, "a.md", "converged");
    h.server.putFile(`${WS_PATH}/a.md`, "converged");

    const r = await h.run();
    expect(r).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 });
    expect(await readWs(h.ws, "a.md")).toBe("converged");
    // 没有产生任何冲突副本
    expect(conflictCopiesOf(h.server, "a")).toEqual([]);
  });

  it("两侧都改且内容不同 → 冲突,保留双份(决议 22)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    await h.run();
    await writeWs(h.ws, "a.md", "local-2");
    h.server.putFile(`${WS_PATH}/a.md`, "remote-2");

    const r = await h.run();
    expect(r.conflicts).toBe(1);
    // 本地主名保持不动
    expect(await readWs(h.ws, "a.md")).toBe("local-2");
    // 冲突副本内容 = 远端版本
    const copies = conflictCopiesOf(h.server, "a");
    expect(copies).toHaveLength(1);
    expect(await readWs(h.ws, copies[0]!)).toBe("remote-2");
  });

  it("远端验证符变了但内容仍等于基准 + 本地已改 → 不是冲突,只上传", async () => {
    // 这是「别用验证符判冲突」的判定点:验证符失真(票 03 A4)会触发一次下载确认,
    // 但内容 hash 仍等于基准 ⇒ 远端没改内容 ⇒ 只有本地改了。
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    h.server.putFile(`${WS_PATH}/a.md`, "base", { etag: '"E1"' });
    await h.run();
    await writeWs(h.ws, "a.md", "local-2");
    h.server.setEtag(`${WS_PATH}/a.md`, '"E2"'); // 只动验证符,内容不动

    const r = await h.run();
    expect(r).toMatchObject({ uploaded: 1, downloaded: 0, conflicts: 0 });
    expect(remoteText(h.server, "a.md")).toBe("local-2");
    expect(conflictCopiesOf(h.server, "a")).toEqual([]); // 不造出假的冲突副本
  });
});

// ─── 2. 保留双份的端到端形态 ──────────────────────────────────────────────

describe("保留双份:两端都能找到两个版本(决议 23)", () => {
  it("首次同步(无状态表)同名不同内容 → 命名格式正确,两侧各两版", async () => {
    const h = await harness({ now: FIXED_NOW });
    await writeWs(h.ws, "a.md", "LOCAL");
    h.server.putFile(`${WS_PATH}/a.md`, "REMOTE");

    const r = await h.run();
    expect(r.conflicts).toBe(1);

    const copyName = `a${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`;
    expect(copyName).toBe("a (冲突 来自远端 2026-09-14 15-30-12).md");
    // 本地:主名不动 + 副本 = 远端版本
    expect(await listWs(h.ws)).toEqual([copyName, "a.md"].sort());
    expect(await readWs(h.ws, "a.md")).toBe("LOCAL");
    expect(await readWs(h.ws, copyName)).toBe("REMOTE");
    // 远端:主名 = 本地版本 + 副本 = 远端版本
    expect(remoteText(h.server, "a.md")).toBe("LOCAL");
    expect(remoteText(h.server, copyName)).toBe("REMOTE");
    expect(remoteHas(h.server, "a.md")).toBe(true);
    expect(remoteHas(h.server, copyName)).toBe(true);
  });

  it("非 .md(图片)冲突 → 沿用同一模式并保留原扩展名", async () => {
    const h = await harness({ now: FIXED_NOW });
    await writeWs(h.ws, "pic.png", "LOCAL-PNG");
    h.server.putFile(`${WS_PATH}/pic.png`, "REMOTE-PNG");

    const r = await h.run();
    expect(r.conflicts).toBe(1);
    const copyName = `pic${CONFLICT_COPY_INFIX}${FIXED_STAMP}).png`;
    expect(await listWs(h.ws)).toEqual([copyName, "pic.png"].sort());
    expect(await readWs(h.ws, "pic.png")).toBe("LOCAL-PNG");
    expect(await readWs(h.ws, copyName)).toBe("REMOTE-PNG");
    expect(remoteText(h.server, copyName)).toBe("REMOTE-PNG");
  });

  it("同一文件连续两次冲突 → 副本防撞,第二份不覆盖第一份", async () => {
    const h = await harness({ now: FIXED_NOW }); // 固定时钟 ⇒ 两次同戳,必走 (2)
    await writeWs(h.ws, "a.md", "L1");
    h.server.putFile(`${WS_PATH}/a.md`, "R1");
    const r1 = await h.run();
    expect(r1.conflicts).toBe(1);

    await writeWs(h.ws, "a.md", "L2");
    h.server.putFile(`${WS_PATH}/a.md`, "R2");
    const r2 = await h.run();
    expect(r2.conflicts).toBe(1);

    const base = `a${CONFLICT_COPY_INFIX}${FIXED_STAMP})`;
    const copy1 = `${base}.md`;
    const copy2 = `${base} (2).md`;
    // 第一份副本原样保留(未被第二份覆盖)
    expect(await readWs(h.ws, copy1)).toBe("R1");
    expect(await readWs(h.ws, copy2)).toBe("R2");
    expect(remoteText(h.server, copy1)).toBe("R1");
    expect(remoteText(h.server, copy2)).toBe("R2");
    // 最新一轮的主名收敛到 L2
    expect(await readWs(h.ws, "a.md")).toBe("L2");
    expect(remoteText(h.server, "a.md")).toBe("L2");
  });

  it("冲突后再次同步稳定:零传输、副本不被当冲突重判", async () => {
    const h = await harness({ now: FIXED_NOW });
    await writeWs(h.ws, "a.md", "LOCAL");
    h.server.putFile(`${WS_PATH}/a.md`, "REMOTE");
    await h.run();

    const mark = h.server.requests.length;
    const r2 = await h.run();
    expect(r2).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 });
    expect(h.server.requests.slice(mark).some((q) => q.method === "PUT")).toBe(false);
  });
});

// ─── 3. 冲突副本是普通文件(决议 23:会照常同步到远端) ────────────────────

describe("冲突副本是普通文件", () => {
  it("本地独占的冲突副本会被上传到远端(无特殊排除)", async () => {
    const h = await harness({ now: FIXED_NOW });
    const copyName = `note${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`;
    await writeWs(h.ws, copyName, "kept-remote-version");

    const r = await h.run();
    expect(r.uploaded).toBe(1);
    expect(r.conflicts).toBe(0);
    expect(remoteText(h.server, copyName)).toBe("kept-remote-version");
  });

  it("另一台机器看得见冲突:远端已有的冲突副本会被下载", async () => {
    const h = await harness({ now: FIXED_NOW });
    const copyName = `note${CONFLICT_COPY_INFIX}${FIXED_STAMP}).md`;
    h.server.putFile(`${WS_PATH}/${copyName}`, "from-other-machine");

    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(await readWs(h.ws, copyName)).toBe("from-other-machine");
  });
});
