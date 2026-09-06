// 自检/冒烟与端到端驱动(dev 辅助;与主进程逻辑隔离,打包后仍可经 CONFIDANT_* 环境门启用)
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { IPC } from "@shared/ipc";
import { getMenuItem } from "./menu";
import { writeTextFileAtomic } from "../../packages/files";

const e2eFlushOnClose = process.env["CONFIDANT_E2E_FLUSHONCLOSE"] === "1";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}


/** 在渲染层编辑区末尾键入一段文本(自检驱动用)。 */
export async function typeAtEnd(win: BrowserWindow, text: string): Promise<{ ok: boolean; detail: string }> {
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
export async function waitSaved(win: BrowserWindow): Promise<"saved" | "failed" | "timeout"> {
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
export async function runSelfCheck(win: BrowserWindow, notePath: string | null): Promise<void> {
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
export async function runWorkspaceSelfCheck(win: BrowserWindow, wsDir: string, emptyDir: string | null): Promise<void> {
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

    // 2.5) 撤销跨自动保存(09/08 复核):保存后撤销/重做历史不被自身写盘回声清空
    win.webContents.send(IPC.menuCommand, "undo");
    const undone = await poll(async () => {
      const text = await js<string>("document.body.innerText");
      return text.includes(mark1) ? null : true;
    });
    if (!undone) return fail("undo after autosave did not revert typing (history wiped?)");
    win.webContents.send(IPC.menuCommand, "redo");
    const redone = await poll(async () => {
      const text = await js<string>("document.body.innerText");
      return text.includes(mark1) ? true : null;
    });
    if (!redone) return fail("redo after undo failed");
    await waitSaved(win);

    // 2.5) 粘贴位图(截图通道)→ 落盘同目录 → 相对引用写入并自动保存
    const pasteOk = await js<boolean>(
      `(() => {
        const el = document.querySelector('[contenteditable="true"]');
        if (!el) return false;
        const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const file = new File([bytes], "clip.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return true;
      })()`,
    );
    if (!pasteOk) return fail("paste dispatch failed");
    // 轮询磁盘真相:图片落盘 + 引用写入(避免旧「已保存」状态误判)
    const pasteLanded = await poll(async () => {
      try {
        const content = await readFile(aPath, "utf8");
        const m = /!\[\]\(([^)\s]+)\)/.exec(content);
        if (!m) return null;
        const wsFiles2 = await (await import("node:fs/promises")).readdir(wsDir);
        return wsFiles2.includes(m[1]!) ? { name: m[1]! } : null;
      } catch {
        return null;
      }
    });
    if (!pasteLanded) return fail("pasted image reference/file not landed on disk");
    const diskA2 = await readFile(aPath, "utf8");
    if (!diskA2.includes(`![](${pasteLanded.name})`)) return fail("image reference missing in note");

    // 2.6) 渲染验证:编辑区出现 <img> 且资产协议真实加载(naturalWidth > 0)
    const imgRendered = await poll(async () => {
      const state = await js<{ src: string; w: number } | null>(
        `(() => {
          const img = document.querySelector(".confidant-image-node img");
          if (!img) return null;
          return { src: img.getAttribute("src") ?? "", w: img.naturalWidth };
        })()`,
      );
      return state && state.src.startsWith("confidant-img://") && state.w > 0 ? state : null;
    });
    if (!imgRendered) return fail("image not rendered via asset protocol");

    // 2.7) 浮动格式工具条:DOM 选中文字 → 浮现 → 点加粗 → 自动保存落盘含 **
    const selMade = await js<{ ok: boolean; detail: string }>(
      `(() => {
        const el = document.querySelector('[contenteditable="true"]');
        if (!el) return { ok: false, detail: "no-editor" };
        el.focus();
        const p = [...el.querySelectorAll("p")].find((n) => n.textContent?.includes("正文 a"));
        if (!p) return { ok: false, detail: "no-para" };
        const tn = [...p.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes("正文 a"));
        if (!tn) return { ok: false, detail: "no-text-node" };
        const text = tn.textContent ?? "";
        const start = text.indexOf("正文 a");
        const range = document.createRange();
        range.setStart(tn, start);
        range.setEnd(tn, start + "正文 a。".length);
        const sel = window.getSelection();
        if (!sel) return { ok: false, detail: "no-selection" };
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event("selectionchange")); // 助推 PM 选区同步
        return { ok: true, detail: "selected" };
      })()`,
    );
    if (!selMade.ok) return fail(`selection failed: ${JSON.stringify(selMade)}`);
    const toolbarShown = await poll(() => js<boolean>(q("[data-testid='format-toolbar']")), 10000);
    if (!toolbarShown) {
      const diag = await js<string>(
        `JSON.stringify({
          sel: window.getSelection()?.toString().slice(0, 30) ?? "",
          active: document.activeElement?.tagName ?? "",
          focusedEl: !!document.querySelector("[contenteditable='true']:focus"),
        })`,
      );
      return fail(`format toolbar not shown on selection; diag=${diag}`);
    }
    await js<void>(`document.querySelector("[data-testid='format-toolbar'] button[title='加粗']").click()`);
    const boldSaved = await poll(async () => {
      const content = await readFile(aPath, "utf8");
      return content.includes("**正文 a。**") ? true : null;
    });
    if (!boldSaved) return fail("bold not persisted via toolbar (autosave)");

    // 2.8) 段落菜单命令(08):菜单通道 → 标题2 → 正文还原 → 插入表格 → 撤销
    win.webContents.send(IPC.menuCommand, "heading-2");
    const h2 = await poll(async () => {
      const content = await readFile(aPath, "utf8");
      return content.includes("## **正文 a。**") ? true : null;
    });
    if (!h2) return fail("heading-2 via menu not persisted");
    win.webContents.send(IPC.menuCommand, "paragraph");
    const paraBack = await poll(async () => {
      const content = await readFile(aPath, "utf8");
      return content.includes("**正文 a。**") && !content.includes("## **正文 a。**")
        ? true
        : null;
    });
    if (!paraBack) return fail("paragraph restore via menu not persisted");
    win.webContents.send(IPC.menuCommand, "insert-table");
    const tableIn = await poll(async () => {
      const dom = await js<boolean>(q("table"));
      if (!dom) return null;
      const content = await readFile(aPath, "utf8");
      return content.includes("| --- | --- |") ? true : null;
    });
    if (!tableIn) return fail("insert table via menu failed");
    win.webContents.send(IPC.menuCommand, "undo");
    const tableUndone = await poll(async () => {
      const dom = await js<boolean>(`document.querySelector("table") === null`);
      if (!dom) return null;
      const content = await readFile(aPath, "utf8");
      return !content.includes("| --- | --- |") ? true : null;
    });
    if (!tableUndone) return fail("undo of table insert not applied/persisted");

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

    // 5) 文件操作(10):先回 a.md(确定性上下文),菜单「新建笔记」→ 落盘并打开
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const baseOpen = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "a.md" ? true : null;
    });
    if (!baseOpen) return fail("base note reopen before new-note failed");
    win.webContents.send(IPC.menuCommand, "new-note");
    const nnRow = await poll(async () => {
      const has = await js<boolean>(q("[data-rel='未命名笔记.md']"));
      if (!has) return null;
      const content = await readFile(join(wsDir, "未命名笔记.md"), "utf8");
      return content.length >= 0 ? true : null;
    });
    if (!nnRow) return fail("new-note via menu failed");
    const nnOpen = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "未命名笔记.md" ? true : null;
    }, 12000);
    if (!nnOpen) {
      const diag = await js<string>(
        `JSON.stringify({
          header: document.querySelector("header strong")?.textContent ?? "",
          body: document.body.innerText.slice(0, 150),
          title: document.title,
        })`,
      );
      return fail(`new note not opened in editor; diag=${diag}`);
    }

    win.webContents.send(IPC.menuCommand, "new-folder");
    const promptShown = await poll(() => js<boolean>(q("[data-testid='text-prompt']")));
    if (!promptShown) return fail("new-folder prompt not shown");
    await js<void>(`(() => {
      const input = document.querySelector("[data-testid='text-prompt'] input");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "归档夹");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await js<void>(`document.querySelector("[data-testid='prompt-ok']").click()`);
    const folderRow = await poll(async () => {
      const has = await js<boolean>(q("[data-rel='归档夹']"));
      return has ? true : null;
    });
    if (!folderRow) return fail("new folder did not appear in tree");

    // 5.5) 树内拖拽移动(11):b.md → 归档夹;通知条撤销还原
    await js<void>(`document.querySelector("[data-rel='归档夹']").click()`); // 展开目标
    const dragOk = await js<{ ok: boolean; detail: string }>(
      `(async () => {
        const src = document.querySelector("[data-rel='笔记文件夹/b.md']");
        const dst = document.querySelector("[data-rel='归档夹']");
        if (!src || !dst) return { ok: false, detail: "missing rows" };
        const dt = new DataTransfer();
        const start = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt });
        src.dispatchEvent(start);
        const over = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
        dst.dispatchEvent(over);
        const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
        dst.dispatchEvent(drop);
        return { ok: true, detail: "dispatched" };
      })()`,
    );
    if (!dragOk.ok) return fail(`drag dispatch failed: ${JSON.stringify(dragOk)}`);
    const movedRow = await poll(async () => {
      const has = await js<boolean>(q("[data-rel='归档夹/b.md']"));
      return has ? true : null;
    });
    if (!movedRow) return fail("b.md not shown under 归档夹 after drag");
    const noticeShown = await poll(() =>
      js<boolean>(`document.body.innerText.includes("已移动 — 撤销")`),
    );
    if (!noticeShown) return fail("move notice not shown");
    await js<void>(`[...document.querySelectorAll("[data-testid='change-notice'] button")]
      .find((b) => b.textContent?.includes("撤销"))?.click()`);
    const movedBack = await poll(async () => {
      const has = await js<boolean>(q("[data-rel='笔记文件夹/b.md']"));
      return has ? true : null;
    });
    if (!movedBack) return fail("undo of move did not restore b.md");

    // 5.6) 外观(18):深色/浅色即时生效(computed 校验)
    win.webContents.send(IPC.menuCommand, "theme-dark");
    const darkApplied = await poll(async () => {
      const theme = await js<string>(`document.documentElement.dataset.theme ?? ""`);
      if (theme !== "dark") return null;
      const bg = await js<string>(`getComputedStyle(document.body).backgroundColor`);
      return bg.includes("31, 31, 31") ? true : null;
    });
    if (!darkApplied) return fail("dark theme not applied");
    win.webContents.send(IPC.menuCommand, "theme-light");
    const lightApplied = await poll(async () => {
      const theme = await js<string>(`document.documentElement.dataset.theme ?? ""`);
      if (theme !== "light") return null;
      const bg = await js<string>(`getComputedStyle(document.body).backgroundColor`);
      return bg.includes("255, 255, 255") ? true : null;
    });
    if (!lightApplied) return fail("light theme not applied");
    win.webContents.send(IPC.menuCommand, "theme-system");
    const systemApplied = await poll(async () => {
      const theme = await js<string>(`document.documentElement.dataset.theme ?? ""`);
      return theme === "light" || theme === "dark" ? true : null;
    });
    if (!systemApplied) return fail("system theme mode not applied");

    // 5.7) 导出 PDF(19):菜单命令 → 同目录同名 .pdf(覆盖);提示条出现
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const expBase = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "a.md" ? true : null;
    });
    if (!expBase) return fail("export base note reopen failed");
    win.webContents.send(IPC.menuCommand, "export-pdf");
    const pdfPath = join(wsDir, "a.pdf");
    const pdfDone = await poll(async () => {
      try {
        const bytes = await readFile(pdfPath);
        const head = bytes.subarray(0, 5).toString("latin1");
        return head === "%PDF-" ? true : null;
      } catch {
        return null;
      }
    }, 20000);
    if (!pdfDone) return fail("pdf export did not produce a.pdf");
    const pdfNotice = await poll(() =>
      js<boolean>(`document.body.innerText.includes("已导出 PDF")`),
    );
    if (!pdfNotice) return fail("export success notice missing");

    // 6) 外部删除当前文件(12):横幅出现;不自动重建;「放弃」清空编辑态
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const aOpen = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "a.md" ? true : null;
    });
    if (!aOpen) return fail("a.md reopen failed");
    // 6.1) 查找(14):Ctrl+F(菜单通道)→ 输入 → 命中行 → 点击定位高亮 → Esc 关闭清高亮
    win.webContents.send(IPC.menuCommand, "find");
    const panelShown = await poll(() => js<boolean>(q("[data-testid='search-panel']")));
    if (!panelShown) return fail("search panel not shown via find");
    await js<void>(`(() => {
      const input = document.querySelector("[data-testid='search-input']");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "正文 a。");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    const hitRows = await poll(async () => {
      const count = await js<string>(
        `document.querySelector("[data-testid='search-count']")?.textContent ?? ""`,
      );
      return count.includes("处命中") ? count : null;
    });
    if (!hitRows) return fail(`find hits not computed (${hitRows})`);
    await js<void>(`document.querySelector("[data-testid='search-hit-row-0']").click()`);
    const hlActive = await poll(() => js<boolean>(q(".search-hit-active")));
    if (!hlActive) return fail("active highlight missing after row click");
    await js<void>(`(() => {
      const input = document.querySelector("[data-testid='search-input']");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    })()`);
    const panelClosed = await poll(() => js<boolean>(`!document.querySelector("[data-testid='search-panel']")`));
    if (!panelClosed) return fail("search panel did not close on Esc");
    const hlCleared = await poll(() => js<boolean>(`document.querySelectorAll(".search-hit").length === 0`));
    if (!hlCleared) return fail("search highlights not cleared on close");

    // 6.2) 全工作区搜索(15):Ctrl+Shift+F → 跨文件命中 → 点击打开并高亮首个命中
    win.webContents.send(IPC.menuCommand, "workspace-search");
    const wsPanel = await poll(() => js<boolean>(q("[data-testid='scope-workspace']")));
    if (!wsPanel) return fail("workspace scope button missing");
    await js<void>(`(() => {
      const input = document.querySelector("[data-testid='search-input']");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "外部新增标记");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    const wsRow = await poll(async () => {
      const rows = await js<number>(`document.querySelectorAll("[data-testid='ws-hit-row']").length`);
      return rows > 0 ? rows : null;
    }, 10000);
    if (!wsRow) return fail("workspace search produced no rows");
    await js<void>(`document.querySelector("[data-testid='ws-hit-row']").click()`);
    const wsOpened = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName.startsWith("外部新增-") ? true : null;
    });
    if (!wsOpened) return fail("workspace hit did not open file");
    const wsHl = await poll(() => js<boolean>(q(".search-hit-active")));
    if (!wsHl) return fail("workspace hit highlight missing");
    const panelStill = await poll(() => js<boolean>(q("[data-testid='search-panel']")));
    if (!panelStill) return fail("search panel closed unexpectedly after hit");

    // 回到 a.md(外部删除测试的前提文档)
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const aOpen2 = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "a.md" ? true : null;
    });
    if (!aOpen2) return fail("a.md reopen after ws search failed");

    // 6.3) 跨文件链接与锚点(16):c.md 内 Ctrl+单击 → b.md 打开并定位标题
    const { writeFile: wf2 } = await import("node:fs/promises");
    const linkDoc = join(wsDir, "c.md");
    await wf2(linkDoc, "[去乙](笔记文件夹/b.md#乙)\n", "utf8");
    const cRow = await poll(() => js<boolean>(q("[data-rel='c.md']")));
    if (!cRow) return fail("c.md row missing after write");
    await js<void>(`document.querySelector("[data-rel='c.md']").click()`);
    const cOpen = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "c.md" ? true : null;
    });
    if (!cOpen) return fail("c.md not opened");
    const ctrlOk = await js<{ ok: boolean; detail: string }>(
      `(() => {
        const a = document.querySelector('.editor-prose a[href]');
        if (!a) return { ok: false, detail: "no-link" };
        const r = a.getBoundingClientRect();
        a.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
        }));
        return { ok: true, detail: "clicked" };
      })()`,
    );
    if (!ctrlOk.ok) return fail(`ctrl-click dispatch failed: ${JSON.stringify(ctrlOk)}`);
    const bOpen = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "b.md" ? true : null;
    });
    if (!bOpen) return fail("ctrl-click did not open b.md");
    const anchorSelected = await poll(async () => {
      const sel = await js<string>(`window.getSelection()?.toString() ?? ""`);
      return sel.includes("乙") ? true : null;
    });
    if (!anchorSelected) return fail("heading anchor not selected after jump");

    await delay(800);
    // 回到 a.md 作为「外部删除」测试对象
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const aOpen3 = await poll(async () => {
      const headerName = await js<string>(
        `document.querySelector("header strong")?.textContent ?? ""`,
      );
      return headerName === "a.md" ? true : null;
    });
    if (!aOpen3) return fail("a.md reopen before external delete failed");
    const { unlink, writeFile: wf } = await import("node:fs/promises");
    await unlink(aPath);
    // Windows chokidar 偶发漏报紧接的 unlink:做一次根目录唤醒写,让同一批次送达
    const wake = join(wsDir, `.wake-${Date.now()}.md`);
    await wf(wake, "wake\n", "utf8");
    await unlink(wake);
    const banner = await poll(() => js<boolean>(q("[data-testid='doc-missing-banner']")), 10000);
    if (!banner) {
      return fail("external-delete banner not shown");
    }
    if (!(await js<boolean>(`document.body.innerText.includes("文件已被删除")`))) {
      return fail("banner copy missing");
    }
    await delay(1600);
    const recreated = await poll(
      async () => {
        try {
          await readFile(aPath, "utf8");
          return false; // 文件存在 → 被静默重建,失败
        } catch {
          return true; // 不存在,符合「不静默重建」
        }
      },
      2500,
    );
    if (!recreated) return fail("file was silently recreated");
    await js<void>(`[...document.querySelectorAll("[data-testid='doc-missing-banner'] button")]
      .find((b) => b.textContent?.includes("放弃"))?.click()`);
    const cleared = await poll(async () => {
      const editorGone = await js<boolean>(
        `document.querySelector("[data-testid='editor-scroll']")?.style.display === 'none'`,
      );
      return editorGone ? true : null;
    });
    if (!cleared) return fail("abandon did not clear editor");
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

/** 播种运行:打开工作区 → 打开 a.md → 键入标记 → 自动保存 → 退出(13 恢复数据源)。 */
export async function runRestoreSeed(win: BrowserWindow, wsDir: string): Promise<void> {
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>;
  let failed = false;
  const fail = async (reason: string): Promise<void> => {
    failed = true;
    console.error(`[smoke] seed FAILED: ${reason}`);
  };
  await delay(1200);
  try {
    win.webContents.send(IPC.openWorkspaceRequest, wsDir);
    const row = await pollUntil(() => js<boolean>(`!!document.querySelector("[data-rel='a.md']")`), 10000);
    if (!row) return fail("a.md row missing");
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const opened = await pollUntil(
      async () => (await js<string>(`document.querySelector("header strong")?.textContent ?? ""`)) === "a.md",
      10000,
    );
    if (!opened) return fail("a.md not opened");
    const marker = `恢复标记-${Date.now()}`;
    const typed = await typeAtEnd(win, marker);
    if (!typed.ok) return fail(`typing failed: ${typed.detail}`);
    const saved = await waitSaved(win);
    if (saved !== "saved") return fail(`autosave not reached (${saved})`);
    console.log(`[smoke] seed ok marker=${marker}`);
  } catch (err) {
    await fail(`seed threw: ${String(err)}`);
  } finally {
    if (failed) process.exitCode = 1;
    app.quit();
  }
}

/** 恢复运行:常规启动应直接回到上次工作区与最后文件;文件缺失场景另验。 */
export async function runRestoreCheck(win: BrowserWindow, expectFile: string): Promise<void> {
  const js = <T>(code: string): Promise<T> => win.webContents.executeJavaScript(code) as Promise<T>;
  const consoleIssues: string[] = [];
  win.webContents.on("console-message", (event) => {
    const level = event.level;
    if (typeof level === "number" ? level >= 2 : level === "error" || level === "warning") {
      consoleIssues.push(`console[${String(level)}]: ${event.message}`);
    }
  });
  let failed = false;
  const fail = async (reason: string): Promise<void> => {
    failed = true;
    console.error(`[smoke] restore FAILED: ${reason}`);
    if (consoleIssues.length) console.error("[smoke] restore console issues:", consoleIssues);
  };
  await delay(1800);
  try {
    const welcomeGone = await pollUntil(
      () => js<boolean>(`document.body.innerText.includes("打开文件夹") === false`),
      8000,
    );
    if (!welcomeGone) {
      const diag = await js<string>(
        `(async () => JSON.stringify({
          body: document.body.innerText.slice(0, 220),
          sidebar: !!document.querySelector("[data-testid='sidebar']"),
          err: document.querySelector("[data-testid='load-error']")?.textContent ?? null,
          last: await window.confidant.stateGet("lastSession"),
          dbg: window.__dbg ?? null,
        }))()`,
      );
      return fail(`welcome page shown instead of restore; diag=${diag}`);
    }
    const header = await pollUntil(
      async () => (await js<string>(`document.querySelector("header strong")?.textContent ?? ""`)) === expectFile,
      10000,
    );
    if (!header) return fail(`restored file header mismatch (expect ${expectFile})`);
    const wsDir = process.env["CONFIDANT_E2E_WS_DIR"];
    if (wsDir) {
      const content = await readFile(join(wsDir, expectFile), "utf8");
      if (!content.includes("恢复标记-")) return fail("marker missing on disk");
    }
    const markerVisible = await js<boolean>(`document.body.innerText.includes("恢复标记-")`);
    if (!markerVisible) return fail("typed marker not in restored editor");
    console.log("[smoke] restore ok");
  } catch (err) {
    await fail(`restore threw: ${String(err)}`);
  } finally {
    if (failed) process.exitCode = 1;
    app.quit();
  }
}

export function pollUntil<T>(probe: () => Promise<T | null | false>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async (): Promise<void> => {
      try {
        const v = await probe();
        if (v !== null && v !== false) {
          resolve(v as T);
          return;
        }
      } catch {
        // 页面未就绪,继续轮询
      }
      if (Date.now() > deadline) resolve(null);
      else setTimeout(() => void tick(), 200);
    };
    void tick();
  });
}

