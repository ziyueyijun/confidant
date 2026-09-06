// 文件树展开集合(04/13):按工作区载入记忆、当前文档父目录自动展开、toggle 即持久化。
// 从 App.tsx 拆分(22)。

import { useCallback, useEffect, useRef, useState } from "react";
import type { OpenNote } from "../session/types";
import type { Workspace } from "../workspace/workspace";
import { dirAncestorsOf, relPathOf } from "../workspace/workspace";

export function useTreeExpansion(workspace: Workspace | null, doc: OpenNote | null): {
  expanded: ReadonlySet<string>;
  toggleDir: (relPath: string) => void;
} {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // persistExpanded 需要最新工作区(自身 [] 稳定):经 ref 镜像参数。
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // 树展开记忆:按工作区载入;切换工作区时恢复对应展开集合
  useEffect(() => {
    if (!workspace) return;
    void (async () => {
      const map = (await window.confidant.stateGet("expanded")) as Record<string, string[]> | null;
      const rels = map?.[workspace.root] ?? [];
      setExpanded(new Set(rels));
    })();
  }, [workspace]);

  const persistExpanded = useCallback((rels: string[]) => {
    const ws = workspaceRef.current;
    if (!ws) return;
    void (async () => {
      const map =
        ((await window.confidant.stateGet("expanded")) as Record<string, string[]> | null) ?? {};
      map[ws.root] = rels;
      window.confidant.stateSet("expanded", map);
    })();
  }, []);

  // 当前文件自动展开定位(父目录折叠时自动展开,写回记忆)
  useEffect(() => {
    const ws = workspace;
    if (!ws || !doc) return;
    const rel = relPathOf(ws.root, doc.path);
    if (!rel) return;
    const dirParts = rel.split("/");
    if (dirParts.length <= 1) return;
    const dirRel = dirParts.slice(0, -1).join("/");
    const needed = dirAncestorsOf(dirRel);
    setExpanded((prev) => {
      const missing = needed.filter((p) => !prev.has(p));
      if (missing.length === 0) return prev;
      const nextSet = new Set(prev);
      for (const p of missing) nextSet.add(p);
      return nextSet;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, doc]);

  // 展开集合变更 → 持久化(去抖由 stateSet 主进程侧兜底;此处直接整体写)
  const toggleDir = useCallback(
    (relPath: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(relPath)) next.delete(relPath);
        else next.add(relPath);
        persistExpanded([...next]);
        return next;
      });
    },
    [persistExpanded],
  );

  return { expanded, toggleDir };
}
