// 自检/冒烟与端到端驱动(dev 辅助;与主进程逻辑隔离,打包后仍可经 CONFIDANT_* 环境门启用)
import { app, BrowserWindow, clipboard, ipcMain, Menu } from "electron";
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

/** 等待磁盘文件包含标记文本(自动保存落盘真相源;顶栏「已保存」文案已移除),≤8s。 */
export async function waitDiskContains(
  filePath: string,
  marker: string,
  timeoutMs = 8000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(filePath, "utf8");
      if (content.includes(marker)) return true;
    } catch {
      // 读写竞态,重试
    }
    await delay(200);
  }
  return false;
}

/** 顶栏移除后文档名探针改用窗口标题(有文档时 title = `${name} · confidant`)。 */
export async function docTitleIs(win: BrowserWindow, name: string): Promise<boolean> {
  return (await win.webContents.executeJavaScript("document.title")) === `${name} · confidant`;
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

      // 不点保存:证明停顿后自动写盘(顶栏状态条已移除,以磁盘真相为判据)
      if (!(await waitDiskContains(notePath, mark1))) return fail("autosave not reached");

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
        const expectTop = ["文件", "编辑", "段落", "格式", "视图", "设置", "帮助"];
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
        // 25:编辑菜单 role 项显式中文;段落/格式新快捷键落地检查
        const cutItem = getMenuItem("cut");
        if (cutItem?.label !== "剪切") return fail(`cut role label not Chinese: ${cutItem?.label}`);
        const h1Item = getMenuItem("heading-1");
        if (h1Item?.accelerator !== "Ctrl+1") return fail(`heading-1 accelerator wrong: ${h1Item?.accelerator}`);
        const openFolderItem = getMenuItem("open-folder");
        if (openFolderItem?.accelerator !== "Ctrl+O") return fail(`open-folder accelerator wrong: ${openFolderItem?.accelerator}`);

        const typed2 = await typeAtEnd(win, mark2);
        if (!typed2.ok) return fail(`second typing failed: ${JSON.stringify(typed2)}`);
        // 模拟 native 菜单点击:同一 command 通道(菜单 accelerator 为 OS 级,不可脚本触发)
        win.webContents.send(IPC.menuCommand, "save");
        if (!(await waitDiskContains(notePath, mark2))) return fail("menu-command save not reached");

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

        // 26:空段落点击探针(实机复验):Enter×3 造空段 → 真实输入事件点击空行各变体,
        // 光标须落位(行中心为硬判据;其余变体仅记录)
        // 26:空段落点击探针(实机复验)。注意:与真实使用一致地先开工作区再开文件
        // (仅开文件时 `!workspace` 的欢迎页绝对定位覆盖编辑区,吞掉一切点击——那是
        // E2E 直接开文件路径的伪影,真实用户无法走到;故探针必须带工作区)。
        const probeDir = notePath.replace(/[\\/][^\\/]*$/, "");
        const probeName = notePath.split(/[\\/]/).pop() ?? "fixture.md";
        win.webContents.send(IPC.openWorkspaceRequest, probeDir);
        await delay(800);
        const wsReady = await pollUntil(
          () => js<boolean>(`!!document.querySelector("[data-rel='${probeName}']")`),
          15000,
        );
        if (!wsReady) {
          const diag = await js<string>(
            `JSON.stringify({
              body: document.body.innerText.slice(0, 200),
              sidebar: !!document.querySelector("[data-testid='sidebar']"),
              rels: [...document.querySelectorAll("[data-rel]")].map((el) => el.getAttribute("data-rel")),
              title: document.title,
            })`,
          );
          return fail(`empty-line click probe: workspace not opened (${probeDir}); diag=${diag}`);
        }
        win.webContents.send(IPC.openFileRequest, notePath);
        const probeFileOpen = await pollUntil(() => docTitleIs(win, probeName), 8000);
        if (!probeFileOpen) return fail(`empty-line click probe: file not opened (${probeName})`);
        const probePoints = await js<{ ok: boolean; detail: string }>(
          `(() => {
            const el = document.querySelector('[contenteditable="true"]');
            if (!el) return { ok: false, detail: "no-editor" };
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            for (let i = 0; i < 3; i++) {
              el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            }
            const ps = [...el.querySelectorAll("p")];
            const empties = ps.filter((p) => (p.textContent ?? "").trim() === "");
            if (empties.length === 0) return { ok: false, detail: "no-empty-paragraph" };
            const t = empties[Math.floor(empties.length / 2)];
            t.scrollIntoView({ block: "center" });
            const r = t.getBoundingClientRect();
            if (r.height === 0) return { ok: false, detail: "empty-p-no-height" };
            const hit = (x, y) => {
              const el = document.elementFromPoint(x, y);
              return el ? el.tagName + "#" + el.id + "." + el.className + " :: " + el.outerHTML.slice(0, 100) : "null";
            };
            const textP = ps.find((p) => (p.textContent ?? "").trim().length > 0);
            const tr = textP ? textP.getBoundingClientRect() : null;
            return {
              ok: true,
              detail: JSON.stringify({
                cx: r.left + r.width / 2,
                yMid: r.top + r.height / 2,
                yTop: r.top,
                yBottom: r.bottom,
                hitCenter: hit(r.left + r.width / 2, r.top + r.height / 2),
                hitMargin: hit(r.left + r.width / 2, r.top - 2),
                textCtrl: tr ? { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 } : null,
                empties: empties.length,
              }),
            };
          })()`,
        );
        if (!probePoints.ok) return fail(`empty-line click probe setup: ${probePoints.detail}`);
        const pp = JSON.parse(probePoints.detail) as {
          cx: number; yMid: number; yTop: number; yBottom: number; empties: number;
        };
        const variants: Array<{ tag: string; x: number; y: number }> = [
          { tag: "center", x: pp.cx, y: pp.yMid },
          { tag: "line-top-margin", x: pp.cx, y: pp.yTop - 2 },
          { tag: "line-bottom-margin", x: pp.cx, y: pp.yBottom + 2 },
        ];
        // 失焦变体:先真实点击侧栏空白(编辑器失焦),再点空行——覆盖「先点别处再点空行」场景
        const sidebarBlur = await js<{ x: number; y: number } | null>(
          `(() => {
            const sb = document.querySelector("[data-testid='sidebar']");
            const r = sb ? sb.getBoundingClientRect() : null;
            if (!r || r.height === 0) return null;
            return { x: r.left + 20, y: r.top + 40 };
          })()`,
        );
        if (sidebarBlur) {
          win.webContents.sendInputEvent({ type: "mouseDown", x: sidebarBlur.x, y: sidebarBlur.y, button: "left", clickCount: 1 });
          win.webContents.sendInputEvent({ type: "mouseUp", x: sidebarBlur.x, y: sidebarBlur.y, button: "left", clickCount: 1 });
          await delay(150);
          const blurred = await js<boolean>(
            `document.activeElement?.tagName === "BODY" ||
             !(document.querySelector("[contenteditable='true']")?.contains(document.activeElement))`,
          );
          if (!blurred) return fail(`empty-line click probe: sidebar blur did not defocus editor`);
          variants.push({ tag: "center-after-blur", x: pp.cx, y: pp.yMid });
        }
        const clickResults: Array<{ tag: string; ok: boolean; detail?: string }> = [];
        await js<void>(`(() => {
          window.__probeEvts = [];
          window.addEventListener("mousedown", (e) => window.__probeEvts.push({ t: "down", x: e.clientX, y: e.clientY, tag: e.target?.tagName ?? "", cls: e.target?.className ?? "", trusted: e.isTrusted }), true);
          window.addEventListener("mouseup", (e) => window.__probeEvts.push({ t: "up", x: e.clientX, y: e.clientY, tag: e.target?.tagName ?? "", trusted: e.isTrusted }), true);
        })()`);
        for (const v of variants) {
          win.webContents.sendInputEvent({ type: "mouseDown", x: v.x, y: v.y, button: "left", clickCount: 1 });
          win.webContents.sendInputEvent({ type: "mouseUp", x: v.x, y: v.y, button: "left", clickCount: 1 });
          await delay(150);
          const st = await js<{ ok: boolean; detail: string }>(
            `(() => {
              const el = document.querySelector('[contenteditable="true"]');
              const sel2 = window.getSelection();
              const focusInside = sel2?.focusNode
                ? el === sel2.focusNode || el.contains(sel2.focusNode)
                : false;
              const evts = (window.__probeEvts ?? []).slice(-4);
              window.__probeEvts = [];
              return {
                ok: focusInside,
                detail: JSON.stringify({
                  active: document.activeElement === el ? "editor" : document.activeElement?.tagName ?? "none",
                  focusInside,
                  collapsed: sel2?.isCollapsed ?? null,
                  evts,
                }),
              };
            })()`,
          );
          clickResults.push({ tag: v.tag, ok: st.ok, detail: st.detail });
        }
        const centerHit = clickResults.find((c) => c.tag === "center");
        if (!centerHit?.ok) {
          return fail(`empty-line click probe: center miss; setup=${probePoints.detail} all=${JSON.stringify(clickResults)}`);
        }
        console.log(`[smoke] empty-line click probe ok (${clickResults.map((c) => `${c.tag}:${c.ok ? "hit" : "miss"}`).join(" ")})`);

        // 30:源码模式竖切——进入 → 文本区含头字节 → 键入 → 字节直写落盘 → 切回
        win.webContents.send(IPC.menuCommand, "source-mode");
        const srcShown = await pollUntil(() => js<boolean>(`!!document.querySelector("[data-testid='source-editor']")`), 5000);
        if (!srcShown) return fail("source mode not shown");
        const srcValue = await js<string>(
          `document.querySelector("[data-testid='source-editor']")?.value ?? ""`,
        );
        if (!srcValue.startsWith("---\ntitle: 复验\n---")) {
          return fail(`source mode content missing front matter: ${JSON.stringify(srcValue.slice(0, 60))}`);
        }
        const mark3 = `源码模式标记-${Date.now()}`;
        await js<void>(`(() => {
          const ta = document.querySelector("[data-testid='source-editor']");
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(ta, ta.value + "\\n" + ${JSON.stringify(mark3)} + "\\n");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
        })()`);
        const srcSaved = await pollUntil(async () => {
          const content = await readFile(notePath, "utf8");
          return content.includes(mark3) ? true : null;
        }, 8000);
        if (!srcSaved) return fail("source mode marker not saved (byte-direct)");
        win.webContents.send(IPC.menuCommand, "source-mode");
        const srcGone = await pollUntil(() => js<boolean>(`!document.querySelector("[data-testid='source-editor']")`), 5000);
        if (!srcGone) return fail("source mode did not exit");
        const wysiwygHas = await pollUntil(async () => {
          const text = await js<string>("document.body.innerText");
          return text.includes(mark3) ? true : null;
        }, 5000);
        if (!wysiwygHas) return fail("source marker missing in WYSIWYG after toggle back");
        const finalDisk = await readFile(notePath, "utf8");
        if (!finalDisk.startsWith("---\ntitle: 复验\n---")) {
          return fail("front matter changed after source mode roundtrip");
        }
        console.log("[smoke] source mode ok (enter/save/exit)");

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
      if (!probe.bodyText.includes("最懂你的笔记软件")) return fail("welcome subtitle missing");
      // 27:无工作区时侧栏空态框体默认显示;开关经「视图 → 侧栏显示/隐藏」菜单命令通道可隐可还原
      const emptyInit = await pollUntil(() => js<boolean>(`!!document.querySelector("[data-testid='sidebar-empty']")`), 5000);
      if (!emptyInit) return fail("sidebar empty state not shown without workspace");
      Menu.getApplicationMenu()?.getMenuItemById("toggle-sidebar")?.click();
      const emptyGone = await pollUntil(() => js<boolean>(`!document.querySelector("[data-testid='sidebar-empty']")`), 5000);
      if (!emptyGone) return fail("sidebar empty state did not hide on toggle");
      Menu.getApplicationMenu()?.getMenuItemById("toggle-sidebar")?.click();
      const emptyBack = await pollUntil(() => js<boolean>(`!!document.querySelector("[data-testid='sidebar-empty']")`), 5000);
      if (!emptyBack) return fail("sidebar empty state did not restore on toggle");
      console.log("[smoke] sidebar empty-state toggle ok");
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

    // 02:编辑区排版探针——标题体系(h1 2.25em/bold/下边框)、块间距 0.8em、
    // 内容宽度分级(默认视口 → 860px 上限)
    const typo = await js<string>(
      `JSON.stringify({
        h1Size: getComputedStyle(document.querySelector(".editor-prose h1")).fontSize,
        h1Weight: getComputedStyle(document.querySelector(".editor-prose h1")).fontWeight,
        h1Border: getComputedStyle(document.querySelector(".editor-prose h1")).borderBottomWidth,
        pMargin: getComputedStyle(document.querySelector(".editor-prose p")).marginTop,
        width: document.querySelector(".editor-prose").getBoundingClientRect().width,
        maxWidth: getComputedStyle(document.querySelector(".editor-prose")).maxWidth,
      })`,
    );
    const t = JSON.parse(typo) as {
      h1Size: string; h1Weight: string; h1Border: string; pMargin: string; width: number; maxWidth: string;
    };
    // 高分屏下 1px CSS 边框的 used value 可为小数(缩放伪影),按 0.5–1.5px 判界
    const h1BorderPx = parseFloat(t.h1Border);
    const typoChecks = [
      t.h1Size === "36px" || `h1 size ${t.h1Size} (expect 36px)`,
      t.h1Weight === "700" || `h1 weight ${t.h1Weight} (expect 700)`,
      (h1BorderPx >= 0.5 && h1BorderPx <= 1.5) || `h1 border ${t.h1Border} (expect ~1px)`,
      t.pMargin === "12.8px" || `p margin ${t.pMargin} (expect 12.8px = 0.8em)`,
      t.width <= 860 || `prose width ${t.width} (expect <=860)`,
    ];
    const firstTypoBad = typoChecks.find((c) => typeof c === "string");
    if (firstTypoBad) return fail(`typography probe: ${firstTypoBad} (${typo})`);
    console.log(`[smoke] typography probe ok (h1 36px/bold/border, p 0.8em, width ${t.width}px)`);

    // 02:宽度分级探针(视口 ≥1400 → 1024px;≥1800 → 1200px;侧栏 260px 让位)
    for (const [w, expect] of [
      [1500, 1024],
      [1900, 1200],
    ] as const) {
      win.setSize(w, 800);
      await delay(500);
      const pw = await js<number>(
        `document.querySelector(".editor-prose").getBoundingClientRect().width`,
      );
      if (Math.abs(pw - expect) > 2) return fail(`width tier ${w}px: got ${pw} expect ${expect}`);
    }
    win.setSize(1200, 800);
    await delay(500);
    const pwBack = await js<number>(
      `document.querySelector(".editor-prose").getBoundingClientRect().width`,
    );
    if (Math.abs(pwBack - 860) > 2) return fail(`width tier 1200px: got ${pwBack} expect 860`);
    console.log("[smoke] width tiers ok (860/1024/1200)");

    // 02:字体资产落地(Open Sans 随 UI 文本已用;PT Serif 需主动 load 触发)
    const fontsOk = await poll(async () => {
      const ok = await js<boolean>(
        `document.fonts.load('16px "PT Serif"').then(() =>
          document.fonts.check('16px "Open Sans"') && document.fonts.check('16px "PT Serif"'))`,
      );
      return ok ? true : null;
    });
    if (!fontsOk) {
      const diag = await js<string>(
        `JSON.stringify({
          status: document.fonts.status,
          faces: [...document.fonts].map((f) => f.family + "@" + f.weight + ":" + f.status),
          osLoad: document.fonts.check('16px "Open Sans"'),
          ptLoad: document.fonts.check('16px "PT Serif"'),
          fontUrls: performance.getEntriesByType("resource").filter((r) => r.name.includes("woff2")).map((r) => r.name),
        })`,
      );
      return fail(`font assets not loaded; diag=${diag}`);
    }

    // 04:页脚字数探针——常驻渲染 → 点击弹四口径 → 切换口径持久化 → 段落类型
    const wcText = await poll(async () => {
      const t = await js<string>(
        `document.querySelector("[data-testid='footer-word-count']")?.textContent ?? ""`,
      );
      return t.includes("字数 ") ? t : null;
    });
    if (!wcText) return fail("footer word count not rendered");
    const wcNum = parseInt(wcText.replace(/[^\d]/g, ""), 10);
    if (!(wcNum > 0)) return fail(`footer word count zero: ${wcText}`);
    await js<void>(`document.querySelector("[data-testid='footer-word-count']").click()`);
    const popupShown = await poll(() => js<boolean>(q("[data-testid='word-count-popup']")));
    if (!popupShown) return fail("word count popup not shown");
    const metricRows = await js<number>(
      `document.querySelectorAll("[data-testid^='wc-metric-']").length`,
    );
    if (metricRows !== 4) return fail(`word count popup rows: ${metricRows}`);
    // 段落类型:光标置入 h1 标题 a → footer 显示「标题 1」
    await js<void>(`(() => {
      const h = document.querySelector(".editor-prose h1");
      if (!h) return;
      const tn = [...h.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (!tn) return;
      const range = document.createRange();
      range.setStart(tn, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    })()`);
    const blockTypeShown = await poll(() =>
      js<boolean>(
        `document.querySelector("[data-testid='footer-block-type']")?.textContent === "标题 1"`,
      ),
    );
    if (!blockTypeShown) return fail("footer block type not shown for heading");
    // 切换口径为「字符」→ footer 更新 + 持久化
    await js<void>(`[...document.querySelectorAll("[data-testid^='wc-metric-']")]
      .find((b) => b.textContent?.includes("字符"))?.click()`);
    const metricSwitched = await poll(async () => {
      const t = await js<string>(
        `document.querySelector("[data-testid='footer-word-count']")?.textContent ?? ""`,
      );
      return t.includes("字符 ") ? t : null;
    });
    if (!metricSwitched) return fail("word count metric switch not applied");
    const storedMetric = await js<unknown>(`window.confidant.stateGet("wordCountMetric")`);
    if (storedMetric !== "chars") return fail(`metric persistence wrong: ${JSON.stringify(storedMetric)}`);
    // 还原为默认口径(后续探针不受影响)
    await js<void>(`document.querySelector("[data-testid='footer-word-count']").click()`);
    await js<void>(`[...document.querySelectorAll("[data-testid^='wc-metric-']")]
      .find((b) => b.textContent?.includes("字数"))?.click()`);
    console.log(`[smoke] footer word count ok (${wcText}; block type 标题 1; metric persisted)`);

    // 06:视图模式探针——专注(焦点块正色/他块淡出/失焦保持)→ 打字机(padding 50%)
    // → 与源码互斥(进入退出恢复)→ F11 全屏
    const hostCls = `document.querySelector("[data-testid='editor-prose']")?.className ?? ""`;
    // 光标置入正文段(「正文 a。」所在 p)
    await js<void>(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      const p = [...el.querySelectorAll("p")].find((n) => n.textContent?.includes("正文 a"));
      const tn = [...p.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (!tn) return;
      const range = document.createRange();
      range.setStart(tn, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    })()`);
    win.webContents.send(IPC.menuCommand, "focus-mode");
    const focusOn = await poll(() =>
      js<boolean>(`(${hostCls}).includes("focus-mode")`),
    );
    if (!focusOn) return fail("focus mode class not applied");
    const focusBlock = await poll(() =>
      js<boolean>(
        `!!document.querySelector(".editor-prose .ProseMirror > .focus-block")`,
      ),
    );
    if (!focusBlock) {
      const diag = await js<string>(
        `JSON.stringify({
          anyMarker: document.querySelectorAll(".focus-block").length,
          anchorTag: (() => { const a = window.getSelection()?.anchorNode; return a ? (a.nodeType === Node.TEXT_NODE ? "text:" + (a.parentElement?.tagName ?? "") : a.nodeName) : "none"; })(),
          hostCls: document.querySelector("[data-testid='editor-prose']")?.className ?? "",
        })`,
      );
      return fail(`focus block marker missing; diag=${diag}`);
    }
    const focusColors = await js<{ focus: string; other: string }>(
      `(() => {
        const f = document.querySelector(".editor-prose .focus-block");
        const h = document.querySelector(".editor-prose h1");
        return {
          focus: getComputedStyle(f).color,
          other: getComputedStyle(h).color,
        };
      })()`,
    );
    // github 主题:焦点段 #333333、非焦点段 #C8C8C8
    if (!focusColors.focus.includes("51, 51, 51") || !focusColors.other.includes("200, 200, 200")) {
      return fail(`focus colors wrong: ${JSON.stringify(focusColors)}`);
    }
    // 失焦保持:点侧栏空白 → 模式与焦点块标记仍在
    await js<void>(`(() => {
      const sb = document.querySelector("[data-testid='sidebar']");
      const r = sb.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + 30, r.top + 80);
      if (el && !el.closest("[data-testid='sidebar-tabs'], [data-testid='tree-search-placeholder']")) el.click();
    })()`);
    await delay(300);
    const focusKept = await js<boolean>(`(${hostCls}).includes("focus-mode")`);
    if (!focusKept) return fail("focus mode exited on editor blur");
    // 打字机:padding-top 50%(内容宽 860 → ≈430px)、padding-bottom 收紧;
    // padding-top 有 0.4s 过渡,须等过渡完成再读计算值
    win.webContents.send(IPC.menuCommand, "typewriter-mode");
    const twOn = await poll(() => js<boolean>(`(${hostCls}).includes("typewriter-mode")`));
    if (!twOn) return fail("typewriter class not applied");
    await delay(600);
    const twPad = await js<{ top: number; bottom: number }>(
      `(() => {
        const p = document.querySelector("[data-testid='editor-prose']");
        return {
          top: parseFloat(getComputedStyle(p).paddingTop),
          bottom: parseFloat(getComputedStyle(p).paddingBottom),
        };
      })()`,
    );
    if (Math.abs(twPad.top - 430) > 60 || twPad.bottom > 200) {
      return fail(`typewriter padding wrong: ${JSON.stringify(twPad)}`);
    }
    // 两模式叠加 + 与源码互斥:进入源码自动退出;退出恢复原勾选态
    win.webContents.send(IPC.menuCommand, "source-mode");
    await poll(() => js<boolean>(`!!document.querySelector("[data-testid='source-editor']")`));
    const modesOffInSource = await js<boolean>(
      `(${hostCls}).includes("focus-mode") === false && (${hostCls}).includes("typewriter-mode") === false`,
    );
    if (!modesOffInSource) return fail("focus/typewriter not exited in source mode");
    const modeItemGreyed = await poll(async () => {
      const item = getMenuItem("focus-mode");
      return item ? item.enabled === false : null;
    });
    if (!modeItemGreyed) return fail("focus-mode menu item not disabled in source mode");
    win.webContents.send(IPC.menuCommand, "source-mode");
    const modesRestored = await poll(() =>
      js<boolean>(
        `(${hostCls}).includes("focus-mode") && (${hostCls}).includes("typewriter-mode")`,
      ),
    );
    if (!modesRestored) return fail("focus/typewriter not restored after source exit");
    // 关闭两模式(还原现场)
    win.webContents.send(IPC.menuCommand, "focus-mode");
    win.webContents.send(IPC.menuCommand, "typewriter-mode");
    await delay(300);
    // F11 全屏:主进程窗口状态直接断言
    win.webContents.send(IPC.menuCommand, "fullscreen");
    const fsOn = await poll(async () => {
      const v = win.isFullScreen();
      return v ? true : null;
    });
    if (!fsOn) return fail("fullscreen did not enter (F11)");
    win.webContents.send(IPC.menuCommand, "fullscreen");
    const fsOff = await poll(async () => {
      const v = win.isFullScreen();
      return !v ? true : null;
    });
    if (!fsOff) return fail("fullscreen did not exit (F11)");
    console.log("[smoke] view modes ok (focus colors/blur-keep/typewriter padding/source-exclusive/fullscreen)");

    const mark1 = `工作区保存-${Date.now()}`;
    const typed = await typeAtEnd(win, mark1);
    if (!typed.ok) return fail(`typing failed: ${JSON.stringify(typed)}`);
    const aPath = join(wsDir, "a.md");
    if (!(await waitDiskContains(aPath, mark1))) return fail("autosave not reached");
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
    await waitDiskContains(aPath, mark1);

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
    // 29:浮动工具条已移除——选中文字不再出现 format-toolbar
    const toolbarGone = await poll(() => js<boolean>(`!document.querySelector("[data-testid='format-toolbar']")`), 5000);
    if (!toolbarGone) return fail("format toolbar should be removed (29)");
    // 加粗改走菜单命令通道(与「格式」菜单同一引擎命令面)
    win.webContents.send(IPC.menuCommand, "bold");
    const boldSaved = await poll(async () => {
      const content = await readFile(aPath, "utf8");
      return content.includes("**正文 a。**") ? true : null;
    });
    if (!boldSaved) return fail("bold not persisted via menu (autosave)");

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

    // 2.8b) 链接面板(29):Ctrl+K → 面板 → 填地址 → 提交落盘;光标移入链接 → 再开 → 改地址
    await js<void>(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    })()`);
    win.webContents.send(IPC.menuCommand, "link");
    const linkPanelShown = await poll(() => js<boolean>(q("[data-testid='link-panel']")));
    if (!linkPanelShown) return fail("link panel not shown via menu");
    await js<void>(`(() => {
      const input = document.querySelector("[data-testid='link-href-input']");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "https://example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await js<void>(`document.querySelector("[data-testid='link-commit']").click()`);
    const linkSaved = await poll(async () => {
      const content = await readFile(aPath, "utf8");
      return content.includes("[https://example.com](https://example.com)") ? true : null;
    });
    if (!linkSaved) return fail("link insert not persisted via panel");
    // 编辑态:DOM 选中链接文本 → Ctrl+K → 预填(编辑态) → 改地址 → 提交
    await js<void>(`(() => {
      const a = document.querySelector(".editor-prose a[href]");
      if (!a) return;
      a.focus();
      const tn = [...a.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (!tn) return;
      const range = document.createRange();
      range.setStart(tn, 0);
      range.setEnd(tn, (tn.textContent ?? "").length);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    })()`);
    win.webContents.send(IPC.menuCommand, "link");
    const panelEdit = await poll(() => js<boolean>(q("[data-testid='link-text-input']")));
    if (!panelEdit) return fail("link panel not in edit mode on link caret");
    await js<void>(`(() => {
      const input = document.querySelector("[data-testid='link-href-input']");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "https://example.org");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await js<void>(`document.querySelector("[data-testid='link-commit']").click()`);
    const linkEdited = await poll(async () => {
      const content = await readFile(aPath, "utf8");
      return content.includes("(https://example.org)") && !content.includes("(https://example.com)")
        ? true
        : null;
    });
    if (!linkEdited) {
      const tail = (await readFile(aPath, "utf8")).slice(-260);
      return fail(`link edit not persisted via panel; diskTail=${JSON.stringify(tail)}`);
    }
    console.log("[smoke] link panel ok (insert/edit)");

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
    // 等待窗口标题切换为外部文件(避免树内旧行文本误判;顶栏文档名已移除)
    const extOpen = await poll(() => docTitleIs(win, externalName));
    if (!extOpen) return fail("external file did not open");
    const mark2 = `外部新增标记-${Date.now()}`;
    const typed2 = await typeAtEnd(win, mark2);
    if (!typed2.ok) return fail(`typing2 failed: ${JSON.stringify(typed2)}`);
    if (!(await waitDiskContains(externalAbs, mark2))) {
      const diag = await js<string>(
        `JSON.stringify({
          text: document.body.innerText.slice(0, 300),
          html: document.getElementById('root')?.innerHTML.slice(0, 900) ?? 'no-root',
        })`,
      );
      return fail(`autosave2 not reached; diag=${diag}`);
    }
    const diskExt = await readFile(externalAbs, "utf8");
    if (!diskExt.includes(mark2)) return fail("external note marker missing on disk");

    // 4) 侧栏折叠/还原(顶栏开关已移除:经「视图 → 侧栏显示/隐藏」菜单命令通道)
    const before = await js<boolean>(q("[data-testid='sidebar']"));
    if (!before) return fail("sidebar missing");
    Menu.getApplicationMenu()?.getMenuItemById("toggle-sidebar")?.click();
    const collapsed = await poll(() => js<boolean>(`document.querySelector("[data-testid='sidebar']") === null`));
    if (!collapsed) return fail("sidebar did not collapse");
    Menu.getApplicationMenu()?.getMenuItemById("toggle-sidebar")?.click();
    const restored = await poll(() => js<boolean>(q("[data-testid='sidebar']")));
    if (!restored) return fail("sidebar did not restore");

    // 5) 文件操作(10):先回 a.md(确定性上下文),菜单「新建笔记」→ 落盘并打开
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const baseOpen = await poll(() => docTitleIs(win, "a.md"));
    if (!baseOpen) return fail("base note reopen before new-note failed");
    win.webContents.send(IPC.menuCommand, "new-note");
    const nnRow = await poll(async () => {
      const has = await js<boolean>(q("[data-rel='未命名笔记.md']"));
      if (!has) return null;
      const content = await readFile(join(wsDir, "未命名笔记.md"), "utf8");
      return content.length >= 0 ? true : null;
    });
    if (!nnRow) return fail("new-note via menu failed");
    const nnOpen = await poll(() => docTitleIs(win, "未命名笔记.md"), 12000);
    if (!nnOpen) {
      const diag = await js<string>(
        `JSON.stringify({
          title: document.title,
          body: document.body.innerText.slice(0, 150),
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

    // 5.6) 主题(01):三主题即时生效(computed 校验)+ 每主题截图存档
    const themes: Array<{ cmd: string; name: string; bg: string }> = [
      { cmd: "theme-github", name: "github", bg: "255, 255, 255" },
      { cmd: "theme-night", name: "night", bg: "54, 59, 64" },
      { cmd: "theme-newsprint", name: "newsprint", bg: "243, 242, 238" },
    ];
    for (const t of themes) {
      win.webContents.send(IPC.menuCommand, t.cmd);
      const applied = await poll(async () => {
        const theme = await js<string>(`document.documentElement.dataset.theme ?? ""`);
        if (theme !== t.name) return null;
        const bg = await js<string>(`getComputedStyle(document.body).backgroundColor`);
        return bg.includes(t.bg) ? true : null;
      });
      if (!applied) return fail(`theme ${t.name} not applied`);
      await delay(300);
      try {
        mkdirSync(join(__dirname, "../../out/smoke"), { recursive: true });
        const { writeFileSync } = await import("node:fs");
        writeFileSync(
          join(__dirname, `../../out/smoke/theme-${t.name}.png`),
          (await win.webContents.capturePage()).toPNG(),
        );
      } catch {
        // 截图失败不判定失败(与收尾截图同一兜底口径)
      }
    }

    // 5.7) 导出 PDF(19):菜单命令 → 同目录同名 .pdf(覆盖);提示条出现
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const expBase = await poll(() => docTitleIs(win, "a.md"));
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
    const aOpen = await poll(() => docTitleIs(win, "a.md"));
    if (!aOpen) return fail("a.md reopen failed");
    // 6.1) 查找(14):Ctrl+F(菜单通道)→ 输入 → 命中行 → 点击定位高亮 → Esc 关闭清高亮
    win.webContents.send(IPC.menuCommand, "find");
    const panelShown = await poll(() => js<boolean>(q("[data-testid='search-panel']")));
    if (!panelShown) return fail("search panel not shown via find");
    // 05:顶部通栏几何(贴顶 + 输入框 26px)
    const sbRect = await js<{ top: number; inputH: number }>(
      `({
        top: document.querySelector("[data-testid='search-panel']").getBoundingClientRect().top,
        inputH: document.querySelector("[data-testid='search-input']").getBoundingClientRect().height,
      })`,
    );
    if (sbRect.top !== 0 || Math.abs(sbRect.inputH - 26) > 1) {
      return fail(`search topbar geometry wrong: ${JSON.stringify(sbRect)}`);
    }
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
      const title = await js<string>("document.title");
      return title.startsWith("外部新增-") ? true : null;
    });
    if (!wsOpened) return fail("workspace hit did not open file");
    const wsHl = await poll(() => js<boolean>(q(".search-hit-active")));
    if (!wsHl) {
      const diag = await js<string>(
        `JSON.stringify({
          hits: document.querySelectorAll(".search-hit").length,
          active: document.querySelectorAll(".search-hit-active").length,
          panelOpen: !!document.querySelector("[data-testid='search-panel']"),
          body: document.body.innerText.slice(0, 120),
        })`,
      );
      return fail(`workspace hit highlight missing; diag=${diag}`);
    }
    const panelStill = await poll(() => js<boolean>(q("[data-testid='search-panel']")));
    if (!panelStill) return fail("search panel closed unexpectedly after hit");

    // 回到 a.md(外部删除测试的前提文档)
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const aOpen2 = await poll(() => docTitleIs(win, "a.md"));
    if (!aOpen2) return fail("a.md reopen after ws search failed");

    // 6.3) 跨文件链接与锚点(16):c.md 内 Ctrl+单击 → b.md 打开并定位标题
    const { writeFile: wf2 } = await import("node:fs/promises");
    const linkDoc = join(wsDir, "c.md");
    await wf2(linkDoc, "[去乙](笔记文件夹/b.md#乙)\n", "utf8");
    const cRow = await poll(() => js<boolean>(q("[data-rel='c.md']")));
    if (!cRow) return fail("c.md row missing after write");
    await js<void>(`document.querySelector("[data-rel='c.md']").click()`);
    const cOpen = await poll(() => docTitleIs(win, "c.md"));
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
    const bOpen = await poll(() => docTitleIs(win, "b.md"));
    if (!bOpen) return fail("ctrl-click did not open b.md");
    const anchorSelected = await poll(async () => {
      const sel = await js<string>(`window.getSelection()?.toString() ?? ""`);
      return sel.includes("乙") ? true : null;
    });
    if (!anchorSelected) return fail("heading anchor not selected after jump");

    // 6.4) 代码块视图(28):写带语言代码块的夹具 → 打开 → 高亮/行号断言 →
    //      设置菜单关行号/换行 → 复制按钮 → 剪贴板不含行号
    const codeDoc = join(wsDir, "code.md");
    await wf2(codeDoc, "```js\nconst x = 1;\n```\n", "utf8");
    const codeRow = await poll(() => js<boolean>(q("[data-rel='code.md']")));
    if (!codeRow) return fail("code.md row missing");
    await js<void>(`document.querySelector("[data-rel='code.md']").click()`);
    const codeOpen = await poll(() => docTitleIs(win, "code.md"));
    if (!codeOpen) return fail("code.md not opened");
    const hlOk = await poll(() => js<boolean>(q(".editor-prose pre code .hljs-keyword")));
    if (!hlOk) return fail("code highlight classes missing");
    // 02:语言标签 widget(js → pre 内 .code-lang 文本)
    const langTag = await poll(() =>
      js<boolean>(`document.querySelector(".editor-prose pre .code-lang")?.textContent === "js"`),
    );
    if (!langTag) {
      const diag = await js<string>(
        `JSON.stringify({
          preCount: document.querySelectorAll(".editor-prose pre").length,
          langTags: [...document.querySelectorAll(".editor-prose pre .code-lang")].map((p) => p.textContent),
          hasHost: !!document.querySelector("[data-testid='editor-prose']"),
        })`,
      );
      return fail(`code block language label missing; diag=${diag}`);
    }
    const lnOk = await poll(async () => {
      const t = await js<string>(
        `document.querySelector(".editor-prose pre .code-linenums")?.textContent ?? ""`,
      );
      return t === "1" ? true : null;
    });
    if (!lnOk) return fail("code line numbers missing or wrong");
    // 设置菜单:关闭行号 → 装饰消失;再开 → 恢复
    win.webContents.send(IPC.menuCommand, "settings-code-line-numbers");
    const lnGone = await poll(() => js<boolean>(`!document.querySelector(".editor-prose pre .code-linenums")`));
    if (!lnGone) {
      const diag = await js<string>(
        `JSON.stringify({
          hostAttr: document.querySelector("[data-testid='editor-prose']")?.dataset.codeLines ?? null,
          ln: !!document.querySelector(".editor-prose pre .code-linenums"),
        })`,
      );
      return fail(`line numbers did not hide via settings; diag=${diag}`);
    }
    win.webContents.send(IPC.menuCommand, "settings-code-line-numbers");
    const lnBack = await poll(() => js<boolean>(q(".editor-prose pre .code-linenums")));
    if (!lnBack) return fail("line numbers did not restore via settings");
    // 设置菜单:关闭自动换行 → host 数据属性切换
    win.webContents.send(IPC.menuCommand, "settings-code-wrap");
    const wrapOff = await poll(() =>
      js<boolean>(`document.querySelector("[data-testid='editor-prose']")?.dataset.codeWrap === "off"`),
    );
    if (!wrapOff) return fail("code wrap setting did not apply (data attr)");
    win.webContents.send(IPC.menuCommand, "settings-code-wrap");
    const wrapOn = await poll(() =>
      js<boolean>(`document.querySelector("[data-testid='editor-prose']")?.dataset.codeWrap === "on"`),
    );
    if (!wrapOn) return fail("code wrap setting did not restore (data attr)");
    // 复制按钮:真实鼠标移动到代码块 → 按钮浮现 → 点击复制 → 剪贴板为纯源码(不含行号)
    const codeRect = await js<{ x: number; y: number } | null>(
      `(() => {
        const pre = document.querySelector(".editor-prose pre");
        const r = pre ? pre.getBoundingClientRect() : null;
        if (!r || r.width === 0) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`,
    );
    if (!codeRect) return fail("code block rect missing");
    win.webContents.sendInputEvent({ type: "mouseMove", x: codeRect.x, y: codeRect.y });
    const copyBtn = await poll(() => js<boolean>(q("[data-testid='code-copy-btn']")), 5000);
    if (!copyBtn) {
      const diag = await js<string>(
        `JSON.stringify({
          btn: !!document.querySelector("[data-testid='code-copy-btn']"),
          preCount: document.querySelectorAll(".editor-prose pre").length,
          scroll: !!document.querySelector("[data-testid='editor-scroll']"),
        })`,
      );
      return fail(`copy button not shown on code block hover; diag=${diag}`);
    }
    await js<void>(`document.querySelector("[data-testid='code-copy-btn']").click()`);
    const clipText = await poll<string>(async () => {
      const t = await clipboard.readText();
      return t === "const x = 1;" ? t : null;
    }, 5000);
    if (clipText !== "const x = 1;") return fail(`copy clipboard wrong: ${JSON.stringify(clipText)}`);
    console.log("[smoke] code block view ok (highlight/line-numbers/copy)");

    // 6.4b) 大纲面板(03):双 tab → 空态(code.md 无标题)→ 多标题文档渲染 →
    //       点击跳转(光标置入标题)→ 滚动跟随 → 折叠 → 源码模式禁用
    await js<void>(`document.querySelector("[data-testid='sidebar-tab-outline']").click()`);
    const outlineEmpty = await poll(() =>
      js<boolean>(`document.body.innerText.includes("暂无标题")`),
    );
    if (!outlineEmpty) return fail("outline empty state missing (code.md has no headings)");
    // 先回文件 tab(树 DOM 仅文件 tab 渲染),写 outline.md → 开 → 再切大纲 tab
    await js<void>(`document.querySelector("[data-testid='sidebar-tab-files']").click()`);
    const outlineDoc = join(wsDir, "outline.md");
    await wf2(
      outlineDoc,
      "# 甲\n\n## 甲一\n\n## 甲二\n\n# 乙\n\n### 乙一\n\n" + "正文段落。\n\n".repeat(50),
      "utf8",
    );
    const outlineRow = await poll(() => js<boolean>(q("[data-rel='outline.md']")));
    if (!outlineRow) return fail("outline.md row missing");
    await js<void>(`document.querySelector("[data-rel='outline.md']").click()`);
    const outlineOpen = await poll(() => docTitleIs(win, "outline.md"));
    if (!outlineOpen) return fail("outline.md not opened");
    await js<void>(`document.querySelector("[data-testid='sidebar-tab-outline']").click()`);
    const outlineItems = await poll(async () => {
      const count = await js<number>(
        `document.querySelectorAll("[data-testid^='outline-item']").length`,
      );
      return count === 5 ? count : null;
    });
    if (!outlineItems) return fail(`outline items not rendered (got ${outlineItems})`);
    // 点击跳转:甲二条目 → 光标置入标题内
    await js<void>(`[...document.querySelectorAll("[data-testid^='outline-item']")]
      .find((el) => el.textContent?.includes("甲二"))?.click()`);
    const jumped = await poll(async () => {
      const sel = await js<string>(`window.getSelection()?.anchorNode?.textContent ?? ""`);
      return sel.includes("甲二") ? true : null;
    });
    if (!jumped) return fail("outline click did not place cursor into heading");
    // 滚动跟随:滚到底 → 激活项 = 乙一
    await js<void>(`(() => {
      const sc = document.querySelector("[data-testid='editor-scroll']");
      sc.scrollTop = sc.scrollHeight;
      sc.dispatchEvent(new Event("scroll"));
    })()`);
    const activeBottom = await poll(() =>
      js<string | null>(
        // 判空用 null:空串会被 poll 当有效值立即返回,不等 rAF 提交渲染
        `document.querySelector("[data-testid^='outline-item'][data-active]")?.textContent ?? null`,
      ),
    );
    if (!activeBottom?.includes("乙一")) {
      const diag = await js<string>(
        `JSON.stringify({
          sc: (() => { const s = document.querySelector("[data-testid='editor-scroll']"); return s ? { top: s.scrollTop, h: s.scrollHeight, c: s.clientHeight } : null; })(),
          hTops: [...document.querySelectorAll(".editor-prose :is(h1,h2,h3,h4,h5,h6)")].map((h) => ({ t: h.textContent, top: h.getBoundingClientRect().top })),
        })`,
      );
      return fail(`outline scroll-follow bottom active wrong: ${JSON.stringify(activeBottom)}; diag=${diag}`);
    }
    // 折叠乙(其行内箭头钮;乙行文本恰为「乙」):收起隐藏全部子级(乙一)
    await js<void>(`(() => {
      const row = [...document.querySelectorAll("[data-testid^='outline-item']")]
        .find((el) => el.textContent?.trim() === "乙");
      row?.querySelector("button")?.click();
    })()`);
    const outlineCollapsed = await poll(async () => {
      const count = await js<number>(
        `document.querySelectorAll("[data-testid^='outline-item']").length`,
      );
      return count === 4 ? count : null;
    });
    if (!outlineCollapsed) return fail("outline collapse did not hide children");
    // 源码模式:大纲禁用占位
    win.webContents.send(IPC.menuCommand, "source-mode");
    const outlineDisabled = await poll(() =>
      js<boolean>(`document.body.innerText.includes("源码模式下大纲不可用")`),
    );
    if (!outlineDisabled) return fail("outline not disabled in source mode");
    win.webContents.send(IPC.menuCommand, "source-mode");
    await poll(() => js<boolean>(`!document.querySelector("[data-testid='source-editor']")`));
    // 回到文件 tab(后续探针依赖树 DOM)
    await js<void>(`document.querySelector("[data-testid='sidebar-tab-files']").click()`);
    console.log("[smoke] outline panel ok (tabs/empty/jump/scroll-follow/collapse/source-disable)");

    await delay(800);
    // 回到 a.md 作为「外部删除」测试对象
    await js<void>(`document.querySelector("[data-rel='a.md']").click()`);
    const aOpen3 = await poll(() => docTitleIs(win, "a.md"));
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
    const diag = await js<string>(
      `JSON.stringify({
        title: document.title,
        rels: [...document.querySelectorAll("[data-rel]")].map((el) => el.getAttribute("data-rel")),
        sidebar: !!document.querySelector("[data-testid='sidebar']"),
        body: document.body.innerText.slice(0, 200),
      })`,
    ).catch(() => "no-page");
    await fail(`workspace self-check threw: ${String(err)}; diag=${diag}`);
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
    const opened = await pollUntil(() => docTitleIs(win, "a.md"), 10000);
    if (!opened) return fail("a.md not opened");
    const marker = `恢复标记-${Date.now()}`;
    const typed = await typeAtEnd(win, marker);
    if (!typed.ok) return fail(`typing failed: ${typed.detail}`);
    if (!(await waitDiskContains(join(wsDir, "a.md"), marker))) return fail("autosave not reached");
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
      // 25:欢迎页标记改用标语行(「打开文件夹」按钮已移除,旧判据会永远为真)
      () => js<boolean>(`document.body.innerText.includes("最懂你的笔记软件") === false`),
      8000,
    );
    if (!welcomeGone) {
      const diag = await js<string>(
        `(async () => JSON.stringify({
          body: document.body.innerText.slice(0, 220),
          sidebar: !!document.querySelector("[data-testid='sidebar']"),
          last: await window.confidant.stateGet("lastSession"),
          dbg: window.__dbg ?? null,
        }))()`,
      );
      return fail(`welcome page shown instead of restore; diag=${diag}`);
    }
    const header = await pollUntil(() => docTitleIs(win, expectFile), 10000);
    if (!header) return fail(`restored file title mismatch (expect ${expectFile})`);
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

