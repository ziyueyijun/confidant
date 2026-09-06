// 应用视图层(04 形态):欢迎页 → 工作区(文件树侧栏 + 所见即所得编辑)。
// 保存语义经 save-pipeline(02);命令源与 native 菜单经 menu-bridge(03)。

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { createEngine, type Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import type { TreeEntry } from "@shared/ipc";
import { composeNoteText, parseNoteText } from "./editor/note-document";
import { createSavePipeline, type SaveState } from "./editor/save-pipeline";
import { landClipboardImage, landImageFile, looksLikeImageFile } from "./editor/image-insert";
import { isRemoteSrc, resolveImageAbsPath, resolveImageSourceUrl } from "./editor/image-source";
import { Cmd, createMenuBridge, type MenuContext } from "./menu/menu-bridge";
import { Sidebar } from "./components/Sidebar";
import { FormatOverlay } from "./components/FormatOverlay";
import { TextPrompt } from "./components/TextPrompt";
import { countMdInTree, dirAncestorsOf, relPathOf, wsJoin, type Workspace } from "./workspace/workspace";

interface OpenNote {
  path: string;
  name: string;
  head: string | null;
}

function describeWriteError(error: { code: string; message: string } | null): string | null {
  if (!error) return null;
  switch (error.code) {
    case "ENOENT":
      return "文件不存在或已被移动,无法保存。";
    case "EACCES":
    case "EPERM":
    case "EBUSY":
      return "无法写入:文件可能被占用或只读。请检查后重试。";
    default:
      return `保存失败:${error.message}`;
  }
}

function toThrownError(res: { ok: false; error: { code: string; message: string } }): Error {
  return Object.assign(new Error(res.error.message), { code: res.error.code });
}

const EMPTY_SAVE_STATE: SaveState = {
  dirty: false,
  saving: false,
  savedAt: null,
  error: null,
};

const EMPTY_WORKSPACE_GUIDANCE =
  "这个文件夹还没有笔记:右键左侧空白处可以新建,也可以把 .md 文件放进这个文件夹。";

const btnSmall: CSSProperties = {
  padding: "3px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #c5c5c5",
  background: "#fff",
  cursor: "pointer",
};

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
  /** 变更通知条(单步撤销;最近一次操作)。 */
  const [notice, setNotice] = useState<{ id: number; label: string; undo: () => void } | null>(null);
  /** 正在编辑文件被外部删除(12:不静默重建,提供恢复/放弃)。 */
  const [docMissing, setDocMissing] = useState(false);
  const docMissingRef = useRef(false);
  /** 自身文件操作产生的路径(其 watcher 回声不当作外部删除)。 */
  const ownOpPathsRef = useRef<Set<string>>(new Set());
  const promptValidate = (v: string): string | null => {
    if (!v.trim()) return "名称不能为空";
    if (/[\\/:*?"<>|]/.test(v)) return "名称不能包含 \\ / : * ? \" < > | 字符";
    return null;
  };

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [sidebar, setSidebar] = useState({ visible: true, width: 260 });

  // ── 保存管线(02) ──
  useEffect(() => {
    const pipeline = createSavePipeline(
      {
        async write() {
          const current = docRef.current;
          const engine = engineRef.current;
          if (!current || !engine) return;
          if (docMissingRef.current) return; // 文件已被外部删除:不静默重建(12)
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

    // 粘贴:剪贴板位图(截图)→ 落盘(位图优先;文件路径分支归 17)
    const onPaste = (e: ClipboardEvent) => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const items = e.clipboardData?.items ?? [];
      const imageItem = [...items].find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (!imageItem) return;
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
    void refreshMenuContext;
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
        if (ownOpPathsRef.current.has(ev.path)) continue;
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
      showOpError(res, "恢复重建失败");
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


  // ── 持久化布局状态启动载入 ──
  useEffect(() => {
    void (async () => {
      const stored = (await window.confidant.stateGet("sidebar")) as {
        visible?: boolean;
        width?: number;
      } | null;
      if (stored && typeof stored === "object") {
        setSidebar((prev) => ({
          visible: typeof stored.visible === "boolean" ? stored.visible : prev.visible,
          width: typeof stored.width === "number" ? stored.width : prev.width,
        }));
      }
    })();
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
  const errText = (code: string | undefined, fallback: string): string => {
    switch (code) {
      case "EEXIST":
        return "同名文件或文件夹已存在,操作未执行。";
      case "EINVAL":
        return "名称包含非法字符,操作未执行。";
      case "ECYCLE":
        return "不能把文件夹移入自身或它的子文件夹。";
      case "EPERM":
      case "EACCES":
      case "EBUSY":
        return "没有权限或文件被占用,操作失败。";
      default:
        return fallback;
    }
  };
  const showOpError = (r: { ok: false; error: { code: string; message: string } }, what: string): void => {
    void window.confidant.infoDialog(errText(r.error.code, `${what}:${r.error.message}`));
  };

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushNotice = useCallback((label: string, undo: () => void) => {
    setNotice({ id: Date.now(), label, undo });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 8000);
  }, []);
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
      ownOpPathsRef.current.add(abs);
      const tr = await window.confidant.trashItem(abs);
      if (!tr.ok) {
        ownOpPathsRef.current.delete(abs);
        showOpError(tr, "删除失败");
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
      ownOpPathsRef.current.add(abs);
      const r = await window.confidant.renamePath(abs, newName);
      if (!r.ok) {
        ownOpPathsRef.current.delete(abs);
        showOpError(r, "重命名失败");
        return;
      }
      relocateDocIfNeeded(abs, r.value.path);
      const oldAbs = abs;
      pushNotice(`已重命名 — 撤销`, () => {
        void (async () => {
          const back = await window.confidant.renamePath(r.value.path, rel.split("/").pop()!);
          if (back.ok) relocateDocIfNeeded(r.value.path, oldAbs);
          else showOpError(back, "撤销失败");
        })();
      });
      void kind;
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
      ownOpPathsRef.current.add(abs);
      const r = await window.confidant.movePath(abs, targetAbs);
      if (!r.ok) {
        ownOpPathsRef.current.delete(abs);
        showOpError(r, "移动失败");
        return;
      }
      relocateDocIfNeeded(abs, r.value.path);
      const from = abs;
      const to = r.value.path;
      pushNotice(`已移动 — 撤销`, () => {
        void (async () => {
          const back = await window.confidant.movePath(to, from.replace(/[\\/][^\\/]*$/, ""));
          if (back.ok) relocateDocIfNeeded(to, from);
          else showOpError(back, "撤销失败");
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
        showOpError(r, "新建失败");
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
      if (!r.ok) showOpError(r, "新建失败");
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

  const toggleSidebar = useCallback(() => {
    setSidebar((prev) => {
      const next = { ...prev, visible: !prev.visible };
      window.confidant.stateSet("sidebar", next);
      return next;
    });
  }, []);

  const commitSidebar = useCallback((s: { visible: boolean; width: number }) => {
    window.confidant.stateSet("sidebar", s);
  }, []);

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
        const name = last.file.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "笔记";
        const stub: OpenNote = { path: last.file, name, head: null };
        docRef.current = stub;
        setDoc(stub);
        engineRef.current?.loadMarkdown("");
        pipelineRef.current?.resetClean();
        docMissingRef.current = true;
        setDocMissing(true);
        document.title = `${name} · confidant`;
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
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 12px",
          borderBottom: "1px solid var(--shell-border, #e3e3e3)",
          background: "var(--shell-bg, #fafafa)",
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {workspace && (
          <button
            type="button"
            data-testid="sidebar-toggle"
            title={sidebar.visible ? "收起侧栏" : "显示侧栏"}
            onClick={toggleSidebar}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              padding: "2px 6px",
              color: "inherit",
            }}
          >
            {sidebar.visible ? "◀" : "▶"}
          </button>
        )}
        {doc && <strong style={{ fontSize: 14 }}>{doc.name}</strong>}
        {!doc && workspace && (
          <strong style={{ fontSize: 14, fontWeight: 500, color: "#888" }}>{workspace.name}</strong>
        )}
        {!workspace && <strong style={{ fontSize: 14 }}>知己笔记</strong>}
        {doc && <span style={{ color: errorText ? "#c0392b" : "#888" }}>{statusText}</span>}
        {errorText && (
          <span data-testid="load-error" style={{ color: "#c0392b" }}>
            {errorText}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {doc && (
          <button
            type="button"
            onClick={() => void pipelineRef.current?.flush()}
            disabled={!saveState.dirty || saveState.saving}
          >
            保存
          </button>
        )}
      </header>
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
            onWidthChange={(width) => setSidebar((p) => ({ ...p, width }))}
            onWidthDragEnd={() => commitSidebar(sidebar)}
            onRowContext={(e, entry) => void onTreeRowContext(e, entry)}
            onEmptyContext={(e) => void onTreeEmptyContext(e)}
            onDragStartEntry={onDragStartEntry}
            onDropEntry={onDropEntry}
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
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: "var(--color-background, #fff)",
              }}
            >
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>知己笔记</h1>
              <p style={{ margin: 0, color: "#777" }}>
                confidant · 像写字板一样,直接写在你的文件夹里
              </p>
              <button
                type="button"
                onClick={() => void openFolderViaDialog()}
                style={{
                  marginTop: 8,
                  padding: "10px 22px",
                  fontSize: 15,
                  borderRadius: 6,
                  border: "1px solid #b8b8b8",
                  cursor: "pointer",
                  background: "#f5f5f5",
                }}
              >
                打开文件夹
              </button>
              {recentFolders.length > 0 && (
                <div
                  data-testid="welcome-recents"
                  style={{ marginTop: 22, width: 320, maxHeight: 220, overflowY: "auto" }}
                >
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>最近打开</div>
                  {recentFolders.map((r) => (
                    <button
                      key={r.path}
                      type="button"
                      title={r.path}
                      onClick={() => void openWorkspace(r.path)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 8px",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "inherit",
                        borderRadius: 4,
                      }}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {guidanceVisible && (
            <div
              data-testid="empty-workspace-guidance"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
              }}
            >
              <p
                style={{
                  maxWidth: 420,
                  textAlign: "center",
                  lineHeight: 1.8,
                  color: "#999",
                  fontSize: 14,
                }}
              >
                {EMPTY_WORKSPACE_GUIDANCE}
              </p>
            </div>
          )}
          {!doc && workspace && mdCount > 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <p style={{ color: "#bbb", fontSize: 14 }}>从左侧选择一个笔记开始书写</p>
            </div>
          )}
        </div>
      </div>
      {/* 浮动格式工具条与链接编辑(07) */}
      <FormatOverlay engine={engine} tick={uiTick} openLinkRequest={linkRequest} />
      {/* 文件被外部删除横幅(12) */}
      {docMissing && doc && (
        <div
          data-testid="doc-missing-banner"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            top: 44,
            zIndex: 55,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 14px",
            background: "#fdf1e7",
            border: "1px solid #e8b98a",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <span>文件已被删除</span>
          <button type="button" style={btnSmall} onClick={() => void recoverDeletedDoc()}>
            恢复重建
          </button>
          <button type="button" style={btnSmall} onClick={abandonDeletedDoc}>
            放弃
          </button>
        </div>
      )}
      {/* 变更通知条(10/11:单步撤销) */}
      {notice && (
        <div
          data-testid="change-notice"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 18,
            zIndex: 56,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            background: "rgba(40,40,40,.92)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          <span>{notice.label}</span>
          <button
            type="button"
            style={{
              border: "none",
              background: "transparent",
              color: "#9ec9f5",
              cursor: "pointer",
              fontSize: 13,
            }}
            onClick={() => {
              notice.undo();
              dismissNotice();
            }}
          >
            撤销
          </button>
          <button
            type="button"
            aria-label="关闭"
            style={{ border: "none", background: "transparent", color: "#aaa", cursor: "pointer" }}
            onClick={dismissNotice}
          >
            ✕
          </button>
        </div>
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
