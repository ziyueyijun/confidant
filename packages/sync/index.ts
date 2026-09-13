// packages/sync —— 入口点:同步引擎骨架与状态表读写。
// 本票立形状(依赖注入 SyncDeps、配置/进度/报告类型、状态表读写);同步算法由
// 后续票(02–07)在 lib/ 自己的模块上生长,不整文件重写。本包不依赖 Electron。

import type { SyncRetryPolicy, SyncThresholds } from "./lib/sync-types";

export { createSyncStateStore } from "./lib/state-store";

// ── 同步引擎(票 02) ────────────────────────────────────────────────────────
export { createSyncEngine, SyncAbortedError, SyncFatalError } from "./lib/engine";
export type { SyncEngineOptions } from "./lib/engine";
/** 另一个同步任务持锁时抛出(决议 37)。 */
export { SyncBusyError } from "./lib/lock";

/** 默认阈值(决议 17、27):100 MB 上限;熔断 20 个 / 20%。测试传极小值。 */
export const DEFAULT_SYNC_THRESHOLDS: SyncThresholds = {
  maxFileSizeBytes: 100 * 1024 * 1024,
  deleteGuardMax: 20,
  deleteGuardRatio: 0.2,
};

/** 默认重试(决议 58):2 次重试,指数退避 200ms 起。 */
export const DEFAULT_SYNC_RETRY: SyncRetryPolicy = { attempts: 2, baseDelayMs: 200 };

export type {
  SyncConfig,
  SyncDeps,
  SyncEngine,
  SyncFileRecord,
  SyncIssue,
  SyncProgress,
  SyncReport,
  SyncRetryPolicy,
  SyncState,
  SyncStateStore,
  SyncThresholds,
} from "./lib/sync-types";
