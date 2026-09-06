// 文件操作编排(10/11/12):新建/重命名/移动/删除(回收站)+ 单步撤销通知条 + 树行右键/
// 空区右键 + 树内拖拽 + 「插入图片…」入口。从 App.tsx 拆分(22)。
// 依赖的会话核心(openPath 等)经 api 传入;自身持 selected/prompt/notice 局部状态。

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import type { TreeEntry } from "@shared/ipc";
import type { Engine } from "../../../../packages/engine";
import type { createSavePipeline } from "../editor/save-pipeline";
import { landImageFile } from "../editor/image-insert";
import { showFileOpError } from "../session/ops-shared";
import { wsJoin, type Workspace } from "../workspace/workspace";
import type { OpenNote } from "../session/types";

export interface FileOpsApi {
  workspaceRef: RefObject<Workspace | null>;
  docRef: RefObject<OpenNote | null>;
  engineRef: RefObject<Engine | null>;
  pipelineRef: RefObject<ReturnType<typeof createSavePipeline> | null>;
  setDoc: Dispatch<SetStateAction<OpenNote | null>>;
  openPath: (path: string) => Promise<void>;
  openRel: (rel: string) => void;
  refreshMenuContext: () => void;
  /** 自身文件操作回声抑制登记(12 守卫,App 侧持实例)。 */
  markOwnOp: (absPath: string) => void;
  /** 外部删除处置置位清除(编辑中的文件被本操作删除时;useDocMissing)。 */
  clearMissing: () => void;
}

export function useFileOperations(api: FileOpsApi) {
  const { workspaceRef, docRef, engineRef, pipelineRef, setDoc, openPath, openRel, refreshMenuContext, markOwnOp, clearMissing } = api;

  // 树内选中项 / 输入对话框 / 变更通知条(局部状态)
  const selectedRef = useRef<{ rel: string; kind: "dir" | "md" } | null>(null);
  const [selected, setSelected] = useState<{ rel: string; kind: "dir" | "md" } | null>(null);
  const [prompt, setPrompt] = useState<
    | { type: "rename"; rel: string; name: string }
    | { type: "new-folder"; dirRel: string }
    | null
  >(null);
  const [notice, setNotice] = useState<{
    id: number;
    label: string;
    undo?: () => void;
    action?: { label: string; run: () => void };
  } | null>(null);
  const promptValidate = (v: string): string | null => {
    if (!v.trim()) return "名称不能为空";
    if (/[\\/:*?"<>|]/.test(v)) return "名称不能包含 \\ / : * ? \" < > | 字符";
    return null;
  };
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
      markOwnOp(abs);
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
        clearMissing();
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
      markOwnOp(abs);
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
      markOwnOp(abs);
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
  // 打开链接逻辑(16)已上移:见 useEditorHost 前置定义(22)。

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
  return {
    selectedRef,
    selected,
    setSelected,
    prompt,
    setPrompt,
    notice,
    showNotice,
    pushNotice,
    dismissNotice,
    promptValidate,
    absDirFor,
    relocateDocIfNeeded,
    doDeleteEntry,
    doRenameEntry,
    doMoveEntry,
    doCreateNote,
    doCreateFolder,
    onTreeRowContext,
    onTreeEmptyContext,
    onDragStartEntry,
    onDropEntry,
    insertImageViaDialog,
  };
}