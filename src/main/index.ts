// 主进程:窗口生命周期、IPC 承载与自检驱动。
// 单窗口形态(无托盘/无状态栏);Windows 平台规则:窗口全关即退出。

import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { IPC, type ErrorInfo, type MenuItemState, type MenuItemTemplate, type Result } from "@shared/ipc";
import { readTextFile, writeTextFileAtomic, type TreeEntry } from "../../packages/files";
import { applyMenuTemplate, getMenuItem, updateMenuItems } from "./menu";
import {
  currentWorkspaceRoot,
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

// 自检/冒烟一律使用隔离的 userData,不污染真实应用状态
if (smoke || e2eFile || e2eWs) {
  const base = process.env["TEMP"] ?? process.env["TMP"] ?? "C:/Windows/Temp";
  app.setPath("userData", join(base, "confidant-e2e-state", `run-${process.pid}`));
}

function toError(err: unknown): ErrorInfo {
  const e = err as { code?: string; message?: string };
  return { code: e?.code ?? "UNKNOWN", message: e?.message ?? String(err) };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

/** 在渲染层编辑区末尾键入一段文本(自检驱动用)。 */
async function typeAtEnd(win: BrowserWindow, text: string): Promise<{ ok: boolean; detail: string }> {
  const marker = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return win.webContents.executeJavaScript(
    `(async () => {
      const el = document.querySelector('[contenteditable="true"]');
      if (!el) return { ok: false, detail: "no-editor" };
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (!sel) return { ok: false, detail: "no-selection" };
      sel.removeAllRanges();
      sel.addRange(range);
      const before = el.textContent ?? "";
      const done = document.execCommand("insertText", false, "\\n\\n${marker}");
      return { ok: done, detail: before.slice(0, 40) };
    })()`,
  ) as Promise<{ ok: boolean; detail: string }>;
}

/** 等待状态文案出现「已保存」(自动保存落盘)或失败文案,≤6s。 */
async function waitSaved(win: BrowserWindow): Promise<"saved" | "failed" | "timeout"> {
  for (let i = 0; i < 30; i++) {
    await delay(200);
    const text = (await win.webContents.executeJavaScript("document.body.innerText")) as string;
    if (text.includes("已保存")) return "saved";
    if (text.includes("保存失败") || text.includes("无法写入")) return "failed";
  }
  return "timeout";
}

/**
 * 自检(dev 辅助):
 * - 首屏冒烟:探针 + 截图后退出;
 * - 端到端竖切:打开夹具 → 编辑区键入 → 自动保存落盘 → 磁盘校验;
 *   开启 CONFIDANT_E2E_FLUSHONCLOSE 时再键入一段并直接关窗,验证关闭前 flush 不丢。
 */
async function runSelfCheck(win: BrowserWindow, notePath: string | null): Promise<void> {
  const issues: string[] = [];
  win.webContents.on("console-message", (event) => {
    const level = event.level;
    if (typeof level === "number" ? level >= 2 : level === "error" || level === "warning") {
      issues.push(`console[${String(level)}]: ${event.message}`);
    }
  });
  let failed = false;
  const fail = async (reason: string): Promise<void> => {
    failed = true;
    console.error(`[smoke] FAILED: ${reason}`);
    if (issues.length) console.error("[smoke] renderer issues:", issues);
    try {
      const errs = (await win.webContents.executeJavaScript(
        "Array.isArray(window.__errs) ? window.__errs : []",
      )) as string[];
      if (errs.length) console.error("[smoke] page errors:", errs);
    } catch {
      // 页面不可用时不查
    }
  };

  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>;

  await delay(1200);
  try {
    if (notePath) {
      const fixture = await readFile(notePath, "utf8");
      const fmPrefix = fixture.slice(0, fixture.indexOf("\n#"));
      const mark1 = `自动保存-${Date.now()}`;
      const mark2 = `关窗落盘-${Date.now()}`;
      win.webContents.send(IPC.openFileRequest, notePath);
      await delay(800);
      const typed = await typeAtEnd(win, mark1);
      if (!typed.ok) return fail(`typing failed: ${JSON.stringify(typed)}`);

      // 不点保存:证明停顿后自动写盘
      const outcome = await waitSaved(win);
      if (outcome !== "saved") return fail(`autosave not reached (${outcome})`);

      if (e2eFlushOnClose) {
        // 关闭前 flush 竖切:再键入一段,不做任何保存,直接关窗
        const typed2 = await typeAtEnd(win, mark2);
        if (!typed2.ok) return fail(`second typing failed: ${JSON.stringify(typed2)}`);
        await delay(500);
        const closed = new Promise<void>((r) => win.once("closed", () => r()));
        win.close();
        await closed;
        const saved2 = await readFile(notePath, "utf8");
        const checks = [
          saved2.includes(mark2) || "close-flush marker missing on disk",
          saved2.startsWith(fmPrefix) || "front matter head changed after close-flush",
          saved2.endsWith("\n") || "missing trailing newline after close-flush",
        ];
        const firstBad = checks.find((c) => typeof c === "string");
        if (firstBad) return fail(`close-flush disk check: ${firstBad}`);
        console.log(`[smoke] e2e ok — autosave ${mark1}; close-flush ${mark2}`);
      } else {
        // 菜单框架验证:菜单结构 + 启用态 + 经菜单命令通道手动保存
        const topMenus = Menu.getApplicationMenu()?.items.map((i) => i.label) ?? [];
        const expectTop = ["文件", "编辑", "段落", "格式", "视图", "帮助"];
        if (topMenus.join("|") !== expectTop.join("|")) {
          return fail(`menu structure mismatch: ${JSON.stringify(topMenus)}`);
        }
        const saveItem = getMenuItem("save");
        const recentItem = getMenuItem("open-recent");
        const aboutItem = getMenuItem("about");
        if (!saveItem?.enabled) return fail("save menu item not enabled with doc open");
        if (recentItem?.enabled) return fail("open-recent should stay disabled");
        if (!aboutItem?.enabled) return fail("about should be enabled");
        if (!saveItem.label.includes("保存")) return fail(`save label wrong: ${saveItem.label}`);

        const typed2 = await typeAtEnd(win, mark2);
        if (!typed2.ok) return fail(`second typing failed: ${JSON.stringify(typed2)}`);
        // 模拟 native 菜单点击:同一 command 通道(菜单 accelerator 为 OS 级,不可脚本触发)
        win.webContents.send(IPC.menuCommand, "save");
        const outcome2 = await waitSaved(win);
        if (outcome2 !== "saved") return fail(`menu-command save not reached (${outcome2})`);

        const saved = await readFile(notePath, "utf8");
        const checks = [
          saved.startsWith(fmPrefix) || "front matter head changed",
          saved.includes(mark1) || "autosave marker missing on disk",
          saved.includes(mark2) || "menu-command saved marker missing on disk",
          saved.endsWith("\n") || "missing trailing newline",
          !saved.endsWith("\n\n") || "multiple trailing newlines",
        ];
        const firstBad = checks.find((c) => typeof c === "string");
        if (firstBad) return fail(`disk check: ${firstBad}`);
        console.log(`[smoke] e2e ok — autosave ${mark1}; menu-command save ${mark2}`);
      }
    } else {
      const probe = await js<{ rootChildren: number; bodyText: string; title: string }>(
        `({
          rootChildren: document.getElementById('root')?.children.length ?? -1,
          bodyText: document.body.innerText.slice(0, 200),
          title: document.title,
        })`,
      );
      console.log("[smoke] probe:", JSON.stringify(probe));
      if (probe.rootChildren <= 0 || !probe.bodyText.includes("知己笔记")) {
        return fail("welcome view not rendered");
      }
    }
    if (issues.length) return fail("renderer console issues present");
    if (!failed) console.log("[smoke] ok");
  } catch (err) {
    await fail(`self-check threw: ${String(err)}`);
  } finally {
    if (failed) process.exitCode = 1;
    // 窗口可能已被关闭流程销毁(close-flush 分支);截图失败不影响判定
    try {
      if (!win.isDestroyed()) {
        mkdirSync(join(__dirname, "../../out/smoke"), { recursive: true });
        const { writeFileSync } = await import("node:fs");
        writeFileSync(
          join(__dirname, "../../out/smoke/smoke.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
    } catch {
      // ignore
    }
    app.quit();
  }
}

/** 工作区形态自检:打开空文件夹(空态引导)→ 打开真实工作区(树/点击/自动保存)→
 *  外部新增即时上树 → 侧栏折叠/还原。 */
async function runWorkspaceSelfCheck(win: BrowserWindow, wsDir: string, emptyDir: string | null): Promise<void> {
  const issues: string[] = [];
  win.webContents.on("console-message", (event) => {
    const level = event.level;
    if (typeof level === "number" ? level >= 2 : level === "error" || level === "warning") {
      issues.push(`console[${String(level)}]: ${event.message}`);
    }
  });
  let failed = false;
  const fail = async (reason: string): Promise<void> => {
    failed = true;
    console.error(`[smoke] FAILED: ${reason}`);
    if (issues.length) console.error("[smoke] renderer issues:", issues);
    try {
      const errs = (await win.webContents.executeJavaScript(
        "Array.isArray(window.__errs) ? window.__errs : []",
      )) as string[];
      if (errs.length) console.error("[smoke] page errors:", errs);
    } catch {
      // 页面不可用时不查
    }
  };
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>;

  const poll = async <T>(probe: () => Promise<T | null>, timeoutMs = 6000): Promise<T | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const v = await probe();
      if (v !== null && v !== false) return v;
      await delay(150);
    }
    return null;
  };

  const q = (selector: string): string =>
    `document.querySelector(${JSON.stringify(selector)}) !== null`;
  const bodyHas = (text: string): Promise<boolean> =>
    js<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`);

  await delay(1200);
  try {
    // 页面级错误收集(React 渲染异常不一定走 console-message)
    await js<void>(`
      window.__errs = [];
      window.addEventListener("error", (e) => window.__errs.push("error: " + (e.error?.stack ?? e.message)));
      window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason?.stack ?? e.reason)));
    `);

    // 1) 空文件夹 → 空态引导文案
    if (emptyDir) {
      win.webContents.send(IPC.openWorkspaceRequest, emptyDir);
      const guided = await poll(() => js<boolean>(q("[data-testid='empty-workspace-guidance']")));
      if (!guided) {
        const diag = await js<string>(
          `JSON.stringify({
            guidance: document.querySelector("[data-testid='empty-workspace-guidance']") !== null,
            error: document.querySelector("[data-testid='load-error']")?.textContent ?? null,
            body: document.body.innerText.slice(0, 300),
          })`,
        );
        return fail(`empty-workspace guidance not shown; diag=${diag}`);
      }
      if (!(await bodyHas("这个文件夹还没有笔记"))) return fail("guidance copy missing");
    }

    // 2) 打开真实工作区:目录行出现;点文件夹展开出 b.md;点 a.md 进入编辑
    win.webContents.send(IPC.openWorkspaceRequest, wsDir);
    const dirRow = await poll(() => js<boolean>(q("[data-rel='笔记文件夹']")));
    if (!dirRow) return fail("workspace tree folder row missing");
    await js<void>(`document.querySelector("[data-rel='笔记文件夹']").click()`);
    const subRow = await poll(() => js<boolean>(q("[data-rel='笔记文件夹/b.md']")));
    if (!subRow) return fail("folder expand did not reveal b.md");

    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const editorLive = await poll(async () => {
      // 所见即所得渲染:标题不带 # 标记,正文文字可辨
      const t = await js<string>("document.body.innerText");
      return t.includes("正文 a。") ? true : null;
    });
    if (!editorLive) return fail("a.md did not open in editor");

    const mark1 = `工作区保存-${Date.now()}`;
    const typed = await typeAtEnd(win, mark1);
    if (!typed.ok) return fail(`typing failed: ${JSON.stringify(typed)}`);
    const saved = await waitSaved(win);
    if (saved !== "saved") return fail(`autosave not reached (${saved})`);
    const aPath = join(wsDir, "a.md");
    const diskA = await readFile(aPath, "utf8");
    if (!diskA.includes(mark1)) return fail("workspace note marker missing on disk");
    if (!diskA.startsWith("---\ntitle: a")) return fail("a.md front matter changed");

    // 3) 外部新增 .md → 树即时出现;点击打开编辑保存
    const externalName = `外部新增-${Date.now()}.md`;
    const externalAbs = join(wsDir, externalName);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(externalAbs, "# 外部新增\n", "utf8");
    const externalRow = await poll(() =>
      js<boolean>(q(`[data-rel='${externalName}']`)),
    );
    if (!externalRow) return fail("external new file not reflected in tree");
    await js<void>(`document.querySelector(${JSON.stringify(`[data-rel='${externalName}']`)}).click()`);
    // 等待头部文件名切换为外部文件(避免树内旧行文本误判)
    const extOpen = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === externalName ? true : null;
    });
    if (!extOpen) return fail("external file did not open");
    const mark2 = `外部新增标记-${Date.now()}`;
    const typed2 = await typeAtEnd(win, mark2);
    if (!typed2.ok) return fail(`typing2 failed: ${JSON.stringify(typed2)}`);
    const saved2 = await waitSaved(win);
    if (saved2 !== "saved") {
      const diag = await js<string>(
        `JSON.stringify({
          text: document.body.innerText.slice(0, 300),
          html: document.getElementById('root')?.innerHTML.slice(0, 900) ?? 'no-root',
        })`,
      );
      return fail(`autosave2 not reached (${saved2}); diag=${diag}`);
    }
    const diskExt = await readFile(externalAbs, "utf8");
    if (!diskExt.includes(mark2)) return fail("external note marker missing on disk");

    // 4) 侧栏折叠/还原(可见按钮,不依赖快捷键)
    const before = await js<boolean>(q("[data-testid='sidebar']"));
    if (!before) return fail("sidebar missing");
    await js<void>(`document.querySelector("[data-testid='sidebar-toggle']").click()`);
    const collapsed = await poll(() => js<boolean>(`document.querySelector("[data-testid='sidebar']") === null`));
    if (!collapsed) return fail("sidebar did not collapse");
    await js<void>(`document.querySelector("[data-testid='sidebar-toggle']").click()`);
    const restored = await poll(() => js<boolean>(q("[data-testid='sidebar']")));
    if (!restored) return fail("sidebar did not restore");

    if (issues.length) return fail("renderer console issues present");
    console.log("[smoke] workspace e2e ok");
  } catch (err) {
    await fail(`workspace self-check threw: ${String(err)}`);
  } finally {
    if (failed) process.exitCode = 1;
    try {
      if (!win.isDestroyed()) {
        mkdirSync(join(__dirname, "../../out/smoke"), { recursive: true });
        const { writeFileSync } = await import("node:fs");
        writeFileSync(
          join(__dirname, "../../out/smoke/smoke.png"),
          (await win.webContents.capturePage()).toPNG(),
        );
      }
    } catch {
      // ignore
    }
    app.quit();
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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

  win.once("ready-to-show", () => win.show());
  armCloseFlush(win);

  if (process.env["CONFIDANT_DEVTOOLS"] === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  if (smoke || e2eFile || e2eWs) {
    win.webContents.once("did-finish-load", () => {
      const emptyWs = process.env["CONFIDANT_E2E_WS_EMPTY"] ?? null;
      if (e2eWs) void runWorkspaceSelfCheck(win, e2eWs, emptyWs);
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
      const tree = await startWorkspaceWatch(path, (next) => {
        if (!wc.isDestroyed()) wc.send(IPC.workspaceTreeUpdated, next);
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
}

// 退出前把防抖中的状态落盘
app.on("before-quit", () => {
  void flushState();
});

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows:全部窗口关闭即退出(无托盘常驻,规格 §6 单窗口形态)
app.on("window-all-closed", () => {
  app.quit();
});
