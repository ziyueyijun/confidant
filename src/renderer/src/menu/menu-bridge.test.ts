// 菜单模板结构测试(07):七菜单结构、主题顶级菜单、偏好设置入口、快捷键表。
// buildMenuTemplate 为纯函数(不触 window),直接断言模板树。

import { describe, expect, it } from "vitest";
import type { MenuItemTemplate } from "@shared/ipc";
import { buildMenuTemplate, Cmd } from "./menu-bridge";

/** 按 id 找模板项(深度优先)。 */
function findItem(items: MenuItemTemplate[], id: string): MenuItemTemplate | null {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.submenu) {
      const hit = findItem(it.submenu, id);
      if (hit) return hit;
    }
  }
  return null;
}

function topLabels(items: MenuItemTemplate[]): string[] {
  return items.filter((i) => i.type !== "separator").map((i) => i.label ?? "");
}

describe("buildMenuTemplate(07:七菜单结构)", () => {
  it("顶级菜单 = 文件/编辑/段落/格式/视图/主题/帮助(无「设置」)", () => {
    const tpl = buildMenuTemplate();
    expect(topLabels(tpl)).toEqual(["文件", "编辑", "段落", "格式", "视图", "主题", "帮助"]);
    expect(findItem(tpl, "menu-settings")).toBeNull();
    expect(findItem(tpl, "menu-appearance")).toBeNull();
  });

  it("「主题」为顶级菜单:三主题勾选项", () => {
    const tpl = buildMenuTemplate();
    const theme = findItem(tpl, "menu-theme");
    expect(theme?.type).toBe("submenu");
    const labels = (theme!.submenu ?? []).map((i) => i.label);
    expect(labels).toEqual(["GitHub", "Night", "Newsprint"]);
    expect(findItem(tpl, Cmd.themeGithub)).not.toBeNull();
    expect(findItem(tpl, Cmd.themeNight)).not.toBeNull();
    expect(findItem(tpl, Cmd.themeNewsprint)).not.toBeNull();
    // 视图菜单内不再有主题子菜单
    const view = findItem(tpl, "menu-view");
    expect(findItem(view!.submenu ?? [], "menu-theme")).toBeNull();
  });

  it("「文件 → 偏好设置…」带 Ctrl+, 快捷键", () => {
    const tpl = buildMenuTemplate();
    const prefs = findItem(tpl, Cmd.preferences);
    expect(prefs?.label).toBe("偏好设置…");
    expect(prefs?.accelerator).toBe("Ctrl+,");
  });

  it("视图菜单:模式项与快捷键(F8/F9/F11/Ctrl+/),侧栏显隐对齐 Typora Ctrl+Shift+L", () => {
    const tpl = buildMenuTemplate();
    expect(findItem(tpl, Cmd.toggleSidebar)?.accelerator).toBe("Ctrl+Shift+L");
    expect(findItem(tpl, Cmd.sourceMode)?.accelerator).toBe("Ctrl+/");
    expect(findItem(tpl, Cmd.focusMode)?.accelerator).toBe("F8");
    expect(findItem(tpl, Cmd.typewriterMode)?.accelerator).toBe("F9");
    expect(findItem(tpl, Cmd.fullscreen)?.accelerator).toBe("F11");
    expect(findItem(tpl, Cmd.workspaceSearch)?.accelerator).toBe("Ctrl+Shift+F");
  });

  it("快捷键对齐 Typora 实测键位:任务列表 Ctrl+Shift+X、清除格式 Ctrl+\\", () => {
    const tpl = buildMenuTemplate();
    expect(findItem(tpl, Cmd.taskList)?.accelerator).toBe("Ctrl+Shift+X");
    expect(findItem(tpl, Cmd.clearFormat)?.accelerator).toBe("Ctrl+\\");
  });

  it("设置命令不再出现在模板(迁入偏好设置窗口);注册表仍保留 id", () => {
    const tpl = buildMenuTemplate();
    expect(findItem(tpl, Cmd.settingsCodeWrap)).toBeNull();
    expect(findItem(tpl, Cmd.settingsCodeLineNumbers)).toBeNull();
  });
});
