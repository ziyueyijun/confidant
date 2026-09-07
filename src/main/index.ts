// 主进程:窗口生命周期、IPC 承载与自检驱动。
// 单窗口形态(无托盘/无状态栏);Windows 平台规则:窗口全关即退出。

import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
} from "electron";
import { basename, join } from "node:path";
import { mkdirSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import {
  IPC,
  type ErrorInfo,
  type MenuItemState,
  type MenuItemTemplate,
  type Result,
  type WorkspaceSearchFileHit,
} from "@shared/ipc";
import {
  collectMarkdownPaths,
  createNoteFile,
  extForImageMime,
  findLineHits,
  makeFolder,
  moveInto,
  readTextFile,
  renameEntry,
  saveImageBytes,
  saveImageCopy,
  scanWorkspaceTree,
  writeTextFileAtomic,
  type TreeEntry,
} from "../../packages/files";
import { applyMenuTemplate, getMenuItem, popupContextMenu, updateMenuItems } from "./menu";
import { registerImageScheme, installImageProtocolHandler } from "./asset-protocol";
import {
  attachWindowStateCapture,
  loadWindowState,
  restoreBounds,
} from "./window-state";
import {
  runRestoreCheck,
  runRestoreSeed,
  runSelfCheck,
  runWorkspaceSelfCheck,
} from "./smoke";
import {

  currentWorkspaceRoot,
  rescanNow,
  startWorkspaceWatch,
  stopWorkspaceWatch,
} from "./workspace";
import {
  flushState,
  getState,
  pushRecentFolder,
  setState,
  updateLastSession,
  type AppStateV1,
} from "./state-store";

const isDev = !!process.env["ELECTRON_RENDERER_URL"];
const smoke = process.env["CONFIDANT_SMOKE"] === "1";
const e2eFile = process.env["CONFIDANT_E2E_FILE"];
const e2eFlushOnClose = process.env["CONFIDANT_E2E_FLUSHONCLOSE"] === "1";
const e2eWs = process.env["CONFIDANT_E2E_WS"] ?? null;
const e2eSeed = process.env["CONFIDANT_E2E_SEED"] ?? null;
const e2eRestore = process.env["CONFIDANT_E2E_RESTORE"] === "1";
const e2eStateDir = process.env["CONFIDANT_E2E_STATE_DIR"] ?? null;

// 自检/冒烟一律使用隔离的 userData,不污染真实应用状态
if (smoke || e2eFile || e2eWs || e2eSeed || e2eRestore) {
  if (e2eStateDir) {
    app.setPath("userData", e2eStateDir);
  } else {
    const base = process.env["TEMP"] ?? process.env["TMP"] ?? "C:/Windows/Temp";
    app.setPath("userData", join(base, "confidant-e2e-state", `run-${process.pid}`));
  }
}

function toError(err: unknown): ErrorInfo {
  const e = err as { code?: string; message?: string };
  return { code: e?.code ?? "UNKNOWN", message: e?.message ?? String(err) };
}


/**
 * 窗口关闭前的数据保护(规格 §9.3):close 时先请求渲染层 flush 未落盘内容,
 * 收到回执(或 2s 超时,渲染层卡死不阻塞退出)后再销毁窗口。
 */
function armCloseFlush(win: BrowserWindow): void {
  let flushing = false;
  win.on("close", (e) => {
    if (flushing) return;
    e.preventDefault();
    flushing = true;
    const acked = new Promise<void>((resolve) => {
      const ack = () => resolve();
      ipcMain.once(IPC.flushAck, ack);
      try {
        win.webContents.send(IPC.flushRequest);
      } catch {
        resolve();
        return;
      }
      setTimeout(() => {
        ipcMain.removeListener(IPC.flushAck, ack);
        resolve();
      }, 2000);
    });
    void acked.finally(() => win.destroy());
  });
}

async function createWindow(): Promise<BrowserWindow> {
  // 窗口状态记忆(25):屏外兜底后恢复上次的几何;最大化在显示前套用,避免闪现正常态
  const saved = await loadWindowState();
  const safeBounds = restoreBounds(saved);
  const win = new BrowserWindow({
    width: Math.max(safeBounds?.width ?? 1200, 800),
    height: Math.max(safeBounds?.height ?? 800, 560),
    ...(safeBounds ? { x: safeBounds.x, y: safeBounds.y } : {}),
    minWidth: 800,
    minHeight: 560,
    title: "confidant · 知己笔记",
    show: false,
    autoHideMenuBar: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  if (saved.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  armCloseFlush(win);
  attachWindowStateCapture(win);

  if (process.env["CONFIDANT_DEVTOOLS"] === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  if (smoke || e2eFile || e2eWs || e2eSeed || e2eRestore) {
    win.webContents.once("did-finish-load", () => {
      const emptyWs = process.env["CONFIDANT_E2E_WS_EMPTY"] ?? null;
      if (e2eWs) void runWorkspaceSelfCheck(win, e2eWs, emptyWs);
      else if (e2eSeed) void runRestoreSeed(win, e2eSeed);
      else if (e2eRestore) void runRestoreCheck(win, "a.md");
      else void runSelfCheck(win, e2eFile ?? null);
    });
  }

  if (isDev) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]!);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle(IPC.openNoteDialog, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: "打开笔记",
      properties: ["openFile"],
      filters: [{ name: "Markdown 笔记", extensions: ["md", "markdown"] }],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.readTextFile, async (_e, path: string): Promise<Result<string>> => {
    try {
      return { ok: true, value: await readTextFile(path) };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.writeTextFile, async (_e, path: string, content: string): Promise<Result<void>> => {
    try {
      await writeTextFileAtomic(path, content);
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  const menuTarget = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;

  ipcMain.on(IPC.menuSetTemplate, (e, template: MenuItemTemplate[]) => {
    // 只接受本应用窗口(单窗口形态)下发的模板
    const win = BrowserWindow.getAllWindows()[0];
    if (!win || e.sender !== win.webContents) return;
    applyMenuTemplate(template, menuTarget);
  });

  ipcMain.on(IPC.menuUpdateItems, (_e, states: MenuItemState[]) => {
    updateMenuItems(states);
  });

  ipcMain.handle(IPC.aboutDialog, async () => {
    const win = menuTarget();
    const opts: Electron.MessageBoxOptions = {
      type: "info",
      title: "关于 confidant",
      message: "知己笔记 confidant",
      detail: [
        `版本 ${app.getVersion()}`,
        `Electron ${process.versions.electron}`,
        `Chromium ${process.versions.chrome}`,
        `Node ${process.versions.node}`,
      ].join("\n"),
      buttons: ["好的"],
      noLink: true,
    };
    if (win) await dialog.showMessageBox(win, opts);
    else await dialog.showMessageBox(opts);
  });

  ipcMain.on(IPC.closeWindow, () => {
    const win = menuTarget();
    if (win) win.close();
  });

  // 全屏切换(06:F11;菜单 accelerator 走命令通道)
  ipcMain.on(IPC.fullscreenToggle, () => {
    const win = menuTarget();
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  // ── 工作区与状态(04) ──
  ipcMain.handle(IPC.pickFolderDialog, async () => {
    const win = menuTarget();
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: "打开文件夹",
      properties: ["openDirectory"],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.workspaceOpen, async (e, path: string): Promise<Result<TreeEntry[]>> => {
    const wc = e.sender;
    try {
      const tree = await startWorkspaceWatch(path, (update) => {
        if (!wc.isDestroyed()) wc.send(IPC.workspaceTreeUpdated, update);
      });
      await pushRecentFolder(path);
      await updateLastSession({ workspace: path, file: null });
      return { ok: true, value: tree };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.workspaceClose, async () => {
    await stopWorkspaceWatch();
  });

  ipcMain.on(IPC.fileOpened, (_e, path: string) => {
    const ws = currentWorkspaceRoot();
    if (!ws) return;
    const normalized = path.replace(/\\/g, "/");
    if (normalized.toLowerCase().startsWith(ws.toLowerCase())) {
      void updateLastSession({ file: path });
    }
  });

  ipcMain.handle(IPC.stateGet, async (_e, key: keyof AppStateV1) => {
    return (await getState(key)) ?? null;
  });

  ipcMain.on(IPC.stateSet, (_e, key: keyof AppStateV1, value: unknown) => {
    setState(key, value as never);
  });

  // ── 图片落盘通道(05) ──
  ipcMain.handle(IPC.imageSaveBytes, async (_e, params: { dirAbs: string; noteStem: string; mime: string; bytes: Uint8Array }): Promise<Result<{ fileName: string }>> => {
    try {
      const fileName = await saveImageBytes({
        dirAbs: params.dirAbs,
        noteStem: params.noteStem,
        bytes: new Uint8Array(params.bytes),
        ext: extForImageMime(params.mime),
      });
      return { ok: true, value: { fileName } };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.imageSaveCopy, async (_e, params: { dirAbs: string; noteStem: string; sourcePath: string }): Promise<Result<{ fileName: string }>> => {
    try {
      const fileName = await saveImageCopy({
        dirAbs: params.dirAbs,
        noteStem: params.noteStem,
        sourcePath: params.sourcePath,
      });
      return { ok: true, value: { fileName } };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.imagePickDialog, async () => {
    const win = menuTarget();
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: "插入图片",
      properties: ["openFile"],
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
        },
      ],
    });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  // ── 图片右键操作与系统能力(06) ──
  ipcMain.handle(IPC.showContextMenu, async (e, items: MenuItemTemplate[]) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return null;
    return popupContextMenu(win, items);
  });

  ipcMain.handle(IPC.showItemInFolder, async (_e, targetPath: string) => {
    shell.showItemInFolder(targetPath);
  });

  ipcMain.handle(IPC.openExternal, async (_e, url: string) => {
    await shell.openExternal(url);
  });

  // ── 导出 PDF / 打印(19):恒浅色隐藏打印窗,同渲染通道 ──
  let printWin: BrowserWindow | null = null;
  let pendingPrintPayload: { head: string | null; bodyMd: string } | null = null;
  const createPrintWindow = (): BrowserWindow => {
    const win = new BrowserWindow({
      width: 900,
      height: 1200,
      show: false,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    printWin = win;
    win.on("closed", () => {
      if (printWin === win) printWin = null;
    });
    if (isDev) {
      void win.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#print`);
    } else {
      void win.loadFile(join(__dirname, "../renderer/index.html"), { hash: "print" });
    }
    return win;
  };

  ipcMain.handle(IPC.printDataGet, async () => pendingPrintPayload);

  ipcMain.handle(
    IPC.printExport,
    async (_e, mode: "pdf" | "print", payload: { notePath: string; head: string | null; bodyMd: string }): Promise<Result<{ pdfPath?: string }>> => {
      try {
        pendingPrintPayload = { head: payload.head, bodyMd: payload.bodyMd };
        const existed = printWin && !printWin.isDestroyed();
        const win = existed ? printWin : createPrintWindow();
        if (existed) {
          // 复用窗口:重载以触发 PrintHost 重新拉取
          win!.webContents.reload();
        }
        await new Promise<void>((resolve) => {
          win!.webContents.once("did-finish-load", () => resolve());
        });
        const w = win!;
        // 渲染就绪(PrintHost 拉取负载并完成装载后回执)
        const ready = new Promise<void>((resolveReady, rejectReady) => {
          const timer = setTimeout(() => rejectReady(new Error("打印窗渲染超时")), 20000);
          ipcMain.once(IPC.printReady, (_ev, ok: boolean) => {
            clearTimeout(timer);
            if (ok) resolveReady();
            else rejectReady(new Error("打印窗渲染失败"));
          });
        });
        await ready;
        if (mode === "pdf") {
          const data = await w.webContents.printToPDF({ pageSize: "A4", printBackground: true });
          const pdfPath = payload.notePath.replace(/\.md$/i, ".pdf");
          const { writeFile: pwf } = await import("node:fs/promises");
          await pwf(pdfPath, data);
          return { ok: true, value: { pdfPath } };
        }
        const result = await new Promise<{ success: boolean }>((resolve) => {
          w.webContents.print({ silent: false }, (success) => resolve({ success }));
        });
        if (!result.success) {
          return { ok: false, error: { code: "PRINT_CANCELED", message: "打印已取消或失败" } };
        }
        return { ok: true, value: {} };
      } catch (err) {
        return { ok: false, error: toError(err) };
      } finally {
        pendingPrintPayload = null;
      }
    },
  );

  ipcMain.handle(IPC.imageCopyToClipboard, async (_e, path: string): Promise<Result<void>> => {
    try {
      const image = nativeImage.createFromPath(path);
      if (image.isEmpty()) throw Object.assign(new Error("无法读取图片数据"), { code: "IMG_EMPTY" });
      // Electron 44 异步剪贴板:统一以 image/png 写入(系统位图通道)
      const pngBytes = Uint8Array.from(image.toPNG());
      const blob = new Blob([pngBytes], { type: "image/png" });
      await clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.trashItem, async (_e, path: string): Promise<Result<void>> => {
    try {
      await shell.trashItem(path);
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.confirmDialog, async (e, message: string, detail: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts: Electron.MessageBoxOptions = {
      type: "question",
      title: "确认",
      message,
      detail,
      buttons: ["取消", "删除"],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    };
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    return res.response === 1;
  });

  ipcMain.handle(IPC.infoDialog, async (e, message: string, detail: string): Promise<void> => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts: Electron.MessageBoxOptions = {
      type: "info",
      title: "知己笔记",
      message,
      detail,
      buttons: ["好的"],
      noLink: true,
    };
    if (win) await dialog.showMessageBox(win, opts);
    else await dialog.showMessageBox(opts);
  });

  ipcMain.handle(IPC.pathExists, async (_e, path: string): Promise<boolean> => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  });

  // ── 全工作区搜索(15) ──
  ipcMain.handle(IPC.workspaceSearch, async (_e, root: string, query: string): Promise<Result<WorkspaceSearchFileHit[]>> => {
    try {
      const q = query.trim();
      if (!q) return { ok: true, value: [] };
      const tree = await scanWorkspaceTree(root);
      const rels = collectMarkdownPaths(tree);
      const hits: WorkspaceSearchFileHit[] = [];
      for (const rel of rels) {
        const abs = join(root, rel);
        try {
          const text = await readTextFile(abs);
          const lines = findLineHits(text, q, 6);
          if (lines.length > 0) {
            hits.push({ path: abs, relPath: rel, name: basename(abs), lines });
          }
        } catch {
          // 读失败(并发删除等)跳过该文件
        }
        if (hits.length >= 200) break;
      }
      return { ok: true, value: hits };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  // ── 文件操作(10/11) ──
  ipcMain.handle(IPC.fsNewNote, async (_e, dirAbs: string): Promise<Result<{ path: string }>> => {
    try {
      const path = await createNoteFile(dirAbs);
      await rescanNow();
      return { ok: true, value: { path } };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.fsNewFolder, async (_e, dirAbs: string, name: string): Promise<Result<void>> => {
    try {
      await makeFolder(dirAbs, name);
      await rescanNow();
      return { ok: true, value: undefined };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.fsRenamePath, async (_e, path: string, newName: string): Promise<Result<{ path: string }>> => {
    try {
      const next = await renameEntry(path, newName);
      await rescanNow();
      return { ok: true, value: { path: next } };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });

  ipcMain.handle(IPC.fsMovePath, async (_e, path: string, targetDir: string, newName?: string): Promise<Result<{ path: string }>> => {
    try {
      const next = newName
        ? await moveInto(path, targetDir, newName)
        : await moveInto(path, targetDir, basename(path));
      await rescanNow();
      return { ok: true, value: { path: next } };
    } catch (err) {
      return { ok: false, error: toError(err) };
    }
  });
}

// 退出前把防抖中的状态落盘
app.on("before-quit", () => {
  void flushState();
});

// 图片资产协议须在 ready 前注册;自检 userData 隔离在 createWindow 前即可
registerImageScheme();

app.whenReady().then(async () => {
  installImageProtocolHandler();
  registerIpc();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

// Windows:全部窗口关闭即退出(无托盘常驻,规格 §6 单窗口形态)
app.on("window-all-closed", () => {
  app.quit();
});
