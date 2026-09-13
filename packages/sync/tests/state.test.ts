// @vitest-environment node
// 同步状态表读写(决议 32–34):按工作区为键、每完成一个文件写一次、
// 读取失败退化为「无状态表」——绝不静默重建为空表(决议 33)。

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncStateStore, type SyncFileRecord, type SyncState } from "../index";

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "confidant-sync-state-"));
  dirs.push(d);
  return d;
}

afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

function rec(relPath: string, hash = "h"): SyncFileRecord {
  return { relPath, baseHash: hash, etag: '"e"', remoteModified: "Mon, 14 Sep 2026 10:00:00 GMT", remoteSize: 3 };
}

async function onlyFile(dir: string): Promise<string> {
  const files = await readdir(dir);
  expect(files).toHaveLength(1);
  return join(dir, files[0]!);
}

describe("SyncStateStore", () => {
  it("没有状态文件 → load 返回 null(无状态表,走保守合并)", async () => {
    const dir = await makeDir();
    expect(await createSyncStateStore({ dir, workspacePath: "C:/ws/a" }).load()).toBeNull();
  });

  it("save / load 往返", async () => {
    const dir = await makeDir();
    const ws = "C:/ws/a";
    const store = createSyncStateStore({ dir, workspacePath: ws });
    const state: SyncState = { version: 1, workspace: ws, initializedAt: 123, records: { "a.md": rec("a.md") } };
    await store.save(state);
    expect(await store.load()).toEqual(state);
  });

  it("每完成一个文件写一次:首次 upsert 后即可独立读到", async () => {
    const dir = await makeDir();
    const store = createSyncStateStore({ dir, workspacePath: "C:/ws/a" });
    await store.upsert("a.md", rec("a.md", "ha"));
    expect(Object.keys((await store.load())!.records)).toEqual(["a.md"]);
    await store.upsert("b.md", rec("b.md", "hb"));
    expect(Object.keys((await store.load())!.records).sort()).toEqual(["a.md", "b.md"]);
    // upsert 到无表时建新表(引擎已决定这是首次同步),initializedAt 仍为 null
    expect((await store.load())!.initializedAt).toBeNull();
  });

  it("中断语义:已写记录保留,未写的不出现", async () => {
    const dir = await makeDir();
    const store = createSyncStateStore({ dir, workspacePath: "C:/ws/a" });
    await store.upsert("a.md", rec("a.md", "ha"));
    await store.upsert("b.md", rec("b.md", "hb"));
    // 模拟第 300 个文件前中断:load 只应含已完成的两个
    expect(Object.keys((await store.load())!.records).sort()).toEqual(["a.md", "b.md"]);
  });

  it("文件损坏 → load 返回 null,且不覆盖损坏文件", async () => {
    const dir = await makeDir();
    const store = createSyncStateStore({ dir, workspacePath: "C:/ws/a" });
    await store.upsert("a.md", rec("a.md"));
    const file = await onlyFile(dir);
    await writeFile(file, "{ 这不是 JSON", "utf8");
    expect(await store.load()).toBeNull();
    // 关键:读取失败绝不静默重建成空表
    expect(await readFile(file, "utf8")).toBe("{ 这不是 JSON");
  });

  it("版本不符 / 键不符 → null", async () => {
    const dir = await makeDir();
    const ws = "C:/ws/a";
    const store = createSyncStateStore({ dir, workspacePath: ws });
    await store.save({ version: 1, workspace: "OTHER", initializedAt: null, records: {} });
    expect(await store.load()).toBeNull();
    const file = await onlyFile(dir);
    await writeFile(file, JSON.stringify({ version: 99, workspace: ws, records: {} }), "utf8");
    expect(await store.load()).toBeNull();
  });

  it("markDeleted 写墓碑且保留记录;forget 移除记录", async () => {
    const dir = await makeDir();
    const store = createSyncStateStore({ dir, workspacePath: "C:/ws/a" });
    await store.upsert("a.md", rec("a.md", "ha"));
    await store.markDeleted("a.md");
    const after = (await store.load())!.records["a.md"]!;
    expect(after.tombstone).toBe(true);
    expect(after.baseHash).toBe("ha");
    await store.forget("a.md");
    expect((await store.load())!.records["a.md"]).toBeUndefined();
  });

  it("按工作区为键:不同工作区互不影响", async () => {
    const dir = await makeDir();
    const a = createSyncStateStore({ dir, workspacePath: "C:/ws/a" });
    const b = createSyncStateStore({ dir, workspacePath: "C:/ws/b" });
    await a.upsert("a.md", rec("a.md", "ha"));
    await b.upsert("b.md", rec("b.md", "hb"));
    expect(Object.keys((await a.load())!.records)).toEqual(["a.md"]);
    expect(Object.keys((await b.load())!.records)).toEqual(["b.md"]);
    expect((await readdir(dir))).toHaveLength(2);
  });
});
