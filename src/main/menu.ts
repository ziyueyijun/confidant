// 主进程 native 菜单:渲染层模板 → Menu。菜单项点击 → 渲染层命令 id。

import { BrowserWindow, Menu, MenuItem, type MenuItemConstructorOptions } from "electron";
import { IPC, type MenuItemState, type MenuItemTemplate } from "@shared/ipc";

let current: Menu | null = null;
const byId = new Map<string, MenuItem>();
/** 模板尚未落地(渲染层启动竞态)时先暂存状态,模板就绪后回放。 */
let pendingStates: MenuItemState[] | null = null;

function toConstructorOptions(
  tpl: MenuItemTemplate,
  sendCommand: (id: string) => void,
): MenuItemConstructorOptions {
  if (tpl.type === "role") {
    return { id: tpl.id, label: tpl.label, role: tpl.role as MenuItemConstructorOptions["role"] };
  }
  if (tpl.type === "separator") {
    return { type: "separator" };
  }
  const item: MenuItemConstructorOptions = { id: tpl.id, label: tpl.label, accelerator: tpl.accelerator };
  if (tpl.type === "submenu") {
    item.submenu = (tpl.submenu ?? []).map((c) => toConstructorOptions(c, sendCommand));
  } else {
    item.click = () => sendCommand(tpl.id);
  }
  return item;
}

/** 整表重建应用菜单;同时维护 id → MenuItem 索引供状态更新。 */
export function applyMenuTemplate(
  template: MenuItemTemplate[],
  target: () => BrowserWindow | null,
): void {
  const sendCommand = (id: string): void => {
    const win = target();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IPC.menuCommand, id);
  };
  current = Menu.buildFromTemplate(template.map((t) => toConstructorOptions(t, sendCommand)));
  byId.clear();
  const index = (items: MenuItem[]): void => {
    for (const it of items) {
      if (it.id) byId.set(it.id, it);
      const sub = it.submenu;
      if (sub) index(sub.items);
    }
  };
  index(current.items);
  Menu.setApplicationMenu(current);
  if (pendingStates) {
    const replay = pendingStates;
    pendingStates = null;
    updateMenuItems(replay);
  }
}

export function updateMenuItems(states: MenuItemState[]): void {
  if (byId.size === 0) {
    pendingStates = [...(pendingStates ?? []), ...states];
    return;
  }
  for (const s of states) {
    const item = byId.get(s.id);
    if (!item) continue;
    item.enabled = s.enabled;
    if (s.checked !== undefined) item.checked = s.checked;
  }
}

/** 查询已构建菜单项状态(自检驱动用)。 */
export function getMenuItem(
  id: string,
): { label: string; enabled: boolean; accelerator?: string } | null {
  const item = byId.get(id);
  return item
    ? { label: item.label, enabled: item.enabled, accelerator: item.accelerator ?? undefined }
    : null;
}

/**
 * 临时上下文菜单(右键菜单;renderer 经 IPC 触发)。
 * 返回所选正常项 id;关闭/跳出返回 null。role/separator 不产生选择。
 */
export function popupContextMenu(
  win: BrowserWindow,
  template: MenuItemTemplate[],
): Promise<string | null> {
  return new Promise((resolve) => {
    let chosen: string | null = null;
    const clicked = (id: string): void => {
      chosen = id;
    };
    const convert = (tpl: MenuItemTemplate): MenuItemConstructorOptions => {
      if (tpl.type === "separator") return { type: "separator" };
      if (tpl.type === "role") {
        return { label: tpl.label, role: tpl.role as MenuItemConstructorOptions["role"] };
      }
      const opt: MenuItemConstructorOptions = { label: tpl.label };
      if (tpl.type === "submenu") {
        opt.submenu = (tpl.submenu ?? []).map(convert);
      } else {
        opt.click = () => clicked(tpl.id);
        opt.enabled = tpl.enabled !== false;
      }
      return opt;
    };
    const menu = Menu.buildFromTemplate(template.map(convert));
    menu.on("menu-will-close", () => {
      setImmediate(() => resolve(chosen));
    });
    menu.popup({ window: win });
  });
}
