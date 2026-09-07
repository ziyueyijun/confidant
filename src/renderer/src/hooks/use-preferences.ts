// 偏好设置(07):外观「显示工具栏」开关(默认关);持久化 + 跨窗同步
// (偏好设置窗口与主窗口经 state:changed 广播互相同步)。

import { useCallback, useEffect, useState } from "react";

export interface Preferences {
  /** 底部悬浮格式工具栏显示开关(07:默认隐藏,偏好设置「外观 → 显示工具栏」开启后显示)。 */
  showToolbar: boolean;
}

const DEFAULT_PREFERENCES: Preferences = { showToolbar: false };

export function usePreferences(): {
  preferences: Preferences;
  setShowToolbar: (v: boolean) => void;
} {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  // 启动载入持久化设置
  useEffect(() => {
    void (async () => {
      const stored = (await window.confidant.stateGet("preferences")) as Partial<Preferences> | null;
      if (stored && typeof stored === "object") {
        setPreferences((prev) => ({
          showToolbar:
            typeof stored.showToolbar === "boolean" ? stored.showToolbar : prev.showToolbar,
        }));
      }
    })();
  }, []);

  // 跨窗同步:偏好设置窗口改动后广播到达即重载
  useEffect(() => {
    return window.confidant.onStateChanged((key) => {
      if (key !== "preferences") return;
      void (async () => {
        const stored = (await window.confidant.stateGet("preferences")) as Partial<Preferences> | null;
        if (stored && typeof stored === "object" && typeof stored.showToolbar === "boolean") {
          setPreferences({ showToolbar: stored.showToolbar });
        }
      })();
    });
  }, []);

  const setShowToolbar = useCallback((v: boolean) => {
    setPreferences((prev) => {
      const next = { ...prev, showToolbar: v };
      window.confidant.stateSet("preferences", next);
      return next;
    });
  }, []);

  return { preferences, setShowToolbar };
}
