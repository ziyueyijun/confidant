// 菜单桥接线(03):命令注册表一次性全量点亮(固定模板 + 快捷键见 menu-bridge)。
// 从 App.tsx 拆分(22)。执行者一律经 refs/稳定回调(挂载一次;命令 run 于用户点按)。
import { useEffect, type RefObject } from "react";
import type { Engine } from "../../../../packages/engine";
import { basename } from "@shared/path";
import type { TreeEntry } from "@shared/ipc";
import { Cmd, createMenuBridge, type MenuBridge, type MenuContext } from "../menu/menu-bridge";
import { wsJoin, type Workspace } from "../workspace/workspace";
import type { OpenNote } from "../session/types";
import type { createSavePipeline } from "../editor/save-pipeline";

export interface MenuRegistrationApi {
  menuRef: RefObject<MenuBridge | null>;
  docRef: RefObject<OpenNote | null>;
  engineRef: RefObject<Engine | null>;
  pipelineRef: RefObject<ReturnType<typeof createSavePipeline> | null>;
  workspaceRef: RefObject<Workspace | null>;
  selectedRef: RefObject<{ rel: string; kind: "dir" | "md" } | null>;
  /** 源码模式(30):段落/格式/查找置灰;撤销重做转发文本区。 */
  sourceModeRef: RefObject<boolean>;
  /** 保存当前文档(源码模式直写文本区,否则走保存管线)。 */
  saveCurrent: () => Promise<void>;
  toggleSourceMode: () => void;
  /** 06:专注/打字机模式切换(页脚按钮与菜单共用)。 */
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  setFindOpen: (v: boolean) => void;
  setFindScope: (v: "file" | "workspace") => void;
  setFindFocus: (fn: (f: number) => number) => void;
  setLinkRequest: (fn: (r: number) => number) => void;
  setUiTick: (fn: (t: number) => number) => void;
  toggleSidebar: () => void;
  toggleCodeWrap: () => void;
  toggleCodeLineNumbers: () => void;
  insertImageViaDialog: () => Promise<void>;
  applyTheme: (t: "github" | "night" | "newsprint") => void;
  openFolderViaDialog: () => Promise<void>;
  doCreateNote: (dirRel: string) => Promise<void>;
  doDeleteEntry: (entry: { relPath: string; kind: "dir" | "md" }) => Promise<void>;
  setPrompt: (p: { type: "new-folder"; dirRel: string } | { type: "rename"; rel: string; name: string } | null) => void;
  showNotice: (label: string, opts?: { undo?: () => void; action?: { label: string; run: () => void } }) => void;
  refreshMenuContext: () => void;
}

