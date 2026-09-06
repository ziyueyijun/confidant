// 外观主题(18):跟随系统 / 浅色 / 深色三态;持久化 + DOM data-theme + 菜单勾选同源。
// 从 App.tsx 拆分(22)。menu 勾选同步经 menuRef 指向的桥(不订阅重建)。

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { MenuBridge } from "../menu/menu-bridge";
import { Cmd } from "../menu/menu-bridge";

export type ThemeMode = "system" | "light" | "dark";

export function useAppTheme(menuRef: RefObject<MenuBridge | null>): {
  themeMode: ThemeMode;
  applyThemeMode: (mode: ThemeMode) => void;
} {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  // 启动载入持久化选择(无记录 → 跟随系统)
  useEffect(() => {
    void (async () => {
      const saved = (await window.confidant.stateGet("theme")) as ThemeMode | null;
      setThemeMode(saved === "light" || saved === "dark" ? saved : "system");
    })();
  }, []);

  // 生效:写 data-theme;菜单外观勾选同源;跟随系统时订阅系统切换
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (): void => {
      const effective = themeMode === "system" ? (mq.matches ? "dark" : "light") : themeMode;
      document.documentElement.dataset.theme = effective;
      const menu = menuRef.current;
      if (menu) {
        menu.setChecked(Cmd.themeSystem, themeMode === "system");
        menu.setChecked(Cmd.themeLight, themeMode === "light");
        menu.setChecked(Cmd.themeDark, themeMode === "dark");
      }
    };
    apply();
    if (themeMode === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    return undefined;
  }, [themeMode, menuRef]);

  const applyThemeMode = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    window.confidant.stateSet("theme", mode);
  }, []);

  return { themeMode, applyThemeMode };
}
