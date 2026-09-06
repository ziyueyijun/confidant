// 应用视图层(04 形态):欢迎页 → 工作区(文件树侧栏 + 所见即所得编辑)。
// 保存语义经 save-pipeline(02);命令源与 native 菜单经 menu-bridge(03)。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import type { TreeEntry } from "@shared/ipc";
import { composeNoteText, parseNoteText } from "./editor/note-document";
import { createSavePipeline, type SaveState } from "./editor/save-pipeline";
import { classifyLink } from "./editor/link-target";
import { Cmd, createMenuBridge, type MenuContext } from "./menu/menu-bridge";
import {
  createOwnOpGuard,
  describeWriteError,
  EMPTY_SAVE_STATE,
  showFileOpError,
  toThrownError,
} from "./session/ops-shared";
import { Sidebar } from "./components/Sidebar";
import { FormatOverlay } from "./components/FormatOverlay";
import { TextPrompt } from "./components/TextPrompt";
import { SearchPanel } from "./components/SearchPanel";
import { TopBar } from "./components/TopBar";
import { Welcome } from "./components/Welcome";
import { ChangeNoticeToast, DocMissingBanner } from "./components/OverlayBanners";
import { EmptyWorkspaceGuidance, NotePickHint } from "./components/EmptyStates";
import { countMdInTree, relPathOf, wsJoin, type Workspace } from "./workspace/workspace";
import type { OpenNote } from "./session/types";
import { useAppTheme } from "./hooks/use-app-theme";
import { useSidebarLayout } from "./hooks/use-sidebar-layout";
import { useTreeExpansion } from "./hooks/use-tree-expansion";
import { useDocMissing } from "./hooks/use-doc-missing";
import { useEditorHost } from "./hooks/use-editor-host";
import { useFileOperations } from "./hooks/use-file-operations";


