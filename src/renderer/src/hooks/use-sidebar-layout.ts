// 侧栏布局(04):可见性与宽度,持久化到 state("sidebar")。从 App.tsx 拆分(22)。

import { useCallback, useEffect, useState } from "react";

export interface SidebarLayout {
  visible: boolean;
  width: number;
}

export function useSidebarLayout(): {
  sidebar: SidebarLayout;
  /** 拖拽中实时宽度(不落盘;由 commitSidebar 在拖拽结束时整体提交)。 */
  setWidth: (width: number) => void;
  /** 菜单/顶栏「侧栏显示/隐藏」切换并立即持久化。 */
  toggleSidebar: () => void;
  /** 拖拽结束提交宽度(持久化)。 */
  commitSidebar: (layout: SidebarLayout) => void;
} {
  const [sidebar, setSidebar] = useState<SidebarLayout>({ visible: true, width: 260 });

  // 启动载入持久化布局
  useEffect(() => {
    void (async () => {
      const stored = (await window.confidant.stateGet("sidebar")) as
        | { visible?: boolean; width?: number }
        | null;
      if (stored && typeof stored === "object") {
        setSidebar((prev) => ({
          visible: typeof stored.visible === "boolean" ? stored.visible : prev.visible,
          width: typeof stored.width === "number" ? stored.width : prev.width,
        }));
      }
    })();
  }, []);

  const setWidth = useCallback((width: number) => {
    setSidebar((prev) => ({ ...prev, width }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebar((prev) => {
      const next = { ...prev, visible: !prev.visible };
      window.confidant.stateSet("sidebar", next);
      return next;
    });
  }, []);

  const commitSidebar = useCallback((layout: SidebarLayout) => {
    window.confidant.stateSet("sidebar", layout);
  }, []);

  return { sidebar, setWidth, toggleSidebar, commitSidebar };
}
