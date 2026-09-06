// 窗口状态记忆(25):记得上次是否最大化与正常态 bounds,重启还原。
// 规则:resize/move/maximize/unmaximize/close 时捕获(落到 state.json,防抖落盘);
// 最小化不作持久记忆(临时态);保存位置与任一显示器工作区无交集时回退默认(显示器变更兜底)。

import { screen, type BrowserWindow, type Rectangle } from "electron";
import { getState, setState, type WindowStateV1 } from "./state-store";

/** 启动恢复的窗口几何:保存在屏内则用,屏外回退 null(走默认尺寸与 OS 默认放置)。 */
export function restoreBounds(state: WindowStateV1): Rectangle | null {
  const b = state.bounds;
  if (!b) return null;
  const visible = screen.getAllDisplays().some((d) => intersects(b, d.workArea));
  return visible ? { ...b } : null;
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 把当前窗口几何写入持久状态(getNormalBounds 在最大化时仍给出正常态值)。 */
export function captureWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  setState("window", { maximized: win.isMaximized(), bounds: win.getNormalBounds() });
}

/** 在窗口生命周期上挂接几何捕获。 */
export function attachWindowStateCapture(win: BrowserWindow): void {
  const capture = (): void => captureWindowState(win);
  win.on("resize", capture);
  win.on("move", capture);
  win.on("maximize", capture);
  win.on("unmaximize", capture);
  win.on("close", capture);
}

/** 读取持久化的窗口状态(缺省走默认值)。 */
export async function loadWindowState(): Promise<WindowStateV1> {
  return getState("window");
}
