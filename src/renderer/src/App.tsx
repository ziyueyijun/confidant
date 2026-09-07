// 应用视图层(04 形态):欢迎页 → 工作区(文件树侧栏 + 所见即所得编辑)。
// 保存语义经 save-pipeline(02);命令源与 native 菜单经 menu-bridge(03)。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import type { TreeEntry } from "@shared/ipc";
import { composeNoteText, parseNoteText } from "./editor/note-document";
import { createSavePipeline } from "./editor/save-pipeline";
import { classifyLink } from "./editor/link-target";
import { Cmd, createMenuBridge, type MenuContext } from "./menu/menu-bridge";
import {
  createOwnOpGuard,
  describeWriteError,
  showFileOpError,
  toThrownError,
} from "./session/ops-shared";
import { Sidebar, SidebarEmpty } from "./components/Sidebar";
import { LinkPanel } from "./components/LinkPanel";
import { TextPrompt } from "./components/TextPrompt";
import { SearchPanel } from "./components/SearchPanel";
import { Welcome } from "./components/Welcome";
import { CodeBlockOverlay } from "./components/CodeBlockOverlay";
import { ChangeNoticeToast, DocMissingBanner } from "./components/OverlayBanners";
import { Footer } from "./components/Footer";
import { FormatToolbar } from "./components/FormatToolbar";
import { EmptyWorkspaceGuidance, NotePickHint } from "./components/EmptyStates";
import { countMdInTree, relPathOf, wsJoin, type Workspace } from "./workspace/workspace";
import type { OpenNote } from "./session/types";
import { useAppTheme } from "./hooks/use-app-theme";
import { useSidebarLayout } from "./hooks/use-sidebar-layout";
import { useEditorSettings } from "./hooks/use-editor-settings";
import { usePreferences } from "./hooks/use-preferences";
import { useTreeExpansion } from "./hooks/use-tree-expansion";
import { useDocMissing } from "./hooks/use-doc-missing";
import { useEditorHost } from "./hooks/use-editor-host";
import { useFileOperations } from "./hooks/use-file-operations";
import { useMenuBridgeRegistration } from "./hooks/use-menu-bridge-registration";
import { useRecentFolders } from "./hooks/use-recent-folders";
import { useStartupRecovery } from "./hooks/use-startup-recovery";
import { useOutline } from "./hooks/use-outline";
import type { OutlineItem } from "./editor/outline";


