// 主进程:窗口生命周期、IPC 承载与自检驱动。
// 单窗口形态(无托盘/无状态栏);Windows 平台规则:窗口全关即退出。

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { IPC, type ErrorInfo, type Result } from "@shared/ipc";
import { readTextFile, writeTextFileAtomic } from "../../packages/files";

const isDev = !!process.env["ELECTRON_RENDERER_URL"];
const smoke = process.env["CONFIDANT_SMOKE"] === "1";
const e2eFile = process.env["CONFIDANT_E2E_FILE"];
const e2eFlushOnClose = process.env["CONFIDANT_E2E_FLUSHONCLOSE"] === "1";

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
        const saved = await readFile(notePath, "utf8");
        const checks = [
          saved.startsWith(fmPrefix) || "front matter head changed",
          saved.includes(mark1) || "autosave marker missing on disk",
          saved.endsWith("\n") || "missing trailing newline",
          !saved.endsWith("\n\n") || "multiple trailing newlines",
        ];
        const firstBad = checks.find((c) => typeof c === "string");
        if (firstBad) return fail(`disk check: ${firstBad}`);
        console.log(`[smoke] e2e ok — autosave marker: ${mark1}`);
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

  if (smoke || e2eFile) {
    win.webContents.once("did-finish-load", () => {
      void runSelfCheck(win, e2eFile ?? null);
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
}

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
