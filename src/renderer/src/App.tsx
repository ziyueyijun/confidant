// 应用视图层:欢迎占位页(01 过渡态)→ 打开笔记 → 所见即所得编辑。
// 保存语义全部经 save-pipeline(02):停顿 ~1s 自动写盘、Ctrl+S/按钮立即、
// IME 组合期不写、关闭窗口前 flush(主进程拦截 → 本页应答)。

import { useCallback, useEffect, useRef, useState } from "react";
import { createEngine, type Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import { composeNoteText, parseNoteText } from "./editor/note-document";
import { createSavePipeline, type SaveState } from "./editor/save-pipeline";

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

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const docRef = useRef<OpenNote | null>(null);
  const pipelineRef = useRef<ReturnType<typeof createSavePipeline> | null>(null);

  const [doc, setDoc] = useState<OpenNote | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(EMPTY_SAVE_STATE);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 保存管线:io = 把「head + 引擎正文」原子写回当前文件
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

  // 引擎生命周期 + IME 组合门控(DOM 组合事件经 host 冒泡,规格 §9.1)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = createEngine(host, {
      onUpdate: () => {
        if (docRef.current) pipelineRef.current?.notifyEdit();
      },
    });
    engineRef.current = engine;
    const start = () => pipelineRef.current?.setComposing(true);
    const end = () => pipelineRef.current?.setComposing(false);
    host.addEventListener("compositionstart", start);
    host.addEventListener("compositionend", end);
    host.addEventListener("compositioncancel", end);
    return () => {
      engine.destroy();
      engineRef.current = null;
      host.removeEventListener("compositionstart", start);
      host.removeEventListener("compositionend", end);
      host.removeEventListener("compositioncancel", end);
    };
  }, []);

  // 主进程关闭前 flush:先落盘再回执,保证无「未保存内容」态
  useEffect(() => {
    return window.confidant.onFlushRequest(() => {
      const p = pipelineRef.current;
      const done = p ? p.flush() : Promise.resolve();
      void done.finally(() => window.confidant.flushAck());
    });
  }, []);

  // 打开指定路径
  const openPath = useCallback(async (path: string) => {
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
  }, []);

  // 欢迎页「打开文件夹」→ 原生对话框选 .md(04 立起文件树后替换此过渡入口)
  const openNote = useCallback(async () => {
    const path = await window.confidant.openNoteDialog();
    if (path) await openPath(path);
  }, [openPath]);

  // Ctrl+S(菜单栏落定前的过渡接线;03 后由原生菜单快捷键接管)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void pipelineRef.current?.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 主进程请求打开文件(冒烟驱动/菜单打开)
  useEffect(() => {
    return window.confidant.onOpenFile((path) => void openPath(path));
  }, [openPath]);

  const engineHost = <div ref={hostRef} className="editor-prose" data-testid="editor-prose" />;

  const errorText = saveState.error ? describeWriteError(saveState.error) : loadError;
  const statusText = saveState.saving
    ? "保存中…"
    : errorText
      ? errorText
      : saveState.savedAt
        ? `已保存 ${new Date(saveState.savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`
        : saveState.dirty
          ? "有未保存的修改"
          : "已打开";

  return (
    <div style={{ height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      {doc && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "6px 14px",
            borderBottom: "1px solid #e3e3e3",
            background: "#fafafa",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <strong style={{ fontSize: 14 }}>{doc.name}</strong>
          <span style={{ color: errorText ? "#c0392b" : "#888" }}>{statusText}</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => void pipelineRef.current?.flush()}
            disabled={!saveState.dirty || saveState.saving}
          >
            保存
          </button>
        </header>
      )}
      {doc?.head && (
        <div className="fm-block" data-testid="fm-block">
          <pre>{doc.head.replace(/\n$/, "")}</pre>
        </div>
      )}
      {/* 编辑区常驻(引擎在挂载即建,host 必须首帧在场);欢迎态用浮层盖住 */}
      <div
        className="editor-scroll"
        style={{ display: doc ? undefined : "none" }}
        data-testid="editor-scroll"
      >
        {engineHost}
      </div>
      {!doc && (
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
          {loadError && <p style={{ color: "#c0392b" }}>{loadError}</p>}
          <button
            type="button"
            onClick={() => void openNote()}
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
    </div>
  );
}
