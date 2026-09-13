// @vitest-environment node
// 同步滚动日志单测(票 06;决议 43):每行遮蔽密码、超上限轮转。
// 用真实的临时 userData 目录(经 vi.mock 的 electron.app.getPath 注入)。

import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let mockUserData = "";
vi.mock("electron", () => ({ app: { getPath: () => mockUserData } }));

import { createSyncLogger } from "./sync-log";

const MAX_BYTES = 1 * 1024 * 1024;
const cleanups: Array<string> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const d = cleanups.pop()!;
    await rm(d, { recursive: true, force: true });
  }
});

async function freshUserData(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "confidant-sync-log-"));
  cleanups.push(d);
  mockUserData = d;
  return d;
}

/** 轮询等待(fn 为真即返回),避免依赖固定延时。 */
async function waitFor(fn: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor 超时");
}

describe("createSyncLogger(决议 43)", () => {
  it("写本机文件,且每一行的密码(原样与 URL 编码)都被遮蔽", async () => {
    const dir = await freshUserData();
    const log = createSyncLogger(["p@ss word"]);
    log("连接 p@ss word 失败");
    log("url=p%40ss%20word&x=1");
    log("无敏感内容");
    const file = join(dir, "logs", "sync.log");
    await waitFor(async () => existsSync(file) && (await readFile(file, "utf8")).includes("无敏感内容"));
    const text = await readFile(file, "utf8");
    expect(text).toContain("***");
    expect(text).not.toContain("p@ss word");
    expect(text).not.toContain("p%40ss%20word");
  });

  it("超过上限 → 轮转为 sync.log.1;下一次写入新建当前文件", async () => {
    const dir = await freshUserData();
    const logsDir = join(dir, "logs");
    const file = join(logsDir, "sync.log");
    await mkdir(logsDir, { recursive: true });
    await writeFile(file, "x".repeat(MAX_BYTES + 1), "utf8");

    const log = createSyncLogger();
    log("轮转之后"); // 本次写完后触发轮转:该行落在 .1,当前文件被改名走
    await waitFor(async () => {
      try {
        return existsSync(`${file}.1`) && (await readFile(`${file}.1`, "utf8")).includes("轮转之后");
      } catch {
        return false;
      }
    });
    expect((await readFile(`${file}.1`, "utf8")).length).toBeGreaterThan(MAX_BYTES);

    log("新的一行"); // 轮转后当前文件不存在,应被重新建立
    await waitFor(async () => {
      try {
        return (await readFile(file, "utf8")).includes("新的一行");
      } catch {
        return false;
      }
    });
  });
});
