// 主进程:窗口生命周期与 IPC 承载(01 票最小竖切;菜单/工作区/监听随票补齐)。

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { IPC, type ErrorInfo, type Result } from "@shared/ipc";
import { readTextFile, writeTextFileAtomic } from "../../packages/files";

const isDev = !!process.env["ELECTRON_RENDERER_URL"];
const smoke = process.env["CONFIDANT_SMOKE"] === "1";
const e2eFile = process.env["CONFIDANT_E2E_FILE"];

function toError(err: unknown): ErrorInfo {
  const e = err as { code?: string; message?: string };
  return { code: e?.code ?? "UNKNOWN", message: e?.message ?? String(err) };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 冒烟/竖切自检:首屏探针(截图存档)或「打开→键入→保存→磁盘校验」端到端。 */
async function runSelfCheck(win: BrowserWindow, notePath: string | null): Promise<void> {
  const issues: string[] = [];
  win.webContents.on("console-message", (event) => {
    const level = event.level;
    if (typeof level === "number" ? level >= 2 : level === "error" || level === "warning") {
      issues.push(`console[${String(level)}]: ${event.message}`);
    }
  });
  const fail = async (reason: string): Promise<void> => {
    console.error(`[smoke] FAILED: ${reason}`);
    if (issues.length) console.error("[smoke] renderer issues:", issues);
    process.exitCode = 1;
  };

  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>;

  await delay(1200);
  try {
    if (notePath) {
      // ── 端到端竖切:打开夹具 → 编辑区键入 → 点击保存 → 磁盘校验 ──
      const head = (await import("node:fs/promises")).readFile(notePath, "utf8");
      const fixture = await head;
      const fmPrefix = fixture.slice(0, fixture.indexOf("\n#"));
      win.webContents.send(IPC.openFileRequest, notePath);
      await delay(700);
      const marker = `E2E冒烟-${Date.now()}`;
      const typed = await js<{ ok: boolean; detail: string }>(
        `(async () => {
          const el = document.querySelector('[contenteditable="true"]');
          if (!el) {
            return {
              ok: false,
              detail: "no-editor; " + JSON.stringify({
                bridge: typeof window.confidant,
                body: document.body.innerText.slice(0, 160),
              }),
            };
          }
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          if (!sel) return { ok: false, detail: "no-selection" };
          sel.removeAllRanges();
          sel.addRange(range);
          const before = el.textContent ?? "";
          const done = document.execCommand("insertText", false, "\\n\\n插入-${marker}");
          return { ok: done, detail: before.slice(0, 40) };
        })()`,
      );
      if (!typed.ok) return fail(`typing failed: ${JSON.stringify(typed)}`);

      // 等「保存」按钮启用(dirty 状态已置)后点击,再轮询保存结果文案(≤5s)
      let outcome = "";
      let clicked = false;
      for (let i = 0; i < 30; i++) {
        await delay(200);
        const state = await js<{ disabled: boolean; text: string }>(
          `(() => {
            const btns = [...document.querySelectorAll("button")];
            const saveBtn = btns.find((b) => b.textContent?.trim() === "保存");
            return { disabled: saveBtn ? saveBtn.disabled : true, text: document.body.innerText };
          })()`,
        );
        if (!clicked && !state.disabled) {
          clicked = true;
          await js<void>(
            `(() => {
              const btns = [...document.querySelectorAll("button")];
              const saveBtn = btns.find((b) => b.textContent?.trim() === "保存");
              if (saveBtn) saveBtn.click();
            })()`,
          );
          continue;
        }
        if (state.text.includes("已保存")) {
          outcome = "saved";
          break;
        }
        if (state.text.includes("保存失败") || state.text.includes("无法写入")) {
          outcome = "failed";
          break;
        }
      }
      if (outcome !== "saved") return fail(`save state not reached (${outcome}, clicked=${clicked})`);

      const saved = await (await import("node:fs/promises")).readFile(notePath, "utf8");
      const checks = [
        saved.startsWith(fmPrefix) || "front matter head changed",
        saved.includes(marker) || "typed marker missing on disk",
        saved.endsWith("\n") || "missing trailing newline",
        !saved.endsWith("\n\n") || "multiple trailing newlines",
      ];
      const firstBad = checks.find((c) => typeof c === "string");
      if (firstBad) return fail(`disk check: ${firstBad}`);
      console.log(`[smoke] e2e ok — typed & saved marker: ${marker}`);
    } else {
      // ── 首屏冒烟 ──
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
    console.log("[smoke] ok");
  } catch (err) {
    await fail(`self-check threw: ${String(err)}`);
  } finally {
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(__dirname, "../../out/smoke"), { recursive: true });
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(__dirname, "../../out/smoke/smoke.png"), (await win.webContents.capturePage()).toPNG());
    } catch {
      // 截图失败不影响判定
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
