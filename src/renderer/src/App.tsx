// 应用视图层(04 形态):欢迎页 → 工作区(文件树侧栏 + 所见即所得编辑)。
// 保存语义经 save-pipeline(02);命令源与 native 菜单经 menu-bridge(03)。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEngine, type Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import type { TreeEntry } from "@shared/ipc";
import { composeNoteText, parseNoteText } from "./editor/note-document";
import { createSavePipeline, type SaveState } from "./editor/save-pipeline";
import { landClipboardImage, landImageFile, looksLikeImageFile } from "./editor/image-insert";
import { isRemoteSrc, resolveImageAbsPath, resolveImageSourceUrl } from "./editor/image-source";
import { Cmd, createMenuBridge } from "./menu/menu-bridge";
import { Sidebar } from "./components/Sidebar";
import { FormatOverlay } from "./components/FormatOverlay";
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

    // ── 图片右键操作(06):打开所在文件夹 / 复制图片 / 删除(引用+回收站) ──
    const onContextMenu = async (e: MouseEvent): Promise<void> => {
      const doc = docRef.current;
      const current = engineRef.current;
      if (!doc || !current) return;
      const target = e.target as Element | null;
      const wrapper = target?.closest(".confidant-image-node");
      if (!wrapper) return; // 非图片:留给树/其他右键
      e.preventDefault();
      const raw = wrapper.getAttribute("data-src-raw") ?? "";
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
        if (choice === "remove-ref") current.removeImageNodeAtElement(wrapper);
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
        const refRemoved = current.removeImageNodeAtElement(wrapper); // 引用移除 → 自动保存
        const tr = await window.confidant.trashItem(abs);
        if (!tr.ok) {
          await window.confidant.infoDialog(
            refRemoved
              ? `图片文件未能移入回收站:${tr.error.message}(引用已从文档移除)。`
              : `图片文件未能移入回收站:${tr.error.message}`,
          );
        }
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
    menu.register(Cmd.about, () => true, () => void window.confidant.showAbout());
    menu.register(Cmd.quit, () => true, () => window.confidant.closeWindow());
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

  useEffect(() => {
    return window.confidant.onWorkspaceTree((next) => setTree(next));
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
    <div style={{ height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
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
    </div>
  );
}
