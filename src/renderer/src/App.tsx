// 应用视图层(04 形态):欢迎页 → 工作区(文件树侧栏 + 所见即所得编辑)。
// 保存语义经 save-pipeline(02);命令源与 native 菜单经 menu-bridge(03)。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { createEngine, type Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import type { TreeEntry } from "@shared/ipc";
import { composeNoteText, parseNoteText } from "./editor/note-document";
import { createSavePipeline, type SaveState } from "./editor/save-pipeline";
import { landClipboardImage, landImageFile, looksLikeImageFile } from "./editor/image-insert";
import { isRemoteSrc, resolveImageAbsPath, resolveImageSourceUrl } from "./editor/image-source";
import { classifyLink } from "./editor/link-target";
import { sanitizePasteHtml } from "./editor/html-sanitize";
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
import { countMdInTree, dirAncestorsOf, relPathOf, wsJoin, type Workspace } from "./workspace/workspace";
import type { OpenNote } from "./session/types";
import { useAppTheme } from "./hooks/use-app-theme";
import { useSidebarLayout } from "./hooks/use-sidebar-layout";


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
  const [engine, setEngine] = useState<Engine | null>(null);

  // ── 文件操作(10/11/12) ──
  /** 树内选中项(重命名/删除等菜单命令的对象;右键/点击行设置)。 */
  const selectedRef = useRef<{ rel: string; kind: "dir" | "md" } | null>(null);
  const [selected, setSelected] = useState<{ rel: string; kind: "dir" | "md" } | null>(null);
  const [prompt, setPrompt] = useState<
    | { type: "rename"; rel: string; name: string }
    | { type: "new-folder"; dirRel: string }
    | null
  >(null);
  /** 变更通知条(单步撤销/动作按钮;最近一次操作)。 */
  const [notice, setNotice] = useState<{
    id: number;
    label: string;
    undo?: () => void;
    action?: { label: string; run: () => void };
  } | null>(null);
  /** 正在编辑文件被外部删除(12:不静默重建,提供恢复/放弃)。 */
  const [docMissing, setDocMissing] = useState(false);
  const docMissingRef = useRef(false);
  /** 自身文件操作产生的路径(其 watcher 回声不当作外部删除);时间盒抑制(12)。 */
  const ownOp = useMemo(() => createOwnOpGuard(), []);
  const promptValidate = (v: string): string | null => {
    if (!v.trim()) return "名称不能为空";
    if (/[\\/:*?"<>|]/.test(v)) return "名称不能包含 \\ / : * ? \" < > | 字符";
    return null;
  };

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

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

  // ── 引擎 + IME 门控(02) + 图片粘贴/拖入落盘(05) ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = createEngine(
      host,
      {
        onUpdate: () => {
          if (docRef.current) pipelineRef.current?.notifyEdit();
          refreshMenuContext();
          setUiTick((t) => t + 1);
        },
        onSelectionChange: () => {
          refreshMenuContext();
          setUiTick((t) => t + 1);
        },
        onBlur: () => setUiTick((t) => t + 1),
        onLinkClick: (info, modifiers) => {
          const doc = docRef.current;
          if (!doc) return;
          if (modifiers.ctrl) void openLinkTarget(doc.path, info.href);
        },
      },
      {
        // 图片显示:引用按当前文档目录解析(远程不渲染;网络图裁决出)
        resolveImageUrl: (raw) => {
          const doc = docRef.current;
          if (!doc) return "";
          return resolveImageSourceUrl(doc.path, raw) ?? "";
        },
      },
    );
    engineRef.current = engine;
    setEngine(engine);

    // 粘贴分流(05 位图 / 17 富文本与纯文本语义)
    const onPaste = (e: ClipboardEvent) => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const items = [...(e.clipboardData?.items ?? [])];
      // 1) 剪贴板位图优先(截图;含文件路径并存时位图优先,规格 9.2)
      const imageItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        if (!file) return;
        void (async () => {
          try {
            const landed = await landClipboardImage({
              notePath: doc.path,
              mime: file.type || "image/png",
              bytes: new Uint8Array(await file.arrayBuffer()),
            });
            if (landed) current.insertImage(landed.fileName, "");
          } catch (err) {
            console.error("[image] paste insert failed:", err);
          }
        })();
        return;
      }
      // 2) 文件路径(资源管理器复制):图片扩展名走落盘;非图片插指向文件的链接文本
      const fileItem = items.find((it) => it.kind === "file");
      if (fileItem) {
        const file = fileItem.getAsFile();
        if (!file) return;
        e.preventDefault();
        const sourcePath = window.confidant.pathForFile(file);
        if (!sourcePath) {
          console.error("[paste] cannot resolve file path");
          return;
        }
        if (looksLikeImageFile(file)) {
          void (async () => {
            const landed = await landImageFile({ notePath: doc.path, sourcePath });
            if (landed) current.insertImage(landed.fileName, "");
          })();
          return;
        }
        // 插入链接文本(不复制文件):以笔记目录为基准的相对路径更稳,跨盘则用绝对路径
        const base = basename(sourcePath);
        const escapeHtml = (s: string): string =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const pathForLink = sourcePath.replace(/\\/g, "/");
        current.insertHtml(`<a href="${escapeHtml(pathForLink)}">${escapeHtml(base)}</a>`);
        return;
      }
      // 3) 富文本来源:净化后按 schema 吸收(结构保留,样式级降级)
      const html = e.clipboardData?.getData("text/html");
      if (html && html.trim() !== "") {
        e.preventDefault();
        current.insertHtml(sanitizePasteHtml(html));
        return;
      }
      // 4) 纯文本来源:原样插入,不把 Markdown 语法文本解析成格式(规格 9.2)
      const plain = e.clipboardData?.getData("text/plain");
      if (plain != null) {
        e.preventDefault();
        current.insertPlainText(plain);
      }
    };

    // 拖入:图片文件(资源管理器)→ 复制落盘(沿用源扩展名)→ 按落点插入
    const onDrop = (e: DragEvent) => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const files = [...(e.dataTransfer?.files ?? [])];
      const imageFile = files.find(looksLikeImageFile);
      if (!imageFile) return;
      e.preventDefault();
      const sourcePath = window.confidant.pathForFile(imageFile);
      if (!sourcePath) {
        console.error("[image] drop: cannot resolve file path");
        return;
      }
      void (async () => {
        try {
          const landed = await landImageFile({ notePath: doc.path, sourcePath });
          if (landed) current.insertImageAtCoords(e.clientX, e.clientY, landed.fileName, "");
        } catch (err) {
          console.error("[image] drop insert failed:", err);
        }
      })();
    };

    const start = () => pipelineRef.current?.setComposing(true);
    const end = () => pipelineRef.current?.setComposing(false);
    const allowDrop = (e: DragEvent) => e.preventDefault(); // 允许落点坐标

    // ── 图片/表格/任务 右键操作 ──
    const onContextMenu = async (e: MouseEvent): Promise<void> => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const target = e.target as Element | null;
      if (!target) return;

      // 图片右键(06)
      const imgWrapper = target.closest(".confidant-image-node");
      if (imgWrapper) {
        e.preventDefault();
        const raw = imgWrapper.getAttribute("data-src-raw") ?? "";
        if (isRemoteSrc(raw)) {
          await window.confidant.infoDialog("这是一张网络图片(远程图不做下载与显示)。");
          return;
        }
        const abs = resolveImageAbsPath(doc.path, raw);
        if (!abs) {
          await window.confidant.infoDialog("图片引用无效。");
          return;
        }
        if (!(await window.confidant.pathExists(abs))) {
          // 引用悬空(文件已被外部删走):明确提示,不静默;可移除引用
          const choice = await window.confidant.showContextMenu([
            { id: "gone", label: "图片文件已不存在(可能已被外部删除)", enabled: false },
            { id: "remove-ref", label: "移除引用" },
          ]);
          if (choice === "remove-ref") current.removeImageNodeAtElement(imgWrapper);
          return;
        }
        const choice = await window.confidant.showContextMenu([
          { id: "open", label: "打开所在文件夹" },
          { id: "copy", label: "复制图片" },
          { id: "remove", label: "删除" },
        ]);
        if (choice === "open") {
          await window.confidant.showItemInFolder(abs);
        } else if (choice === "copy") {
          const r = await window.confidant.copyImageToClipboard(abs);
          if (!r.ok) {
            await window.confidant.infoDialog(`复制图片失败:${r.error.message}`);
          }
        } else if (choice === "remove") {
          const yes = await window.confidant.confirmDialog(
            "删除这张图片及其文件?将移入回收站",
          );
          if (!yes) return;
          const refRemoved = current.removeImageNodeAtElement(imgWrapper); // 引用移除 → 自动保存
          const tr = await window.confidant.trashItem(abs);
          if (!tr.ok) {
            await window.confidant.infoDialog(
              refRemoved
                ? `图片文件未能移入回收站:${tr.error.message}(引用已从文档移除)。`
                : `图片文件未能移入回收站:${tr.error.message}`,
            );
          }
        }
        return;
      }

      // 链接右键(16):打开链接(分流)/复制地址
      const anchorEl = target.closest("a[href]");
      if (anchorEl && docRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const href = anchorEl.getAttribute("href") ?? "";
        const choice = await window.confidant.showContextMenu([
          { id: "open-link", label: "打开链接" },
          { id: "copy-link", label: "复制链接地址" },
        ]);
        if (choice === "open-link") void openLinkTarget(docRef.current.path, href);
        else if (choice === "copy-link") {
          try {
            await navigator.clipboard.writeText(href);
          } catch {
            await window.confidant.infoDialog("复制失败");
          }
        }
        return;
      }

      // 表格右键(09):光标定位到该格后执行行列/对齐操作
      const cell = target.closest("td, th");
      if (cell && docRef.current && engineRef.current) {
        e.preventDefault();
        await engineRef.current.anchorCursorAtCoords(e.clientX, e.clientY);
        const choice = await window.confidant.showContextMenu([
          { id: "row-before", label: "在上方插入行" },
          { id: "row-after", label: "在下方插入行" },
          { id: "col-before", label: "在左侧插入列" },
          { id: "col-after", label: "在右侧插入列" },
          { id: "sep1", type: "separator" },
          { id: "row-delete", label: "删除本行" },
          { id: "col-delete", label: "删除本列" },
          {
            id: "menu-align",
            type: "submenu",
            label: "对齐",
            submenu: [
              { id: "align-left", label: "左对齐" },
              { id: "align-center", label: "居中" },
              { id: "align-right", label: "右对齐" },
            ],
          },
        ]);
        const ops: Record<string, Parameters<typeof current.tableOp>[0]> = {
          "row-before": "rowBefore",
          "row-after": "rowAfter",
          "row-delete": "rowDelete",
          "col-before": "colBefore",
          "col-after": "colAfter",
          "col-delete": "colDelete",
          "align-left": "alignLeft",
          "align-center": "alignCenter",
          "align-right": "alignRight",
        };
        const op = choice ? ops[choice] : undefined;
        if (op) {
          current.tableOp(op);
          setUiTick((t) => t + 1);
        }
        return;
      }

      // 任务列表右键(09):勾选切换与缩进/反缩进
      const taskLi = target.closest("li[data-checked]");
      if (taskLi) {
        e.preventDefault();
        const choice = await window.confidant.showContextMenu([
          { id: "task-toggle", label: "切换完成状态" },
          { id: "sep2", type: "separator" },
          { id: "task-indent", label: "缩进" },
          { id: "task-outdent", label: "反缩进" },
        ]);
        if (choice === "task-toggle") current.toggleTaskCheckedAt(taskLi);
        else if (choice === "task-indent") current.listIndent(1);
        else if (choice === "task-outdent") current.listIndent(-1);
        return;
      }
    };

    host.addEventListener("paste", onPaste);
    host.addEventListener("drop", onDrop);
    host.addEventListener("dragover", allowDrop);
    const handleContextMenu = (e: MouseEvent): void => void onContextMenu(e);
    host.addEventListener("contextmenu", handleContextMenu);
    host.addEventListener("compositionstart", start);
    host.addEventListener("compositionend", end);
    host.addEventListener("compositioncancel", end);
    return () => {
      engine.destroy();
      engineRef.current = null;
      setEngine(null);
      host.removeEventListener("paste", onPaste);
      host.removeEventListener("drop", onDrop);
      host.removeEventListener("dragover", allowDrop);
      host.removeEventListener("contextmenu", handleContextMenu);
      host.removeEventListener("compositionstart", start);
      host.removeEventListener("compositionend", end);
      host.removeEventListener("compositioncancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          docMissingRef.current = true;
          setDocMissing(true);
        } else if (ev.type === "change") {
          // 内容被外部修改:不弹窗;无本地未保存输入时重载为磁盘内容
          if (!pipelineRef.current?.isDirty()) void reloadCurrentFromDisk();
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 缺文件打开 → 12 横幅语义(恢复重建/放弃;不静默)。 */
  const openMissingNoteBanner = useCallback((absPath: string) => {
    const name = absPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "笔记";
    const stub: OpenNote = { path: absPath, name, head: null };
    docRef.current = stub;
    setDoc(stub);
    engineRef.current?.loadMarkdown("");
    pipelineRef.current?.resetClean();
    docMissingRef.current = true;
    setDocMissing(true);
    document.title = `${name} · confidant`;
  }, []);

  // 横幅动作
  const recoverDeletedDoc = useCallback(async () => {
    const cur = docRef.current;
    if (!cur) return;
    docMissingRef.current = false;
    setDocMissing(false);
    // 原路径重建并写回当前编辑器内容(救回键入)
    const res = await window.confidant.writeTextFile(
      cur.path,
      composeNoteText({ head: cur.head, bodyMd: engineRef.current?.getMarkdown() ?? "" }),
    );
    if (!res.ok) {
      docMissingRef.current = true;
      setDocMissing(true);
      showFileOpError(res, "恢复重建失败");
    } else {
      pipelineRef.current?.resetClean();
    }
  }, []);
  const abandonDeletedDoc = useCallback(() => {
    docRef.current = null;
    setDoc(null);
    pipelineRef.current?.resetClean();
    docMissingRef.current = false;
    setDocMissing(false);
    document.title = "confidant · 知己笔记";
  }, []);

  useEffect(() => {
    return window.confidant.onOpenFile((path) => void openPath(path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return window.confidant.onOpenWorkspace((path) => void openWorkspace(path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // 树展开记忆:按工作区载入;切换工作区时恢复对应展开集合
  useEffect(() => {
    if (!workspace) return;
    void (async () => {
      const map = (await window.confidant.stateGet("expanded")) as
        | Record<string, string[]>
        | null;
      const rels = map?.[workspace.root] ?? [];
      setExpanded(new Set(rels));
    })();
  }, [workspace]);

  const persistExpanded = useCallback(
    (rels: string[]) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      void (async () => {
        const map = ((await window.confidant.stateGet("expanded")) as Record<string, string[]> | null) ?? {};
        map[ws.root] = rels;
        window.confidant.stateSet("expanded", map);
      })();
    },
    [],
  );

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

  // ═══ 文件操作(10):新建/新建文件夹/重命名/删除 + 变更通知条(单步撤销) ═══

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback(
    (label: string, opts?: { undo?: () => void; action?: { label: string; run: () => void } }) => {
      setNotice({ id: Date.now(), label, ...opts });
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 8000);
    },
    [],
  );
  const pushNotice = useCallback(
    (label: string, undo: () => void) => showNotice(label, { undo }),
    [showNotice],
  );
  const dismissNotice = useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  /** 相对路径 → 绝对目录(选中文件夹自身;文件为父目录;'' = 根)。 */
  const absDirFor = useCallback((rel: string | null, kind?: "dir" | "md"): string | null => {
    const ws = workspaceRef.current;
    if (!ws) return null;
    const dirRel = !rel || rel === "" ? "" : kind === "dir" ? rel : rel.split("/").slice(0, -1).join("/");
    return wsJoin(ws.root, dirRel);
  }, []);

  /** 当前文档路径若在 moved 树内则随移动更新。 */
  const relocateDocIfNeeded = useCallback((fromAbs: string, toAbs: string) => {
    const cur = docRef.current;
    if (!cur) return;
    const f = fromAbs.replace(/\\/g, "/");
    const t = toAbs.replace(/\\/g, "/");
    const c = cur.path.replace(/\\/g, "/");
    if (c.toLowerCase() === f.toLowerCase()) {
      const next = { ...cur, path: t };
      docRef.current = next;
      setDoc(next);
      document.title = `${next.name} · confidant`;
      window.confidant.noteOpened(t);
    } else if (c.toLowerCase().startsWith(f.toLowerCase() + "/")) {
      const next = { ...cur, path: t + c.slice(f.length) };
      docRef.current = next;
      setDoc(next);
      window.confidant.noteOpened(next.path);
    }
  }, []);

  const doDeleteEntry = useCallback(
    async (entry: { relPath: string; kind: "dir" | "md" }) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      const rel = entry.relPath;
      const abs = wsJoin(ws.root, rel);
      const cur = docRef.current;
      if (cur && cur.path.toLowerCase() === abs.toLowerCase()) {
        const ok = await window.confidant.confirmDialog(
          "正在编辑的文件将被删除并移入回收站。继续?",
        );
        if (!ok) return;
      } else if (entry.kind === "dir") {
        const ok = await window.confidant.confirmDialog(
          "删除文件夹及其中的全部笔记?文件将移入回收站",
        );
        if (!ok) return;
      }
      ownOp.markOwnOp(abs);
      const tr = await window.confidant.trashItem(abs);
      if (!tr.ok) {
        // 回声抑制时间盒自过期,无需主动删除
        showFileOpError(tr, "删除失败");
        return;
      }
      // 删除正在编辑的文件:清空编辑区(编辑内容已随删除确认作废,不残留指向旧路径的保存)
      if (cur && cur.path.toLowerCase() === abs.toLowerCase()) {
        docRef.current = null;
        setDoc(null);
        pipelineRef.current?.resetClean();
        docMissingRef.current = false;
        setDocMissing(false);
        document.title = "confidant · 知己笔记";
      }
      setSelected(null);
      selectedRef.current = null;
      refreshMenuContext();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doRenameEntry = useCallback(
    async (rel: string, newName: string) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      const abs = wsJoin(ws.root, rel);
      const kind = selectedRef.current?.kind === "dir" ? "dir" : "md";
      ownOp.markOwnOp(abs);
      const r = await window.confidant.renamePath(abs, newName);
      if (!r.ok) {
        // 回声抑制时间盒自过期,无需主动删除
        showFileOpError(r, "重命名失败");
        return;
      }
      relocateDocIfNeeded(abs, r.value.path);
      const oldAbs = abs;
      pushNotice(`已重命名 — 撤销`, () => {
        void (async () => {
          const back = await window.confidant.renamePath(r.value.path, rel.split("/").pop()!);
          if (back.ok) relocateDocIfNeeded(r.value.path, oldAbs);
          else showFileOpError(back, "撤销失败");
        })();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doMoveEntry = useCallback(
    async (rel: string, targetRel: string) => {
      const ws = workspaceRef.current;
      if (!ws || rel === "") return;
      const abs = wsJoin(ws.root, rel);
      const targetDirRel = targetRel === "" ? "" : targetRel;
      const parentRel = rel.split("/").slice(0, -1).join("/");
      if (parentRel.toLowerCase() === targetDirRel.toLowerCase()) return; // 同目录无操作
      const targetAbs = targetDirRel === "" ? ws.root : wsJoin(ws.root, targetDirRel);
      ownOp.markOwnOp(abs);
      const r = await window.confidant.movePath(abs, targetAbs);
      if (!r.ok) {
        // 回声抑制时间盒自过期,无需主动删除
        showFileOpError(r, "移动失败");
        return;
      }
      relocateDocIfNeeded(abs, r.value.path);
      const from = abs;
      const to = r.value.path;
      pushNotice(`已移动 — 撤销`, () => {
        void (async () => {
          const back = await window.confidant.movePath(to, from.replace(/[\\/][^\\/]*$/, ""));
          if (back.ok) relocateDocIfNeeded(to, from);
          else showFileOpError(back, "撤销失败");
        })();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doCreateNote = useCallback(
    async (dirRel: string) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      const dirAbs = dirRel === "" ? ws.root : wsJoin(ws.root, dirRel);
      const r = await window.confidant.newNoteIn(dirAbs);
      if (!r.ok) {
        showFileOpError(r, "新建失败");
        return;
      }
      await openPath(r.value.path);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const doCreateFolder = useCallback(
    async (dirRel: string, name: string) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      const dirAbs = dirRel === "" ? ws.root : wsJoin(ws.root, dirRel);
      const r = await window.confidant.newFolderIn(dirAbs, name);
      if (!r.ok) showFileOpError(r, "新建失败");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 树行右键菜单(文件/文件夹;空区右键由 Sidebar 回调)
  const onTreeRowContext = useCallback(
    async (e: ReactMouseEvent, entry: TreeEntry) => {
      e.preventDefault();
      e.stopPropagation();
      const ws = workspaceRef.current;
      if (!ws) return;
      selectedRef.current = { rel: entry.relPath, kind: entry.kind };
      setSelected({ rel: entry.relPath, kind: entry.kind });
      refreshMenuContext();
      const choice = await window.confidant.showContextMenu(
        entry.kind === "dir"
          ? [
              { id: "new-note", label: "新建笔记" },
              { id: "new-folder", label: "新建文件夹" },
              { id: "sep", type: "separator" },
              { id: "rename", label: "重命名" },
              { id: "delete", label: "删除" },
            ]
          : [
              { id: "open", label: "打开" },
              { id: "rename", label: "重命名" },
              { id: "delete", label: "删除" },
            ],
      );
      if (!choice) return;
      if (choice === "new-note") void doCreateNote(entry.relPath);
      else if (choice === "new-folder") setPrompt({ type: "new-folder", dirRel: entry.relPath });
      else if (choice === "rename") {
        setPrompt({ type: "rename", rel: entry.relPath, name: entry.name });
      } else if (choice === "delete") void doDeleteEntry(entry);
      else if (choice === "open") void openRel(entry.relPath);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onTreeEmptyContext = useCallback(
    async (e: ReactMouseEvent) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      e.preventDefault();
      const choice = await window.confidant.showContextMenu([
        { id: "new-note", label: "新建笔记" },
        { id: "new-folder", label: "新建文件夹" },
      ]);
      if (choice === "new-note") void doCreateNote("");
      else if (choice === "new-folder") setPrompt({ type: "new-folder", dirRel: "" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 拖拽(11):记录源 rel;放下时移入目标目录/根
  const onDragStartEntry = useCallback((e: ReactDragEvent, entry: TreeEntry) => {
    e.dataTransfer.setData("application/x-confidant-entry", entry.relPath);
    e.dataTransfer.effectAllowed = "move";
  }, []);
  const onDropEntry = useCallback(
    (e: ReactDragEvent, target: TreeEntry) => {
      e.preventDefault();
      const srcRel = e.dataTransfer.getData("application/x-confidant-entry");
      if (!srcRel) return;
      if (srcRel === target.relPath) return;
      if (target.kind !== "dir") return;
      void doMoveEntry(srcRel, target.relPath);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 菜单「文件」命令(10)与「视图→侧栏」状态在 menu effect 内注册;
  // 此处给 menu 使用的引用已就绪(workspaceRef/selectedRef)。

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

  // 「插入图片…」:选文件 → 复制落盘到笔记同目录 → 光标处插入相对引用
  const insertImageViaDialog = useCallback(async () => {
    const doc = docRef.current;
    const engine = engineRef.current;
    if (!doc || !engine) return;
    const sourcePath = await window.confidant.pickImageFile();
    if (!sourcePath) return;
    const landed = await landImageFile({ notePath: doc.path, sourcePath });
    if (landed) engine.insertImage(landed.fileName, "");
  }, []);

  // 当前文件自动展开定位(父目录折叠时自动展开,写回记忆)
  useEffect(() => {
    const ws = workspace;
    if (!ws || !doc) return;
    const rel = relPathOf(ws.root, doc.path);
    if (!rel) return;
    const dirParts = rel.split("/");
    if (dirParts.length <= 1) return;
    const dirRel = dirParts.slice(0, -1).join("/");
    const needed = dirAncestorsOf(dirRel);
    setExpanded((prev) => {
      const missing = needed.filter((p) => !prev.has(p));
      if (missing.length === 0) return prev;
      const nextSet = new Set(prev);
      for (const p of missing) nextSet.add(p);
      return nextSet;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, doc]);

  // 展开集合变更 → 持久化(去抖由 stateSet 主进程侧兜底;此处直接整体写)
  const toggleDir = useCallback(
    (relPath: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(relPath)) next.delete(relPath);
        else next.add(relPath);
        persistExpanded([...next]);
        return next;
      });
    },
    [persistExpanded],
  );

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
