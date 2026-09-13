// 同步状态表读写(决议 32–35)。按工作区为键,每完成一个文件写一次。
// 读取失败(不存在/损坏/键不符)→ 返回 null,退化为「无状态表」→ 走保守合并;
// 绝不静默重建为空表(决议 33:空表 + 删除传播 = 本地全删)。

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SyncFileRecord, SyncState, SyncStateStore } from "./sync-types";

const VERSION = 1;

function stateFileName(workspacePath: string): string {
  const hash = createHash("sha256").update(workspacePath).digest("hex").slice(0, 16);
  const readable = basename(workspacePath).replace(/[^\w.-]+/g, "_").slice(0, 40) || "workspace";
  return `${readable}.${hash}.sync-state.json`;
}

function freshState(workspacePath: string): SyncState {
  return { version: VERSION, workspace: workspacePath, initializedAt: null, records: {} };
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmp, content, "utf8");
    await rename(tmp, path);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      // 忽略清理失败,保留原错误
    }
    throw err;
  }
}

function parseState(raw: string, workspacePath: string): SyncState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // 损坏 → 无状态表
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const st = parsed as Partial<SyncState>;
  if (st.version !== VERSION) return null;
  if (st.workspace !== workspacePath) return null; // 键不符:不信任
  if (st.records === null || typeof st.records !== "object") return null;
  return {
    version: VERSION,
    workspace: workspacePath,
    initializedAt: typeof st.initializedAt === "number" ? st.initializedAt : null,
    records: st.records as Record<string, SyncFileRecord>,
  };
}

/** 建某工作区的状态表读写器;`dir` 为状态文件所在目录(userData 侧由调用方给出)。 */
export function createSyncStateStore(opts: { dir: string; workspacePath: string }): SyncStateStore {
  const filePath = join(opts.dir, stateFileName(opts.workspacePath));
  const workspacePath = opts.workspacePath;

  async function load(): Promise<SyncState | null> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      return null; // 不存在/不可读 → 无状态表
    }
    return parseState(raw, workspacePath);
  }

  async function save(state: SyncState): Promise<void> {
    await writeAtomic(filePath, JSON.stringify(state, null, 2));
  }

  return {
    load,
    save,
    async upsert(relPath: string, rec: SyncFileRecord): Promise<void> {
      const state = (await load()) ?? freshState(workspacePath);
      state.records[relPath] = rec;
      await save(state);
    },
    async markDeleted(relPath: string): Promise<void> {
      const state = await load();
      if (!state) return; // 无表可标记;不凭空建表
      const cur = state.records[relPath];
      if (!cur) return;
      state.records[relPath] = { ...cur, tombstone: true };
      await save(state);
    },
    async forget(relPath: string): Promise<void> {
      const state = await load();
      if (!state) return;
      if (!(relPath in state.records)) return;
      delete state.records[relPath];
      await save(state);
    },
  };
}
