// 启动恢复(13):有历史 → 恢复工作区与最后文件;文件缺失 → 12 横幅语义;自愈补开。
// 从 App.tsx 拆分(22);工作区/文档为渲染态参数(自愈 effect 依赖)。
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { OpenNote } from "../session/types";
import type { Workspace } from "../workspace/workspace";

export interface StartupRecoveryApi {
  openWorkspace: (root: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  openMissingNoteBanner: (absPath: string) => void;
  setLoadError: Dispatch<SetStateAction<string | null>>;
}

export function useStartupRecovery(
  workspace: Workspace | null,
  doc: OpenNote | null,
  api: StartupRecoveryApi,
): void {
  const { openWorkspace, openPath, openMissingNoteBanner, setLoadError } = api;

// ── 启动恢复(13):有历史 → 恢复工作区与最后文件;文件缺失 → 12 横幅语义 ──
  const restoreAttempted = useRef(false);
  const restoreRootRef = useRef<string | null>(null);
  const restoreFileRef = useRef<string | null>(null);
  const restoreRetried = useRef(false);
  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    void (async () => {
      const last = (await window.confidant.stateGet("lastSession")) as {
        workspace: string | null;
        file: string | null;
      } | null;
      if (!last?.workspace) return; // 无历史 → 欢迎页
      restoreRootRef.current = last.workspace;
      restoreFileRef.current = last.file ?? null;
      const res = await window.confidant.openWorkspace(last.workspace);
      if (!res.ok) {
        setLoadError(`恢复工作区失败:${res.error.message}`);
        return;
      }
      if (!last.file) return;
      const fileRes = await window.confidant.readTextFile(last.file);
      if (!fileRes.ok) {
        // 最后文件已不存在:按 12 处置(横幅,不静默)
        openMissingNoteBanner(last.file);
        return;
      }
      await openPath(last.file);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 恢复自愈:工作区状态未落到预期根(或缺失)且已有文档上下文 → 补开工作区并重开文件
  useEffect(() => {
    const root = restoreRootRef.current;
    if (!root || restoreRetried.current) return;
    const wsOk = workspace && workspace.root.toLowerCase() === root.toLowerCase();
    if (wsOk) return;
    if (!doc && workspace) return; // 无文档且已开其他工作区:尊重用户状态
    restoreRetried.current = true;
    void openWorkspace(root).then(() => {
      const file = restoreFileRef.current;
      if (file) void openPath(file);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, workspace]);
}