export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const docRef = useRef<OpenNote | null>(null);
  const pipelineRef = useRef<ReturnType<typeof createSavePipeline> | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const menuRef = useRef<ReturnType<typeof createMenuBridge> | null>(null);

  const [doc, setDoc] = useState<OpenNote | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(EMPTY_SAVE_STATE);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 引擎 UI 节拍:编辑/选区/命令后递增,驱动浮动条重算。 */
  const [uiTick, setUiTick] = useState(0);
  const [linkRequest, setLinkRequest] = useState(0);
  /** 查找面板(14/15):打开态、作用域与焦点请求。 */
  const [findOpen, setFindOpen] = useState(false);
  const [findScope, setFindScope] = useState<"file" | "workspace">("file");
  const [findFocus, setFindFocus] = useState(0);

  /** 正在编辑文件被外部删除(12:不静默重建,提供恢复/放弃)。 */
  const {
    docMissing,
    docMissingRef,
    markMissing,
    clearMissing,
    openMissingNoteBanner,
    recoverDeletedDoc,
    abandonDeletedDoc,
  } = useDocMissing({ docRef, engineRef, pipelineRef, setDoc, showError: showFileOpError });
  /** 自身文件操作产生的路径(其 watcher 回声不当作外部删除);时间盒抑制(12)。 */
  const ownOp = useMemo(() => createOwnOpGuard(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeEntry[] | null>(null);

  // ── 树展开集合(04/13):按工作区记忆 + 当前文档自动展开,toggle 即持久化(22) ──
  const { expanded, toggleDir } = useTreeExpansion(workspace, doc);

  // ── 外观(18)与侧栏布局(04):独立域抽为 hook(22) ──
  const { applyThemeMode } = useAppTheme(menuRef);
  const { sidebar, setWidth: setSidebarWidth, toggleSidebar, commitSidebar } = useSidebarLayout();

  // ── 保存管线(02) ──
  useEffect(() => {
    const pipeline = createSavePipeline(
      {
        async write() {
          const current = docRef.current;
          const engine = engineRef.current;
          if (!current || !engine) return;
          if (docMissingRef.current) return; // 文件已被外部删除:不静默重建(12)
          ownOp.markOwnOp(current.path); // 自身写盘回声抑制(1.5s 内 watcher 同名事件)
          const res = await window.confidant.writeTextFile(
            current.path,
            composeNoteText({ head: current.head, bodyMd: engine.getMarkdown() }),
          );
          if (!res.ok) throw toThrownError(res);
        },
      },
      { onState: (s) => setSaveState({ ...s }) },
    );
    pipelineRef.current = pipeline;
    return () => {
      pipeline.dispose();
      pipelineRef.current = null;
    };
  }, []);

  // ── 引擎上下文(03 点亮态;菜单注册/树交互/引擎回调共用,稳定 refs 版) ──
  const refreshMenuContext = useCallback(() => {
    const menu = menuRef.current;
    const engine = engineRef.current;
    if (!menu) return;
    menu.setContext({
      docOpen: !!docRef.current,
      canUndo: engine?.canUndo() ?? false,
      canRedo: engine?.canRedo() ?? false,
      inTable: engine?.isInsideTable() ?? false,
      hasWorkspace: !!workspaceRef.current,
      hasSelection: !!selectedRef.current,
    });
  }, []);

  /** 打开链接(16):web → 系统浏览器;工作区内 md → 应用内打开+锚点;其余本地 → 资源管理器。 */
  const openLinkTarget = useCallback(
    async (docPath: string, rawHref: string) => {
      const ws = workspaceRef.current;
      const target = classifyLink(docPath, ws?.root ?? null, rawHref);
      if (target.kind === "web") {
        await window.confidant.openExternal(target.hrefPath);
        return;
      }
      if (target.kind === "local") {
        if (target.hrefPath) await window.confidant.showItemInFolder(target.hrefPath);
        return;
      }
      // note:目标已被外部删除 → 12 横幅语义(不静默;可恢复重建/放弃)
      if (target.abs && !(await window.confidant.pathExists(target.abs))) {
        openMissingNoteBanner(target.abs);
        return;
      }
      // 切换/打开文件,再按锚点定位
      const cur = docRef.current;
      const sameFile = cur && cur.path.toLowerCase() === (target.abs ?? "").toLowerCase();
      const jump = (): void => {
        if (!target.anchor) return;
        const ed = engineRef.current;
        if (ed && !ed.jumpToHeading(target.anchor)) {
          // 无匹配标题:正常打开不定位(记录于 16 票)
        }
      };
      if (sameFile) {
        jump();
        return;
      }
      if (target.abs) await openPath(target.abs);
      jump();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── 编辑器宿主(02/05/06/09/16/17 事件面)抽 useEditorHost(22) ──
  const { engine } = useEditorHost({
    hostRef,
    docRef,
    engineRef,
    pipelineRef,
    refreshMenu: refreshMenuContext,
    openLink: openLinkTarget,
    bumpUi: () => setUiTick((t) => t + 1),
  });

  // ── 菜单桥(03) ──
  useEffect(() => {
    const menu = createMenuBridge();
    menuRef.current = menu;
    menu.register(Cmd.openFolder, () => true, () => void openFolderViaDialog());
    menu.register(Cmd.save, (ctx) => ctx.docOpen, () => void pipelineRef.current?.flush());
    menu.register(Cmd.undo, (ctx) => ctx.docOpen && ctx.canUndo, () => engineRef.current?.undo());
    menu.register(Cmd.redo, (ctx) => ctx.docOpen && ctx.canRedo, () => engineRef.current?.redo());
    // 查找(14/15):Ctrl+F 当前文件;Ctrl+Shift+F 全工作区
    const openFind = (scope: "file" | "workspace"): void => {
      setFindScope(scope);
      setFindOpen(true);
      setFindFocus((f) => f + 1);
    };
    menu.register(Cmd.find, (ctx) => ctx.docOpen, () => openFind("file"));
    menu.register(
      Cmd.workspaceSearch,
      (ctx) => ctx.hasWorkspace,
      () => openFind("workspace"),
    );
    menu.register(Cmd.toggleSidebar, () => !!workspaceRef.current, toggleSidebar);
    menu.register(Cmd.insertImage, (ctx) => ctx.docOpen, () => void insertImageViaDialog());
    // 行内格式(07):与浮动工具条同一引擎命令面
    const runFormat = (fn: (e: Engine) => boolean): void => {
      const ed = engineRef.current;
      if (!ed) return;
      fn(ed);
      setUiTick((t) => t + 1);
    };
    menu.register(Cmd.bold, (ctx) => ctx.docOpen, () => runFormat((e) => e.toggleBold()));
    menu.register(Cmd.italic, (ctx) => ctx.docOpen, () => runFormat((e) => e.toggleItalic()));
    menu.register(Cmd.strike, (ctx) => ctx.docOpen, () => runFormat((e) => e.toggleStrike()));
    menu.register(Cmd.clearFormat, (ctx) => ctx.docOpen, () => runFormat((e) => e.clearFormat()));
    menu.register(Cmd.link, (ctx) => ctx.docOpen, () => setLinkRequest((r) => r + 1));
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
    menu.register(Cmd.exportPdf, (ctx) => ctx.docOpen, () => runExport("pdf"));
    menu.register(Cmd.print, (ctx) => ctx.docOpen, () => runExport("print"));
    // 块级段落命令(08):标题/正文/列表/引用/代码块/表格,表格内置灰
    const blockRule = (ctx: MenuContext) => ctx.docOpen && !ctx.inTable;
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
    // 外观三态(18)
    menu.register(Cmd.themeSystem, () => true, () => applyThemeMode("system"));
    menu.register(Cmd.themeLight, () => true, () => applyThemeMode("light"));
    menu.register(Cmd.themeDark, () => true, () => applyThemeMode("dark"));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 主进程回调订阅 ──
  useEffect(() => {
    return window.confidant.onFlushRequest(() => {
      const p = pipelineRef.current;
      const done = p ? p.flush() : Promise.resolve();
      void done.finally(() => window.confidant.flushAck());
    });
  }, []);

  // ── 工作区外部变更处置(12):树刷新 + 当前文件删除/改名横幅 + 内容变更静默重载 ──
  const reloadCurrentFromDisk = useCallback(async () => {
    const cur = docRef.current;
    if (!cur) return;
    const res = await window.confidant.readTextFile(cur.path);
    if (!res.ok) return; // 读取失败(可能刚被删):交给 unlink 事件横幅
    const docModel = parseNoteText(res.value);
    const next = { ...cur, head: docModel.head };
    docRef.current = next;
    setDoc(next);
    engineRef.current?.loadMarkdown(docModel.bodyMd);
    pipelineRef.current?.resetClean();
  }, []);

  useEffect(() => {
    return window.confidant.onWorkspaceTree(({ tree: nextTree, events }) => {
      setTree(nextTree);
      const cur = docRef.current;
      if (!cur) return;
      const norm = (p: string): string => p.replace(/\\/g, "/");
      const curPath = norm(cur.path);
      for (const ev of events) {
        if (ownOp.isOwnOpRecent(ev.path)) continue;
        if (norm(ev.path).toLowerCase() !== curPath.toLowerCase()) continue;
        if (ev.type === "unlink") {
          // 外部删除/改名:提示条(恢复重建/放弃),不静默重建
          markMissing();
        } else if (ev.type === "change") {
          // 内容被外部修改:不弹窗;无本地未保存输入时重载为磁盘内容
          if (!pipelineRef.current?.isDirty()) void reloadCurrentFromDisk();
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部删除处置(12)与缺文件横幅逻辑归 useDocMissing(22):openMissingNoteBanner/recover/abandon。

  useEffect(() => {
    return window.confidant.onOpenFile((path) => void openPath(path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return window.confidant.onOpenWorkspace((path) => void openWorkspace(path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // 树展开记忆相关逻辑在 useTreeExpansion(22);工作区切换记忆随 workspace 恢复。

  // ── 工作区 ──
  const openFolderViaDialog = useCallback(async () => {
    const path = await window.confidant.pickFolderDialog();
    if (path) await openWorkspace(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openWorkspace = useCallback(async (root: string) => {
    // 切换前先把当前编辑内容落盘(02 语义)
    if (docRef.current) await pipelineRef.current?.flush();
    const res = await window.confidant.openWorkspace(root);
    if (!res.ok) {
      setLoadError(`无法打开文件夹:${res.error.message}`);
      return;
    }
    const ws: Workspace = {
      root,
      name: root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? root,
    };
    workspaceRef.current = ws;
    setWorkspace(ws);
    setTree(res.value);
    // 工作区切换:关闭旧文档编辑态(内容已 flush 落盘)
    docRef.current = null;
    setDoc(null);
    pipelineRef.current?.resetClean();
    setLoadError(null);
    document.title = `${ws.name} · confidant`;
  }, []);

  const closeWorkspace = useCallback(() => {
    docRef.current = null;
    setDoc(null);
    pipelineRef.current?.resetClean();
    workspaceRef.current = null;
    setWorkspace(null);
    setTree(null);
    void window.confidant.closeWorkspace();
    document.title = "confidant · 知己笔记";
  }, []);

  // ── 打开/切换文档(先 flush 旧文档 → 装载新文档) ──
  const openPath = useCallback(async (path: string) => {
    if (docRef.current && docRef.current.path.toLowerCase() === path.toLowerCase()) return;
    if (docRef.current) await pipelineRef.current?.flush();
    const res = await window.confidant.readTextFile(path);
    if (!res.ok) {
      setLoadError(res.error.code === "ENOENT" ? "文件不存在或已被移动。" : `打开失败:${res.error.message}`);
      return;
    }
    const docModel = parseNoteText(res.value);
    const next: OpenNote = { path, name: basename(path), head: docModel.head };
    docRef.current = next;
    setDoc(next);
    setLoadError(null);
    engineRef.current?.loadMarkdown(docModel.bodyMd);
    pipelineRef.current?.resetClean();
    document.title = `${next.name} · confidant`;
    window.confidant.noteOpened(path);
    setUiTick((t) => t + 1);
    engineRef.current?.clearSearchHighlights(); // 切换文件高亮不残留(14)
    setFindOpen(false);
  }, []);

  const openRel = useCallback(
    (rel: string) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      void openPath(wsJoin(ws.root, rel));
    },
    [openPath],
  );

  // ═══ 文件操作编排(10/11/12)+ 树交互 + 变更通知条:useFileOperations(22) ═══
  const {
    selectedRef,
    prompt,
    setPrompt,
    notice,
    showNotice,
    dismissNotice,
    promptValidate,
    doDeleteEntry,
    doRenameEntry,
    doCreateNote,
    doCreateFolder,
    onTreeRowContext,
    onTreeEmptyContext,
    onDragStartEntry,
    onDropEntry,
    insertImageViaDialog,
  } = useFileOperations({
    workspaceRef,
    docRef,
    engineRef,
    pipelineRef,
    setDoc,
    openPath,
    openRel,
    refreshMenuContext,
    markOwnOp: ownOp.markOwnOp,
    clearMissing,
  });

  // 当前文件自动展开与 toggle 持久化归 useTreeExpansion(22)。  // 当前文件自动展开与 toggle 持久化归 useTreeExpansion(22)。

  // ── 最近打开(13):欢迎页列表 + 菜单动态子项同一数据源 ──
  const [recentFolders, setRecentFolders] = useState<Array<{ path: string; name: string }>>([]);
  useEffect(() => {
    void (async () => {
      const list = (await window.confidant.stateGet("recentFolders")) as
        | Array<{ path: string; name: string }>
        | null;
      setRecentFolders(list ?? []);
    })();
  }, []);
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const recents = recentFolders.map((r) => ({ path: r.path, name: r.name }));
    menu.rebuildRecent(recents);
    recents.forEach((r, i) => {
      menu.register(`recent-${i}`, () => true, () => void openWorkspace(r.path));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentFolders, openWorkspace]);

  // ── 启动恢复(13):有历史 → 恢复工作区与最后文件;文件缺失 → 12 横幅语义 ──
  const restoreAttempted = useRef(false);
  const restoreRootRef = useRef<string | null>(null);
  const restoreFileRef = useRef<string | null>(null);
  const restoreRetried = useRef(false);
  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    void (async () => {
      const last = (await window.confidant.stateGet("lastSession")) as {
        workspace: string | null;
        file: string | null;
      } | null;
      if (!last?.workspace) return; // 无历史 → 欢迎页
      restoreRootRef.current = last.workspace;
      restoreFileRef.current = last.file ?? null;
      const res = await window.confidant.openWorkspace(last.workspace);
      if (!res.ok) {
        setLoadError(`恢复工作区失败:${res.error.message}`);
        return;
      }
      if (!last.file) return;
      const fileRes = await window.confidant.readTextFile(last.file);
      if (!fileRes.ok) {
        // 最后文件已不存在:按 12 处置(横幅,不静默)
        openMissingNoteBanner(last.file);
        return;
      }
      await openPath(last.file);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 恢复自愈:工作区状态未落到预期根(或缺失)且已有文档上下文 → 补开工作区并重开文件
  useEffect(() => {
    const root = restoreRootRef.current;
    if (!root || restoreRetried.current) return;
    const wsOk = workspace && workspace.root.toLowerCase() === root.toLowerCase();
    if (wsOk) return;
    if (!doc && workspace) return; // 无文档且已开其他工作区:尊重用户状态
    restoreRetried.current = true;
    void openWorkspace(root).then(() => {
      const file = restoreFileRef.current;
      if (file) void openPath(file);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, workspace]);

  // 空态/计数
  const mdCount = useMemo(() => (tree ? countMdInTree(tree) : 0), [tree]);

  const engineHost = <div ref={hostRef} className="editor-prose" data-testid="editor-prose" />;

  const activeRel = useMemo(
    () => (workspace && doc ? relPathOf(workspace.root, doc.path) : null),
    [workspace, doc],
  );

  const errorText = saveState.error ? describeWriteError(saveState.error) : loadError;
  const statusText = saveState.saving
    ? "保存中…"
    : errorText
      ? errorText
      : saveState.savedAt
        ? `已保存 ${new Date(saveState.savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`
        : saveState.dirty
          ? "有未保存的修改"
          : doc
            ? "已打开"
            : workspace
              ? ""
              : "";

  const showEditorArea = !!doc;
  const guidanceVisible = !!workspace && !doc && mdCount === 0;

  return (
    <div style={{ height: "100%", position: "relative", display: "flex", flexDirection: "column" }}
    >
      <TopBar
        workspace={workspace}
        doc={doc}
        sidebarVisible={sidebar.visible}
        onToggleSidebar={toggleSidebar}
        statusText={statusText}
        errorText={errorText}
        dirty={saveState.dirty}
        saving={saveState.saving}
        onSave={() => void pipelineRef.current?.flush()}
      />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {workspace && sidebar.visible && (
          <Sidebar
            workspaceName={workspace.name}
            tree={tree}
            expanded={expanded}
            activeRel={activeRel}
            width={sidebar.width}
            onToggleDir={toggleDir}
            onOpenFile={openRel}
            onWidthChange={setSidebarWidth}
            onWidthDragEnd={() => commitSidebar(sidebar)}
            onRowContext={(e, entry) => void onTreeRowContext(e, entry)}
            onEmptyContext={(e) => void onTreeEmptyContext(e)}
            onDragStartEntry={onDragStartEntry}
            onDropEntry={onDropEntry}
            onSearchBoxClick={() => {
              if (!docRef.current) return;
              setFindScope("file");
              setFindOpen(true);
              setFindFocus((f) => f + 1);
            }}
          />
        )}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {doc?.head && (
            <div className="fm-block" data-testid="fm-block">
              <pre>{doc.head.replace(/\n$/, "")}</pre>
            </div>
          )}
          <div
            className="editor-scroll"
            style={{ display: showEditorArea ? undefined : "none" }}
            data-testid="editor-scroll"
          >
            {engineHost}
          </div>
          {!workspace && (
            <Welcome
              recentFolders={recentFolders}
              onOpenFolder={() => void openFolderViaDialog()}
              onOpenRecent={(p) => void openWorkspace(p)}
            />
          )}
          {guidanceVisible && <EmptyWorkspaceGuidance />}
          {!doc && workspace && mdCount > 0 && <NotePickHint />}
        </div>
      </div>
      {/* 浮动格式工具条与链接编辑(07) */}
      <FormatOverlay engine={engine} tick={uiTick} openLinkRequest={linkRequest} />
      {/* 查找面板(14/15) */}
      {findOpen && doc && (
        <SearchPanel
          engine={engine}
          focusRequest={findFocus}
          initialScope={findScope}
          workspaceRoot={workspace?.root ?? null}
          onOpenWorkspaceHit={(absPath, q) => {
            void (async () => {
              await openPath(absPath);
              const ed = engineRef.current;
              const found = ed?.findInDoc(q);
              if (ed && found && found.length > 0) {
                ed.setSearchHighlights(found, 0);
                ed.revealRange(found[0]!.from, found[0]!.to);
              }
              // openPath 会关面板;命中跳转后保持工作区搜索可用
              setFindOpen(true);
            })();
          }}
          onClose={() => {
            engine?.clearSearchHighlights();
            setFindOpen(false);
          }}
        />
      )}
      {/* 文件被外部删除横幅(12) */}
      {docMissing && doc && (
        <DocMissingBanner
          onRecover={() => void recoverDeletedDoc()}
          onAbandon={abandonDeletedDoc}
        />
      )}
      {/* 变更通知条(10/11:单步撤销) */}
      {notice && (
        <ChangeNoticeToast
          notice={notice}
          onUndo={() => {
            notice.undo?.();
            dismissNotice();
          }}
          onAction={() => {
            notice.action?.run();
            dismissNotice();
          }}
          onDismiss={dismissNotice}
        />
      )}
      {/* 输入对话框(重命名/新建文件夹,10) */}
      {prompt?.type === "rename" && (
        <TextPrompt
          title="重命名"
          initial={prompt.name}
          okLabel="重命名"
          validate={promptValidate}
          onSubmit={(v) => {
            if (v === prompt.name) {
              setPrompt(null);
              return;
            }
            void doRenameEntry(prompt.rel, v);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
      {prompt?.type === "new-folder" && (
        <TextPrompt
          title="新建文件夹"
          okLabel="创建"
          validate={promptValidate}
          onSubmit={(v) => {
            void doCreateFolder(prompt.dirRel, v);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </div>
  );
}
