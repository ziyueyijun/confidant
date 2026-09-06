// 工作区主进程侧:监听(外部增删改原位即时反映,规格 §8)+ 变更后重扫广播。
// 变更事件去抖 250ms 后整体重扫(树小,重扫成本低且与磁盘无二义),连同批次原始
// 事件一起推送(12 外部变更处置消费);搜索(15)在此之上演进。

import { watch, type FSWatcher } from "chokidar";
import { scanWorkspaceTree, type TreeEntry } from "../../packages/files";
import type { WorkspaceFsEvent, WorkspaceTreeUpdate } from "@shared/ipc";

let currentRoot: string | null = null;
let currentWatcher: FSWatcher | null = null;
let rescanTimer: ReturnType<typeof setTimeout> | null = null;
let changedSinceScan = false;
let eventBatch: WorkspaceFsEvent[] = [];
let broadcast: ((update: WorkspaceTreeUpdate) => void) | null = null;

export function currentWorkspaceRoot(): string | null {
  return currentRoot;
}

async function doRescan(rootAbs: string): Promise<void> {
  changedSinceScan = false;
  const batch = eventBatch;
  eventBatch = [];
  try {
    const tree = await scanWorkspaceTree(rootAbs);
    broadcast?.({ tree, events: batch });
  } catch (err) {
    console.error("[workspace] rescan failed:", err);
  }
}

function scheduleRescan(rootAbs: string): void {
  changedSinceScan = true;
  if (rescanTimer) return;
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    if (changedSinceScan) void doRescan(rootAbs);
  }, 250);
}

/** 打开工作区:起监听并返回初始整树;切换先停旧。 */
export async function startWorkspaceWatch(
  rootAbs: string,
  onUpdate: (update: WorkspaceTreeUpdate) => void,
): Promise<TreeEntry[]> {
  await stopWorkspaceWatch();
  currentRoot = rootAbs;
  broadcast = onUpdate;

  const push = (type: WorkspaceFsEvent["type"]) => (path: string): void => {
    eventBatch.push({ type, path });
    scheduleRescan(rootAbs);
  };

  currentWatcher = watch(rootAbs, {
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    ignored: (path: string) => {
      // 跳过原子写的临时文件(自身保存的防抖噪音);其余全部参与
      const base = path.split(/[\\/]/).pop() ?? "";
      return base.includes(".confidant-tmp-");
    },
  });
  currentWatcher
    .on("add", push("add"))
    .on("change", push("change"))
    .on("unlink", push("unlink"))
    .on("addDir", push("addDir"))
    .on("unlinkDir", push("unlinkDir"))
    .on("error", (err) => console.error("[workspace] watcher error:", err));

  const tree = await scanWorkspaceTree(rootAbs);
  return tree;
}

export async function stopWorkspaceWatch(): Promise<void> {
  if (rescanTimer) {
    clearTimeout(rescanTimer);
    rescanTimer = null;
  }
  changedSinceScan = false;
  eventBatch = [];
  if (currentWatcher) {
    await currentWatcher.close();
    currentWatcher = null;
  }
  currentRoot = null;
  broadcast = null;
}

/** 强制立即重扫并广播(应用自身文件操作后调用,保证树/磁盘无二义)。 */
export async function rescanNow(): Promise<void> {
  const root = currentRoot;
  if (!root) return;
  if (rescanTimer) {
    clearTimeout(rescanTimer);
    rescanTimer = null;
  }
  await doRescan(root);
}
