// 同步运行状态(票 02;渲染层)。单个工作区一次一个(决议 12);同步前强制 flush(决议 9)。
// 进度经主进程 sync:progress 推送;最终结果由 startSync 的 invoke 返回。

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncOutcome, SyncProgress } from "@shared/sync";

export interface SyncUi {
  running: boolean;
  done: number;
  total: number;
  current: string | null;
  /** 最近一次同步的结果(未跑过为 null)。 */
  last: SyncOutcome | null;
  /** 发起同步:先 await beforeStart(强制 flush),再跑;不重入。 */
  start(workspacePath: string, beforeStart: () => Promise<void>): Promise<void>;
  cancel(): void;
}

export function useSyncRun(): SyncUi {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>({ done: 0, total: 0, current: null });
  const [last, setLast] = useState<SyncOutcome | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    return window.confidant.onSyncProgress((p) => setProgress(p));
  }, []);

  const start = useCallback(async (workspacePath: string, beforeStart: () => Promise<void>) => {
    if (runningRef.current) return; // 不做重入(决议 12)
    runningRef.current = true;
    setRunning(true);
    setLast(null);
    setProgress({ done: 0, total: 0, current: null });
    try {
      await beforeStart(); // 决议 9:同步前强制 flush 未保存内容
      const res = await window.confidant.startSync(workspacePath);
      setLast(res.ok ? res.value : { status: "error", message: res.error.message });
    } catch (err) {
      setLast({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  const cancel = useCallback(() => {
    window.confidant.cancelSync();
  }, []);

  return { running, done: progress.done, total: progress.total, current: progress.current, last, start, cancel };
}
