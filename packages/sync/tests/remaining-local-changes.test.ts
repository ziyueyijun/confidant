// @vitest-environment node
// 收尾比对(票 07;规格决议 11)。
//
// 「同步期间被再次改动的文件」在 run 结束时被统计为 report.remainingLocalChanges,
// 且**绝不自动重跑**(否则用户持续输入时同步会一直循环)。真临时目录 + webfake。
//
// 判定要点(见 engine.ts countRemainingLocalChanges):重扫本地,元数据变了的文件再算
// hash 与同步后的基准比较——引擎自己写的文件(下载落盘 / 冲突副本)基准已对齐,不计入。

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  type SyncReport,
} from "../index";
import { createWebdavClient, type WebdavClient } from "../client";
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

const DAV = "/dav/notes";

function absOf(ws: string, rel: string): string {
  return join(ws, rel.replace(/\//g, "\\"));
}

async function writeWs(ws: string, rel: string, content: string): Promise<void> {
  const abs = absOf(ws, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

/** 同步版写文件:createClient / put 回调是同步的,不能 await。 */
function writeWsSync(ws: string, rel: string, content: string): void {
  const abs = absOf(ws, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

interface Harness {
  ws: string;
  server: WebfakeServer;
  run: (opts?: {
    /** 引擎建客户端时执行(在本地枚举**之后**),用于模拟「同步期间改动本地」。 */
    onCreateClient?: () => void;
    /** 包装客户端(如在上传成功后再次改动本地文件)。 */
    wrap?: (c: WebdavClient) => WebdavClient;
  }) => Promise<SyncReport>;
}

async function harness(): Promise<Harness> {
  const ws = await tempDir("confidant-remaining-ws-");
  const stateDir = await tempDir("confidant-remaining-state-");
  const server = await startWebfakeServer({});
  server.mkdirp(DAV);
  cleanups.push(() => server.close());
  const store = createSyncStateStore({ dir: stateDir, workspacePath: ws });

  return {
    ws,
    server,
    run: (opts) => {
      const engine = createSyncEngine({
        config: {
          workspacePath: ws,
          remoteBaseUrl: `${server.url}${DAV}`,
          thresholds: DEFAULT_SYNC_THRESHOLDS,
          retry: { ...DEFAULT_SYNC_RETRY, attempts: 0, baseDelayMs: 0 },
        },
        deps: {
          createClient: () => {
            opts?.onCreateClient?.();
            const c = createWebdavClient({
              baseUrl: `${server.url}${DAV}`,
              username: "u",
              password: "p",
              timeoutMs: 5000,
            });
            return opts?.wrap ? opts.wrap(c) : c;
          },
          trashFile: async () => undefined,
        },
        store,
      });
      return engine.run();
    },
  };
}

describe("收尾比对(决议 11)", () => {
  it("同步期间新增的本地文件被统计,且不被自动重跑(不上传)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    h.server.putFile(`${DAV}/a.md`, "one");
    await h.run(); // 建基准

    const r = await h.run({
      onCreateClient: () => {
        writeWsSync(h.ws, "c.md", "made-during-sync");
        writeWsSync(h.ws, "d.md", "also-during-sync");
        writeWsSync(h.ws, "sub/e.md", "nested");
      },
    });

    expect(r.remainingLocalChanges).toBe(3);
    // 不自动重跑:这三个文件都没被上传(第二次 run 的远端仍是原样)。
    expect(h.server.getFile(`${DAV}/c.md`)).toBeUndefined();
    expect(h.server.getFile(`${DAV}/d.md`)).toBeUndefined();
    expect(h.server.getFile(`${DAV}/sub/e.md`)).toBeUndefined();
  });

  it("同步期间被再次改动(上传后又改)的文件被统计为 1", async () => {
    const h = await harness();
    await writeWs(h.ws, "b.md", "v1");

    const r = await h.run({
      wrap: (c) => ({
        ...c,
        async put(rel, data, putOpts) {
          const res = await c.put(rel, data, putOpts);
          if (rel === "b.md") writeWsSync(h.ws, "b.md", "v2-edited-during-sync");
          return res;
        },
      }),
    });

    expect(r.uploaded).toBe(1);
    expect(r.remainingLocalChanges).toBe(1);
  });

  it("同步期间无改动 → 0", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "one");
    h.server.putFile(`${DAV}/a.md`, "one");
    await h.run();
    const r = await h.run();
    expect(r.remainingLocalChanges).toBe(0);
  });

  it("引擎自己下载落盘的文件不计入(基准已对齐)", async () => {
    const h = await harness();
    h.server.putFile(`${DAV}/a.md`, "remote-only"); // 本地没有、无状态表 → 下载
    const r = await h.run();
    expect(r.downloaded).toBe(1);
    expect(r.remainingLocalChanges).toBe(0);
  });

  it("冲突产生的本地副本不计入(基准已对齐)", async () => {
    const h = await harness();
    await writeWs(h.ws, "a.md", "base");
    h.server.putFile(`${DAV}/a.md`, "base");
    await h.run(); // 基准

    await writeWs(h.ws, "a.md", "local-edit");
    h.server.putFile(`${DAV}/a.md`, "remote-edit");
    const r = await h.run();

    expect(r.conflicts).toBe(1);
    expect(r.remainingLocalChanges).toBe(0);
  });
});
