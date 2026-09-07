// 外观主题(01):github/night/newsprint 三态(「跟随系统」已取消,01 决议);
// 持久化 + DOM data-theme + 菜单勾选同源。
// 从 App.tsx 拆分(22)。menu 勾选同步经 menuRef 指向的桥(不订阅重建)。

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { MenuBridge } from "../menu/menu-bridge";
import { Cmd } from "../menu/menu-bridge";
import { normalizeTheme, type ThemeId } from "../theme/theme-state";

export type { ThemeId } from "../theme/theme-state";

export function useAppTheme(menuRef: RefObject<MenuBridge | null>): {
  theme: ThemeId;
  applyTheme: (theme: ThemeId) => void;
} {
  const [theme, setTheme] = useState<ThemeId>("github");

  // 启动载入持久化选择(无记录/旧值 → normalizeTheme 迁移)
  useEffect(() => {
    void (async () => {
      const saved = await window.confidant.stateGet("theme");
      setTheme(normalizeTheme(saved));
    })();
  }, []);

  // 生效:写 data-theme;「主题」菜单勾选同源
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const menu = menuRef.current;
    if (menu) {
      menu.setChecked(Cmd.themeGithub, theme === "github");
      menu.setChecked(Cmd.themeNight, theme === "night");
      menu.setChecked(Cmd.themeNewsprint, theme === "newsprint");
    }
  }, [theme, menuRef]);

  const applyTheme = useCallback((next: ThemeId) => {
    setTheme(next);
    window.confidant.stateSet("theme", next);
  }, []);

  return { theme, applyTheme };
}
