// 最近打开(13/27):「文件 → 最近打开」菜单动态子项数据源(27:欢迎页不再陈列)。
// 从 App.tsx 拆分(22)。
import { useEffect, useState, type RefObject } from "react";
import type { MenuBridge } from "../menu/menu-bridge";

export function useRecentFolders(api: {
  menuRef: RefObject<MenuBridge | null>;
  openWorkspace: (root: string) => Promise<void>;
}): void {
  const { menuRef, openWorkspace } = api;

// ── 最近打开(13):欢迎页列表 + 菜单动态子项同一数据源 ──
  const [recentFolders, setRecentFolders] = useState<Array<{ path: string; name: string }>>([]);
  useEffect(() => {
    void (async () => {
      const list = (await window.confidant.stateGet("recentFolders")) as
        | Array<{ path: string; name: string }>
        | null;
      setRecentFolders(list ?? []);
    })();
  }, []);
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const recents = recentFolders.map((r) => ({ path: r.path, name: r.name }));
    menu.rebuildRecent(recents);
    recents.forEach((r, i) => {
      menu.register(`recent-${i}`, () => true, () => void openWorkspace(r.path));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentFolders, openWorkspace]);
}
