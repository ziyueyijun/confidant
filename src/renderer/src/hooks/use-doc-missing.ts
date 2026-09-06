// 正在编辑文件被外部删除处置(12):docMissing 态 + 恢复重建/放弃 + 缺文件横幅装载。
// 不静默重建:文件被外部删走时保存管线(gate)与树刷新均按此态分道。
// 从 App.tsx 拆分(22);engine/pipeline/doc 经 ref 传入,状态与 UI 由本 hook 持有。

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Engine } from "../../../../packages/engine";
import { composeNoteText } from "../editor/note-document";
import type { OpenNote } from "../session/types";

export interface DocMissingApi {
  docRef: RefObject<OpenNote | null>;
  engineRef: RefObject<Engine | null>;
  pipelineRef: RefObject<{ resetClean(): void } | null>;
  setDoc: Dispatch<SetStateAction<OpenNote | null>>;
  showError: (r: { ok: false; error: { code: string; message: string } }, what: string) => void;
}

export function useDocMissing(api: DocMissingApi): {
  docMissing: boolean;
  /** 保存管线 gate 与 watcher 实时读的镜像 ref(避免 effect 闭包取到陈旧 state)。 */
  docMissingRef: RefObject<boolean>;
  /** watcher 收到当前文件 unlink(非自我回声)时置位。 */
  markMissing: () => void;
  clearMissing: () => void;
  /** 缺文件打开(链接/恢复指向已删文件)→ 12 横幅语义:占位装载 + 置位。 */
  openMissingNoteBanner: (absPath: string) => void;
  recoverDeletedDoc: () => Promise<void>;
  abandonDeletedDoc: () => void;
} {
  const [docMissing, setDocMissing] = useState(false);
  const docMissingRef = useRef(false);

  const setMissing = useCallback((v: boolean) => {
    docMissingRef.current = v;
    setDocMissing(v);
  }, []);

  const markMissing = useCallback(() => setMissing(true), [setMissing]);
  const clearMissing = useCallback(() => setMissing(false), [setMissing]);

  /** 缺文件打开 → 12 横幅语义(恢复重建/放弃;不静默)。 */
  const openMissingNoteBanner = useCallback(
    (absPath: string) => {
      const name = absPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "笔记";
      const stub: OpenNote = { path: absPath, name, head: null };
      api.docRef.current = stub;
      api.setDoc(stub);
      api.engineRef.current?.loadMarkdown("");
      api.pipelineRef.current?.resetClean();
      setMissing(true);
      document.title = `${name} · confidant`;
    },
    [api, setMissing],
  );

  // 横幅「恢复重建」:原路径重建并写回当前编辑器内容(救回键入)
  const recoverDeletedDoc = useCallback(async () => {
    const cur = api.docRef.current;
    if (!cur) return;
    setMissing(false);
    const res = await window.confidant.writeTextFile(
      cur.path,
      composeNoteText({ head: cur.head, bodyMd: api.engineRef.current?.getMarkdown() ?? "" }),
    );
    if (!res.ok) {
      setMissing(true);
      api.showError(res, "恢复重建失败");
    } else {
      api.pipelineRef.current?.resetClean();
    }
  }, [api, setMissing]);

  // 横幅「放弃」:清空编辑会话
  const abandonDeletedDoc = useCallback(() => {
    api.docRef.current = null;
    api.setDoc(null);
    api.pipelineRef.current?.resetClean();
    setMissing(false);
    document.title = "confidant · 知己笔记";
  }, [api, setMissing]);

  return {
    docMissing,
    docMissingRef,
    markMissing,
    clearMissing,
    openMissingNoteBanner,
    recoverDeletedDoc,
    abandonDeletedDoc,
  };
}