export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  /** 编辑区滚动容器(03:大纲滚动跟随监听)。 */
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const docRef = useRef<OpenNote | null>(null);
  const pipelineRef = useRef<ReturnType<typeof createSavePipeline> | null>(null);
  const workspaceRef = useRef<Workspace | null>(null);
  const menuRef = useRef<ReturnType<typeof createMenuBridge> | null>(null);

  const [doc, setDoc] = useState<OpenNote | null>(null);
  /** 打开/切换工作区或文档失败(界面不再展示,仅记录日志)。 */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 引擎 UI 节拍:编辑/选区/命令后递增,驱动浮动条重算与派生视图(语言标签/大纲)。 */
  const [uiTick, setUiTick] = useState(0);
  const [linkRequest, setLinkRequest] = useState(0);
  /** 源码模式(30):全屏原始 Markdown 文本编辑;文本区为磁盘字节级真相源。 */
  const [sourceMode, setSourceMode] = useState(false);
  const sourceModeRef = useRef(false);
  /** 视图模式(06):专注/打字机——ref 为真相源(互斥/恢复用),state 驱动渲染。 */
  const viewModesRef = useRef({ focus: false, typewriter: false });
  const [focusMode, setFocusMode] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  /** 进入源码前记住的专注/打字机态(退出源码时恢复勾选态,06)。 */
  const sourceModesRef = useRef({ focus: false, typewriter: false });
  const setMode = useCallback((kind: "focus" | "typewriter", v: boolean) => {
    viewModesRef.current[kind] = v;
    if (kind === "focus") setFocusMode(v);
    else setTypewriterMode(v);
  }, []);
  const toggleMode = useCallback(
    (kind: "focus" | "typewriter") => setMode(kind, !viewModesRef.current[kind]),
    [setMode],
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 查找面板(14/15):打开态、作用域与焦点请求。 */
  const [findOpen, setFindOpen] = useState(false);
  const [findScope, setFindScope] = useState<"file" | "workspace">("file");
  const [findFocus, setFindFocus] = useState(0);
  /** 工作区命中跳转后的文件内高亮(08:交面板应用,见 SearchPanel)。 */
  const [wsJump, setWsJump] = useState<{ ranges: Array<{ from: number; to: number }>; active: number } | null>(null);
  /** 编辑区焦点环(31/修):仅键盘(Tab)进入时显示——Blink 对 contenteditable
      的 :focus-visible 恒真(鼠标点击也匹配),纯 CSS 无法区分输入设备。 */
  const [focusViaKeyboard, setFocusViaKeyboard] = useState(false);

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

  // ── 外观(01)与侧栏布局(04):独立域抽为 hook(22) ──
  const { applyTheme } = useAppTheme(menuRef);
  const { sidebar, setWidth: setSidebarWidth, toggleSidebar, commitSidebar } = useSidebarLayout();
  // ── 编辑器设置(28):代码块换行/行号,持久化 + 勾选态 ──
  const { settings, toggleCodeWrap, toggleCodeLineNumbers } = useEditorSettings();
  // ── 偏好设置(07):外观「显示工具栏」开关(主窗口只读,改动经偏好设置窗口) ──
  const { preferences } = usePreferences();

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
      { onState: (s) => {
        // 顶栏移除后写盘失败不再展示,仅记录日志(冒烟经 console 通道捕获)
        if (s.error) console.error(`[save] ${describeWriteError(s.error)}`);
      } },
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
      sourceMode: sourceModeRef.current,
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

  // ── 大纲面板(03):doc 防抖重建 + 滚动跟随高亮 ──
  const outline = useOutline(engine, uiTick, editorScrollRef);
  const jumpToOutline = useCallback(
    (item: OutlineItem) => {
      const ed = engineRef.current;
      if (!ed) return;
      // 滚动定位 + 光标置入标题处 + 编辑器聚焦(setSelection 已 focus)
      ed.setSelection(item.pos + 1, item.pos + 1);
      ed.revealRange(item.pos + 1, item.pos + 1);
    },
    [],
  );





  // ── 源码模式(30):文本区 = 完整文件字节(含 front matter),保存直写不经引擎 ──
  const writeSourceText = useCallback(async (): Promise<void> => {
    const ta = textareaRef.current;
    const cur = docRef.current;
    if (!ta || !cur) return;
    if (docMissingRef.current) return; // 文件已被外部删除:不静默重建(12)
    ownOp.markOwnOp(cur.path);
    const res = await window.confidant.writeTextFile(cur.path, ta.value);
    if (!res.ok) console.error(`[source] save failed: ${res.error.code} ${res.error.message}`);
  }, []);
  const scheduleSourceSave = useCallback((): void => {
    if (sourceSaveTimer.current) clearTimeout(sourceSaveTimer.current);
    sourceSaveTimer.current = setTimeout(() => void writeSourceText(), 800);
  }, [writeSourceText]);
  const enterSourceMode = useCallback((): void => {
    const cur = docRef.current;
    const ed = engineRef.current;
    if (!cur || !ed) return;
    sourceModeRef.current = true;
    setSourceMode(true);
    refreshMenuContext();
  }, [refreshMenuContext]);
  const exitSourceMode = useCallback((): void => {
    const cur = docRef.current;
    const ta = textareaRef.current;
    if (!cur || !ta) return;
    // 文本区全文 → 拆头/正文 → 引擎装载;头随解析更新;未落盘编辑由保存管线接管
    const model = parseNoteText(ta.value);
    docRef.current = { ...cur, head: model.head };
    setDoc((prev) => (prev ? { ...prev, head: model.head } : prev));
    engineRef.current?.loadMarkdown(model.bodyMd);
    pipelineRef.current?.notifyEdit();
    sourceModeRef.current = false;
    setSourceMode(false);
    refreshMenuContext();
  }, [refreshMenuContext]);
  const toggleSourceMode = useCallback((): void => {
    if (sourceModeRef.current) {
      // 06:退出源码恢复进入前的专注/打字机勾选态
      setMode("focus", sourceModesRef.current.focus);
      setMode("typewriter", sourceModesRef.current.typewriter);
      exitSourceMode();
    } else {
      // 06:进入源码自动退出专注/打字机(记住原态,退出恢复)
      sourceModesRef.current = { ...viewModesRef.current };
      setMode("focus", false);
      setMode("typewriter", false);
      enterSourceMode();
    }
  }, [enterSourceMode, exitSourceMode, setMode]);
  const saveCurrent = useCallback(async (): Promise<void> => {
    if (sourceModeRef.current) await writeSourceText();
    else await pipelineRef.current?.flush();
  }, [writeSourceText]);
  // 文本区内容:进入时以引擎序列化填充(头字节原样 + 正文引擎规范化,即保存口径)
  useEffect(() => {
    if (!sourceMode) return;
    const cur = docRef.current;
    const ed = engineRef.current;
    if (!cur || !ed || !textareaRef.current) return;
    textareaRef.current.value = composeNoteText({ head: cur.head, bodyMd: ed.getMarkdown() });
    textareaRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode]);

  // ── 主进程回调订阅 ──
  useEffect(() => {
    return window.confidant.onFlushRequest(() => {
      if (sourceModeRef.current) {
        // 源码模式:flush 直写文本区原文(关窗数据保护口径不变,30)
        const done = writeSourceText();
        void done.finally(() => window.confidant.flushAck());
        return;
      }
      const p = pipelineRef.current;
      const done = p ? p.flush() : Promise.resolve();
      void done.finally(() => window.confidant.flushAck());
    });
  }, [writeSourceText]);

  // ── 编辑器设置同步(28):行号 → 引擎装饰;换行/行号 → host 数据属性驱动 CSS;菜单勾选态 ──
  useEffect(() => {
    engineRef.current?.setCodeBlockOptions({ lineNumbers: settings.codeLineNumbers });
  }, [settings.codeLineNumbers]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.dataset.codeWrap = settings.codeWrap ? "on" : "off";
    host.dataset.codeLines = settings.codeLineNumbers ? "on" : "off";
  }, [settings.codeWrap, settings.codeLineNumbers]);
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    menu.setChecked(Cmd.settingsCodeWrap, settings.codeWrap);
    menu.setChecked(Cmd.settingsCodeLineNumbers, settings.codeLineNumbers);
    menu.setChecked(Cmd.sourceMode, sourceMode);
    menu.setChecked(Cmd.focusMode, focusMode);
    menu.setChecked(Cmd.typewriterMode, typewriterMode);
  }, [settings, sourceMode, focusMode, typewriterMode, engine]);

  // ── 工作区外部变更处置(12):树刷新 + 当前文件删除/改名横幅 + 内容变更静默重载 ──
  const reloadCurrentFromDisk = useCallback(async () => {
    const cur = docRef.current;
    if (!cur) return;
    const res = await window.confidant.readTextFile(cur.path);
    if (!res.ok) return; // 读取失败(可能刚被删):交给 unlink 事件横幅
    if (sourceModeRef.current) {
      // 源码模式:先把文本区内容落盘(用户编辑优先),再以磁盘刷新文本区与头
      await writeSourceText();
      const again = await window.confidant.readTextFile(cur.path);
      if (!again.ok) return;
      const m = parseNoteText(again.value);
      if (textareaRef.current) textareaRef.current.value = again.value;
      docRef.current = { ...cur, head: m.head };
      setDoc((prev) => (prev ? { ...prev, head: m.head } : prev));
      return;
    }
    const docModel = parseNoteText(res.value);
    const next = { ...cur, head: docModel.head };
    docRef.current = next;
    setDoc(next);
    engineRef.current?.loadMarkdown(docModel.bodyMd);
    pipelineRef.current?.resetClean();
  }, [writeSourceText]);

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
    sourceModeRef.current = false; // 切工作区复位为所见即所得(30)
    setSourceMode(false);
    document.title = `${ws.name} · confidant`;
  }, []);

  const closeWorkspace = useCallback(() => {
    docRef.current = null;
    setDoc(null);
    pipelineRef.current?.resetClean();
    workspaceRef.current = null;
    setWorkspace(null);
    setTree(null);
    sourceModeRef.current = false; // 关工作区复位为所见即所得(30)
    setSourceMode(false);
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
    sourceModeRef.current = false; // 切文件复位为所见即所得(30)
    setSourceMode(false);
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

  // ── 菜单桥接线(03):命令注册表 → useMenuBridgeRegistration(22) ──
  useMenuBridgeRegistration({
    menuRef, docRef, engineRef, pipelineRef, workspaceRef, selectedRef, sourceModeRef,
    saveCurrent, toggleSourceMode,
    toggleFocusMode: () => toggleMode("focus"),
    toggleTypewriterMode: () => toggleMode("typewriter"),
    setFindOpen, setFindScope, setFindFocus, setLinkRequest, setUiTick,
    toggleSidebar, toggleCodeWrap, toggleCodeLineNumbers, insertImageViaDialog,
    applyTheme, openFolderViaDialog,
    doCreateNote, doDeleteEntry, setPrompt, showNotice, refreshMenuContext,
  });

  // 当前文件自动展开与 toggle 持久化归 useTreeExpansion(22)。

  // ── 最近打开(13/27):「文件 → 最近打开」菜单动态子项数据源(欢迎页不再陈列) ──
  useRecentFolders({ menuRef, openWorkspace });

  // ── 启动恢复(13) → useStartupRecovery(22) ──
  useStartupRecovery(workspace, doc, { openWorkspace, openPath, openMissingNoteBanner, setLoadError });

  // 空态/计数
  const mdCount = useMemo(() => (tree ? countMdInTree(tree) : 0), [tree]);

  // Tab 键按下即标记键盘焦点(document 捕获;按键后焦点才落入编辑区,
  // host 自身捕获不到外部按键)。鼠标按下/失焦均清除标记。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Tab") setFocusViaKeyboard(true);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const engineHost = (
    <div
      ref={hostRef}
      className={`editor-prose${focusMode ? " focus-mode" : ""}${typewriterMode ? " typewriter-mode" : ""}`}
      data-testid="editor-prose"
      data-keyboard-focus={focusViaKeyboard}
      onMouseDownCapture={() => setFocusViaKeyboard(false)}
      onBlur={() => setFocusViaKeyboard(false)}
    />
  );

  const activeRel = useMemo(
    () => (workspace && doc ? relPathOf(workspace.root, doc.path) : null),
    [workspace, doc],
  );

  // 打开/切换失败不再展示(顶栏已移除):loadError 变化仅记录日志
  useEffect(() => {
    if (loadError) console.error(`[load] ${loadError}`);
  }, [loadError]);

  const showEditorArea = !!doc;
  const guidanceVisible = !!workspace && !doc && mdCount === 0;

  return (
    <div style={{ height: "100%", position: "relative", display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {sidebar.visible &&
          (workspace ? (
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
              outlineItems={outline.items}
              outlineActivePos={outline.activePos}
              outlineDisabled={sourceMode}
              onOutlineJump={jumpToOutline}
              workspaceRoot={workspace.root}
              onOpenWorkspaceHit={(absPath, q) => {
                // 反馈轮 01:侧边栏内容命中打开并定位(不经顶部条面板,直接高亮首个命中)
                void (async () => {
                  await openPath(absPath);
                  const ed = engineRef.current;
                  const found = ed?.findInDoc(q) ?? [];
                  if (ed && found.length > 0) {
                    ed.setSearchHighlights(found, 0);
                    ed.revealRange(found[0]!.from, found[0]!.to);
                  }
                })();
              }}
            />
          ) : (
            // 27:无工作区时侧栏以空态框体呈现(开关可点、宽度记忆保持)
            <SidebarEmpty width={sidebar.width} />
          ))}
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
            ref={editorScrollRef}
            // 30:源码模式时隐藏但保持挂载(引擎 DOM 不卸载,切回即恢复)
            style={{ display: sourceMode || !showEditorArea ? "none" : undefined }}
            data-testid="editor-scroll"
          >
            {engineHost}
          </div>
          {/* 源码模式(30):全文件原始 Markdown 文本区,保存直写字节 */}
          {sourceMode && doc && (
            <textarea
              ref={textareaRef}
              data-testid="source-editor"
              className="source-editor"
              spellCheck={false}
              onChange={scheduleSourceSave}
            />
          )}
          {/* 欢迎页(27 纯空态):仅当既无工作区也无文档(直开文件路径下避免覆盖编辑区,26) */}
          {!workspace && !doc && <Welcome />}
          {guidanceVisible && <EmptyWorkspaceGuidance />}
          {!doc && workspace && mdCount > 0 && <NotePickHint />}
        </div>
      </div>
      {/* 链接面板(29):格式 → 链接 / Ctrl+K;原浮动工具条已移除 */}
      <LinkPanel engine={engine} openLinkRequest={linkRequest} />
      {/* 代码块复制按钮(28):悬停编辑区代码块时浮现 */}
      <CodeBlockOverlay engine={engine} />
      {/* 查找面板(14/15) */}
      {findOpen && doc && (
        <SearchPanel
          engine={engine}
          focusRequest={findFocus}
          initialScope={findScope}
          workspaceRoot={workspace?.root ?? null}
          jump={wsJump}
          onOpenWorkspaceHit={(absPath, q) => {
            void (async () => {
              await openPath(absPath);
              const ed = engineRef.current;
              const found = ed?.findInDoc(q) ?? [];
              setWsJump(found.length > 0 ? { ranges: found, active: 0 } : null);
              setFindOpen(true);
            })();
          }}
          onClose={() => {
            engine?.clearSearchHighlights();
            setFindOpen(false);
            setWsJump(null);
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
      {/* 页脚状态条(04):字数/段落类型/模式按钮(06 接线) */}
      <Footer
        engine={engine}
        tick={uiTick}
        hasDoc={!!doc}
        focusMode={focusMode}
        typewriterMode={typewriterMode}
        onToggleFocus={() => toggleMode("focus")}
        onToggleTypewriter={() => toggleMode("typewriter")}
      />
      {/* 底部悬浮格式工具栏(07):偏好设置「显示工具栏」开启且非源码模式时显示 */}
      {preferences.showToolbar && !sourceMode && doc && (
        <FormatToolbar
          engine={engine}
          tick={uiTick}
          onLink={() => setLinkRequest((r) => r + 1)}
          onInsertImage={() => void insertImageViaDialog()}
          bump={() => setUiTick((t) => t + 1)}
        />
      )}
    </div>
  );
}
