// 01 票应用骨架:欢迎占位页 → 打开 .md → 所见即所得编辑 → Ctrl+S/按钮保存。
// 会话编排保持轻薄;自动保存/写盘管线在 02 票重构为防抖管线。

import { useCallback, useEffect, useRef, useState } from "react";
import { createEngine, type Engine } from "../../../packages/engine";
import { basename } from "@shared/path";
import { composeNoteText, parseNoteText } from "./editor/note-document";

interface OpenNote {
  path: string;
  name: string;
  head: string | null;
}

const IS_DEV_FALLBACK = true; // 菜单栏(03)落定前,渲染层自行接 Ctrl+S

function describeWriteError(error: { code: string; message: string } | null): string {
  if (!error) return "";
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

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const docRef = useRef<OpenNote | null>(null);
  const savingRef = useRef(false);

  const [doc, setDoc] = useState<OpenNote | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 引擎生命周期(装载/编辑回调用 ref 保持最新闭包)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = createEngine(host, {
      onUpdate: () => {
        docRef.current && setDirty(true);
      },
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // 打开指定路径
  const openPath = useCallback(async (path: string) => {
    const res = await window.confidant.readTextFile(path);
    if (!res.ok) {
      setErrorText(describeWriteError(res.error));
      return;
    }
    const docModel = parseNoteText(res.value);
    const next: OpenNote = { path, name: basename(path), head: docModel.head };
    docRef.current = next;
    setDoc(next);
    setDirty(false);
    setStatus("idle");
    setErrorText(null);
    setSavedAt(null);
    engineRef.current?.loadMarkdown(docModel.bodyMd);
    document.title = `${next.name} · confidant`;
  }, []);

  // 欢迎页「打开文件夹」→ 原生对话框选 .md(04 立起文件树后替换此过渡入口)
  const openNote = useCallback(async () => {
    const path = await window.confidant.openNoteDialog();
    if (path) await openPath(path);
  }, [openPath]);

  const save = useCallback(async () => {
    const current = docRef.current;
    const engine = engineRef.current;
    if (!current || !engine || savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    setErrorText(null);
    try {
      const bodyMd = engine.getMarkdown();
      const text = composeNoteText({ head: current.head, bodyMd });
      const res = await window.confidant.writeTextFile(current.path, text);
      if (res.ok) {
        setDirty(false);
        setStatus("saved");
        setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      } else {
        setStatus("error");
        setErrorText(describeWriteError(res.error));
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  // Ctrl+S(菜单栏落定前的过渡接线)
  useEffect(() => {
    if (!IS_DEV_FALLBACK) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // 主进程请求打开文件(冒烟驱动/菜单打开)
  useEffect(() => {
    return window.confidant.onOpenFile((path) => void openPath(path));
  }, [openPath]);

  const engineHost = (
    <div ref={hostRef} className="editor-prose" data-testid="editor-prose" />
  );

  const statusText =
    status === "saving"
      ? "保存中…"
      : status === "saved" && savedAt
        ? `已保存 ${savedAt}`
        : dirty
          ? "有未保存的修改"
          : savedAt
            ? `已保存 ${savedAt}`
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
          <span style={{ color: status === "error" ? "#c0392b" : "#888" }}>{statusText}</span>
          {errorText && <span style={{ color: "#c0392b" }}>{errorText}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={() => void save()} disabled={!dirty || status === "saving"}>
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
          {errorText && <p style={{ color: "#c0392b" }}>{errorText}</p>}
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
