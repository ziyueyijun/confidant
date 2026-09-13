// 启动探测状态(票 07;渲染层)。只做三件事,都不碰网络:
//   1) 打开工作区后**一次**调主进程 probeSync(决议 8;不做轮询、不定时探测);
//   2) 远端有本机未知变更 → true(页脚小圆点);
//   3) 同步完成后清除(决议 8)。
// 「未打开工作区 → 不探测」由 probePathFor 保证;「未配置同步 → 零请求」在主进程侧判。
// 主进程的探测失败已静默降级为 false,这里的 catch 只是兜底(同样降级为不显示)。

import { useEffect, useRef, useState } from "react";
import type { SyncOutcome } from "@shared/sync";
import { dotClearedByOutcome, probePathFor } from "./probe-gating";

/** 远端是否本机未知变更(页脚圆点)。`lastOutcome` 变化且已完成同步时清除。 */
export function useSyncProbe(workspacePath: string | null, lastOutcome: SyncOutcome | null): boolean {
  const [unknownRemoteChanges, setUnknown] = useState(false);
  // 代际计数:工作区切换 / 同步完成都会 +1,用来作废在途探测结果(避免旧结果回写)。
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const target = probePathFor(workspacePath);
    if (!target) {
      setUnknown(false); // 未打开工作区 → 不探测,圆点熄灭
      return;
    }
    const gen = generation.current;
    void (async () => {
      try {
        const res = await window.confidant.probeSync(target);
        if (generation.current === gen) setUnknown(res.hasUnknownChanges);
      } catch {
        // 兜底:探测异常也不打断启动、不显示圆点。
        if (generation.current === gen) setUnknown(false);
      }
    })();
  }, [workspacePath]);

  useEffect(() => {
    if (!dotClearedByOutcome(lastOutcome)) return; // 非成功完成(error / cancelled / 未跑过)→ 保留
    generation.current += 1; // 作废在途探测
    setUnknown(false);
  }, [lastOutcome]);

  return unknownRemoteChanges;
}