export function useMenuBridgeRegistration(api: MenuRegistrationApi): void {
  const { menuRef, docRef, engineRef, pipelineRef, workspaceRef, selectedRef, sourceModeRef, saveCurrent, toggleSourceMode, toggleFocusMode, toggleTypewriterMode, setFindOpen, setFindScope, setFindFocus, setLinkRequest, setUiTick, toggleSidebar, toggleCodeWrap, toggleCodeLineNumbers, insertImageViaDialog, applyTheme, openFolderViaDialog, doCreateNote, doDeleteEntry, setPrompt, showNotice, refreshMenuContext } = api;

// ── 菜单桥(03) ──
  useEffect(() => {
    const menu = createMenuBridge();
    menuRef.current = menu;
    menu.register(Cmd.openFolder, () => true, () => void openFolderViaDialog());
    menu.register(Cmd.save, (ctx) => ctx.docOpen, () => void saveCurrent());
    // 撤销/重做(30):源码模式下转发文本区原生撤销栈
    const runUndoRedo = (cmd: "undo" | "redo"): void => {
      if (sourceModeRef.current) {
        const ta = document.querySelector("[data-testid='source-editor']") as HTMLTextAreaElement | null;
        ta?.focus();
        document.execCommand(cmd);
        return;
      }
      if (cmd === "undo") engineRef.current?.undo();
      else engineRef.current?.redo();
    };
    menu.register(
      Cmd.undo,
      (ctx) => ctx.docOpen && (ctx.canUndo || ctx.sourceMode),
      () => runUndoRedo("undo"),
    );
    menu.register(
      Cmd.redo,
      (ctx) => ctx.docOpen && (ctx.canRedo || ctx.sourceMode),
      () => runUndoRedo("redo"),
    );
    // 查找(14/15):Ctrl+F 当前文件;Ctrl+Shift+F 全工作区
    const openFind = (scope: "file" | "workspace"): void => {
      setFindScope(scope);
      setFindOpen(true);
      setFindFocus((f) => f + 1);
    };
    menu.register(Cmd.find, (ctx) => ctx.docOpen && !ctx.sourceMode, () => openFind("file"));
    menu.register(
      Cmd.workspaceSearch,
      (ctx) => ctx.hasWorkspace,
      () => openFind("workspace"),
    );
    menu.register(Cmd.toggleSidebar, () => true, toggleSidebar);
    // 源码模式(30):Ctrl+/ 或「视图 → 源码模式」;勾选态由 App 侧 setChecked 同步
    menu.register(Cmd.sourceMode, (ctx) => ctx.docOpen, toggleSourceMode);
    // 06:专注/打字机(F8/F9);与源码模式互斥(置灰);勾选态由 App 侧同步
    const modeRule = (ctx: MenuContext) => ctx.docOpen && !ctx.sourceMode;
    menu.register(Cmd.focusMode, modeRule, toggleFocusMode);
    menu.register(Cmd.typewriterMode, modeRule, toggleTypewriterMode);
    // 06:全屏(F11)
    menu.register(Cmd.fullscreen, () => true, () => window.confidant.toggleFullscreen());
    // 设置(28):代码块换行/行号,勾选态由 App 侧经 setChecked 同步
    menu.register(Cmd.settingsCodeWrap, () => true, () => {
      toggleCodeWrap();
      setUiTick((t) => t + 1);
    });
    menu.register(Cmd.settingsCodeLineNumbers, () => true, () => {
      toggleCodeLineNumbers();
      setUiTick((t) => t + 1);
    });
    menu.register(Cmd.insertImage, (ctx) => ctx.docOpen && !ctx.sourceMode, () => void insertImageViaDialog());
    // 行内格式(07):与「格式」菜单同一引擎命令面;源码模式置灰(30)
    const runFormat = (fn: (e: Engine) => boolean): void => {
      const ed = engineRef.current;
      if (!ed) return;
      fn(ed);
      setUiTick((t) => t + 1);
    };
    const fmtRule = (ctx: MenuContext) => ctx.docOpen && !ctx.sourceMode;
    menu.register(Cmd.bold, fmtRule, () => runFormat((e) => e.toggleBold()));
    menu.register(Cmd.italic, fmtRule, () => runFormat((e) => e.toggleItalic()));
    menu.register(Cmd.strike, fmtRule, () => runFormat((e) => e.toggleStrike()));
    menu.register(Cmd.clearFormat, fmtRule, () => runFormat((e) => e.clearFormat()));
    menu.register(Cmd.link, fmtRule, () => setLinkRequest((r) => r + 1));
    // 导出/打印(19):当前文档渲染通道(与磁盘 mtime 无关)
    const runExport = (kind: "pdf" | "print"): void => {
      const doc = docRef.current;
      const ed = engineRef.current;
      if (!doc || !ed) return;
      void (async () => {
        const res = await window.confidant.printExport(kind, {
          notePath: doc.path,
          head: doc.head,
          bodyMd: ed.getMarkdown(),
        });
        if (!res.ok) {
          if (res.error.code !== "PRINT_CANCELED") {
            await window.confidant.infoDialog(`导出失败:${res.error.message}`);
          }
          return;
        }
        if (kind === "pdf" && res.value.pdfPath) {
          showNotice(`已导出 PDF:${basename(res.value.pdfPath)}`, {
            action: {
              label: "打开所在文件夹",
              run: () => void window.confidant.showItemInFolder(res.value.pdfPath!),
            },
          });
        }
      })();
    };
    menu.register(Cmd.exportPdf, (ctx) => ctx.docOpen && !ctx.sourceMode, () => runExport("pdf"));
    menu.register(Cmd.print, (ctx) => ctx.docOpen && !ctx.sourceMode, () => runExport("print"));
    // 块级段落命令(08):标题/正文/列表/引用/代码块/表格,表格内置灰
    const blockRule = (ctx: MenuContext) => ctx.docOpen && !ctx.inTable && !ctx.sourceMode;
    const runBlock = (kind: Parameters<Engine["setBlockKind"]>[0]): void => {
      const ed = engineRef.current;
      if (!ed) return;
      ed.setBlockKind(kind);
      setUiTick((t) => t + 1);
      refreshMenuContext();
    };
    menu.register(Cmd.heading1, blockRule, () => runBlock("heading1"));
    menu.register(Cmd.heading2, blockRule, () => runBlock("heading2"));
    menu.register(Cmd.heading3, blockRule, () => runBlock("heading3"));
    menu.register(Cmd.heading4, blockRule, () => runBlock("heading4"));
    menu.register(Cmd.heading5, blockRule, () => runBlock("heading5"));
    menu.register(Cmd.heading6, blockRule, () => runBlock("heading6"));
    menu.register(Cmd.paragraph, blockRule, () => runBlock("paragraph"));
    menu.register(Cmd.bulletList, blockRule, () => runBlock("bulletList"));
    menu.register(Cmd.orderedList, blockRule, () => runBlock("orderedList"));
    menu.register(Cmd.taskList, blockRule, () => runBlock("taskList"));
    menu.register(Cmd.quote, blockRule, () => runBlock("quote"));
    menu.register(Cmd.codeBlock, blockRule, () => runBlock("codeBlock"));
    menu.register(Cmd.insertTable, blockRule, () => {
      engineRef.current?.insertTable();
      setUiTick((t) => t + 1);
    });
    menu.register(Cmd.about, () => true, () => void window.confidant.showAbout());
    menu.register(Cmd.quit, () => true, () => window.confidant.closeWindow());
    // 主题三态(01):勾选态由 useAppTheme 经 setChecked 同步
    menu.register(Cmd.themeGithub, () => true, () => applyTheme("github"));
    menu.register(Cmd.themeNight, () => true, () => applyTheme("night"));
    menu.register(Cmd.themeNewsprint, () => true, () => applyTheme("newsprint"));
    // 文件操作命令(10):文件菜单(工作区/选中态驱动)
    const wsRule = (ctx: MenuContext) => ctx.hasWorkspace;
    const selRule = (ctx: MenuContext) => ctx.hasWorkspace && ctx.hasSelection;
    const treeSelectedAbs = (): { abs: string; rel: string; kind: "dir" | "md" } | null => {
      const ws = workspaceRef.current;
      const sel = selectedRef.current;
      if (!ws || !sel) return null;
      return { abs: wsJoin(ws.root, sel.rel), rel: sel.rel, kind: sel.kind };
    };
    menu.register(Cmd.newNote, wsRule, () => {
      const ws = workspaceRef.current;
      const sel = selectedRef.current;
      if (!ws) return;
      const dirRel = sel && sel.kind === "dir" ? sel.rel : "";
      void doCreateNote(dirRel);
    });
    menu.register(Cmd.newFolder, wsRule, () => {
      const sel = selectedRef.current;
      const dirRel = sel && sel.kind === "dir" ? sel.rel : "";
      setPrompt({ type: "new-folder", dirRel });
    });
    menu.register(Cmd.rename, selRule, () => {
      const sel = selectedRef.current;
      const ws = workspaceRef.current;
      if (!sel || !ws) return;
      setPrompt({ type: "rename", rel: sel.rel, name: sel.rel.split("/").pop()! });
    });
    menu.register(Cmd.delete, selRule, () => {
      const t = treeSelectedAbs();
      if (t) void doDeleteEntry({ relPath: t.rel, kind: t.kind });
    });
    menu.init();
    refreshMenuContext();
    // StrictMode 双挂载:清理退订,防命令事件双订阅(28 修复;此前所有菜单命令双触发)
    return () => {
      menu.dispose();
      if (menuRef.current === menu) menuRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
