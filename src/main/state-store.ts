// 应用级持久状态(userData/state.json;04 票:最近打开、树展开、侧栏、会话恢复数据)。
// 统一 JSON 文件,原子写 + 防抖落盘;渲染层经 IPC 读(get)/写(set)。

import { app } from "electron";
import { join } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { writeTextFileAtomic } from "../../packages/files";

export interface RecentFolder {
  path: string;
  /** 文件夹名(展示)。 */
  name: string;
  lastOpenedAt: number;
}

export interface LastSession {
  workspace: string | null;
  file: string | null;
}

/** 窗口状态记忆(25):关闭时记住最大/正常与正常态 bounds,重启还原。 */
export interface WindowStateV1 {
  /** 上次关闭时是否处于最大化。 */
  maximized: boolean;
  /** 正常态位置与大小(最大化前的值);从未记录过为 null。 */
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface AppStateV1 {
  version: 1;
  recentFolders: RecentFolder[];
  lastSession: LastSession;
  sidebar: { visible: boolean; width: number };
  /** 树展开记忆:工作区根路径 → 展开的目录相对路径列表。 */
  expanded: Record<string, string[]>;
  theme: "system" | "light" | "dark";
  window: WindowStateV1;
  /** 编辑器设置(28):代码块自动换行/行号,默认均开。 */
  editorSettings: { codeWrap: boolean; codeLineNumbers: boolean };
}

const DEFAULT_STATE: AppStateV1 = {
  version: 1,
  recentFolders: [],
  lastSession: { workspace: null, file: null },
  sidebar: { visible: true, width: 260 },
  expanded: {},
  theme: "system",
  window: { maximized: false, bounds: null },
  editorSettings: { codeWrap: true, codeLineNumbers: true },
};

export const RECENT_LIMIT = 10;

let cached: AppStateV1 | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Promise<void> = Promise.resolve();

function statePath(): string {
  return join(app.getPath("userData"), "state.json");
}

async function load(): Promise<AppStateV1> {
  if (cached) return cached;
  try {
    const raw = JSON.parse(await readFile(statePath(), "utf8")) as Partial<AppStateV1>;
    if (raw?.version === 1) {
      cached = { ...DEFAULT_STATE, ...raw };
    }
  } catch {
    // 首次启动或无文件/损坏:走默认
  }
  cached ??= { ...DEFAULT_STATE };
  return cached;
}

function persistSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const state = cached;
    if (!state) return;
    pendingSave = (async () => {
      await mkdir(join(app.getPath("userData")), { recursive: true });
      await writeTextFileAtomic(statePath(), JSON.stringify(state, null, 2));
    })().catch((err) => console.error("[state] persist failed:", err));
  }, 300);
}

/** 等当前待写落盘(退出前):防抖计时器未触发时补一次立即写,避免退出瞬间丢状态。 */
export async function flushState(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    const state = cached;
    if (state) {
      pendingSave = (async () => {
        await mkdir(join(app.getPath("userData")), { recursive: true });
        await writeTextFileAtomic(statePath(), JSON.stringify(state, null, 2));
      })().catch((err) => console.error("[state] persist failed:", err));
    }
  }
  await pendingSave;
}

export async function getState<K extends keyof AppStateV1>(key: K): Promise<AppStateV1[K]> {
  const s = await load();
  return s[key];
}

export function setState<K extends keyof AppStateV1>(key: K, value: AppStateV1[K]): void {
  if (!cached) void load().then(() => setState(key, value));
  else {
    (cached as unknown as Record<string, unknown>)[key] = value;
    persistSoon();
  }
}

/** 记录一次「打开文件夹」到最近列表(新前旧后、去重、上限 10)。 */
export async function pushRecentFolder(path: string): Promise<void> {
  const s = await load();
  const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
  const rest = s.recentFolders.filter((r) => r.path.toLowerCase() !== path.toLowerCase());
  s.recentFolders = [{ path, name, lastOpenedAt: Date.now() }, ...rest].slice(0, RECENT_LIMIT);
  persistSoon();
}

/** 会话恢复数据:最近工作区与其中最后编辑的文件。 */
export async function updateLastSession(session: Partial<LastSession>): Promise<void> {
  const s = await load();
  s.lastSession = { ...s.lastSession, ...session };
  persistSoon();
}
