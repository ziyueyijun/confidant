// 浮动格式工具条与链接编辑(07):选中文本即浮现;空选/失焦隐藏;就近于选区。
// 命令与「格式」菜单同源(同一引擎方法);光标落在已有链接内时显示「编辑链接」入口,
// 单击链接不跳转(规格 §14;跳转在 16)。

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Eraser, Italic, Link as LinkIcon, Strikethrough } from "lucide-react";
import type { Engine } from "../../../../packages/engine";

export interface FormatOverlayProps {
  engine: Engine | null;
  /** App 侧编辑/选区/命令事件后的节拍(通知重算显示态)。 */
  tick: number;
  /** 递增触发「链接面板」强制打开(格式菜单入口,无选区可用)。 */
  openLinkRequest?: number;
}

type Mode = "selection" | "caret-link" | null;

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "none",
  background: "transparent",
  borderRadius: 4,
  cursor: "pointer",
  color: "inherit",
};
const activeBtn: React.CSSProperties = { ...btn, background: "var(--accent-soft)" };
const inputStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border)",
  outline: "none",
  boxSizing: "border-box",
};
const ghostBtn: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  cursor: "pointer",
};

export function FormatOverlay({ engine, tick, openLinkRequest = 0 }: FormatOverlayProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [linkHref, setLinkHref] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [hrefInput, setHrefInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [flags, setFlags] = useState({ bold: false, italic: false, strike: false });
  const openLinkRef = useRef(0);

  const isInEditor = useCallback((): boolean => {
    const scrollEl = document.querySelector(".editor-scroll");
    if (!scrollEl) return false;
    const r = scrollEl.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, []);

  /** 计算工具条放置(选区上缘;放不下时翻转到底部)。 */
  const refresh = useCallback(() => {
    const ed = engine;
    if (!ed || !isInEditor()) {
      setMode(null);
      setPanel(false);
      return;
    }
    // 编辑器失焦且焦点不在浮动 UI 内 → 隐藏(浮动 UI 按钮用 preventDefault 保焦点)
    const activeInOverlay =
      document.activeElement instanceof Element &&
      document.activeElement.closest('[data-testid="link-panel"],[data-testid="format-toolbar"]');
    if (!ed.isFocused() && !activeInOverlay) {
      setMode(null);
      setPanel(false);
      return;
    }
    const sel = window.getSelection();
    const raw = sel?.rangeCount ? sel.toString() : "";
    let anchor: DOMRect | null = null;
    let newMode: Mode = null;
    if (raw.length > 0) {
      anchor = sel!.getRangeAt(0).getBoundingClientRect();
      newMode = "selection";
    } else {
      const caret = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
      if (caret && ed.linkRangeAtSelection()) {
        anchor = caret;
        newMode = "caret-link";
      }
    }
    if (!anchor || !newMode) {
      setMode(null);
      setPanel(false);
      return;
    }
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const left = Math.min(Math.max(anchor.left, 8), Math.max(8, viewportW - 340));
    const above = anchor.top < 90;
    setPos({ left, top: above ? anchor.bottom + 6 : anchor.top - 8, above });
    setMode(newMode);
    setFlags({
      bold: ed.isMarkAllActive("bold"),
      italic: ed.isMarkAllActive("italic"),
      strike: ed.isMarkAllActive("strike"),
    });
    setLinkHref(ed.linkHrefInSelection());
  }, [engine, isInEditor]);

  useEffect(() => {
    refresh();
  }, [tick, refresh]);

  // 「格式 → 链接」菜单请求:无选区时在编辑区顶部开面板
  useEffect(() => {
    if (openLinkRequest === openLinkRef.current) return;
    openLinkRef.current = openLinkRequest;
    const ed = engine;
    if (!ed || !isInEditor()) return;
    const scrollEl = document.querySelector(".editor-scroll");
    const r = scrollEl?.getBoundingClientRect();
    setPos({ left: Math.max(8, (r?.left ?? 0) + 16), top: (r?.top ?? 0) + 60, above: true });
    setMode("selection");
    setPanel(true);
    setHrefInput(ed.linkHrefInSelection() ?? "");
    setTextInput("");
  }, [openLinkRequest, engine, isInEditor]);

  const openPanel = (): void => {
    if (!engine) return;
    setHrefInput(engine.linkHrefInSelection() ?? "");
    setTextInput("");
    setPanel(true);
  };

  useEffect(() => {
    if (!panel && engine) {
      // 面板关闭后重算一次(提交后图标态/模式正确)
      requestAnimationFrame(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  if (!mode || !pos) return null;
  const editingLink = mode === "caret-link" || (mode === "selection" && !!linkHref);

  const commitLink = (): void => {
    if (!engine) return;
    engine.applyLinkEdit(hrefInput, mode === "caret-link" ? textInput : "");
    setPanel(false);
    requestAnimationFrame(refresh);
  };

  const panelEl = (
    <div
      data-testid="link-panel"
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.above ? pos.top : Math.max(8, pos.top - 130),
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,.12)",
        zIndex: 41,
        width: 320,
      }}
    >
      <input
        data-testid="link-href-input"
        placeholder="链接地址(如 https://…、file.md、文件夹路径)"
        value={hrefInput}
        autoFocus
        onChange={(e) => setHrefInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitLink();
          if (e.key === "Escape") setPanel(false);
        }}
        style={inputStyle}
      />
      {editingLink && (
        <input
          data-testid="link-text-input"
          placeholder="显示文本(留空保持原文)"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitLink();
            if (e.key === "Escape") setPanel(false);
          }}
          style={inputStyle}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {editingLink && (
            <button
              type="button"
              style={ghostBtn}
              onMouseDown={(e)=>e.preventDefault()} onClick={() => {
                engine?.applyLinkEdit("");
                setPanel(false);
                requestAnimationFrame(refresh);
              }}
            >
              移除链接
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={ghostBtn} onMouseDown={(e)=>e.preventDefault()} onClick={() => setPanel(false)}>
            取消
          </button>
          <button
            type="button"
            data-testid="link-commit"
            style={{ ...ghostBtn, background: "var(--accent-soft)", borderColor: "#9cc1e5" }}
            onMouseDown={(e)=>e.preventDefault()} onClick={commitLink}
          >
            {editingLink ? "更新" : "设置"}
          </button>
        </div>
      </div>
    </div>
  );

  const toolbarEl = (
    <div
      data-testid="format-toolbar"
      role="toolbar"
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 6px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,.12)",
        zIndex: 40,
      }}
    >
      {mode === "selection" && (
        <>
          <button
            type="button"
            title="加粗"
            aria-pressed={flags.bold}
            style={flags.bold ? activeBtn : btn}
            onMouseDown={(e)=>e.preventDefault()} onClick={() => {
              engine?.toggleBold();
              requestAnimationFrame(refresh);
            }}
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            title="斜体"
            aria-pressed={flags.italic}
            style={flags.italic ? activeBtn : btn}
            onMouseDown={(e)=>e.preventDefault()} onClick={() => {
              engine?.toggleItalic();
              requestAnimationFrame(refresh);
            }}
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            title="删除线"
            aria-pressed={flags.strike}
            style={flags.strike ? activeBtn : btn}
            onMouseDown={(e)=>e.preventDefault()} onClick={() => {
              engine?.toggleStrike();
              requestAnimationFrame(refresh);
            }}
          >
            <Strikethrough size={15} />
          </button>
        </>
      )}
      <button
        type="button"
        title={mode === "caret-link" ? "编辑链接" : "链接"}
        style={linkHref ? activeBtn : btn}
        onMouseDown={(e)=>e.preventDefault()} onClick={openPanel}
      >
        <LinkIcon size={15} />
      </button>
      {mode === "caret-link" && (
        <span
          style={{
            fontSize: 12,
            color: "var(--muted)",
            padding: "0 6px",
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {linkHref}
        </span>
      )}
      {mode === "selection" && (
        <button
          type="button"
          title="清除格式"
          style={btn}
          onMouseDown={(e)=>e.preventDefault()} onClick={() => {
            engine?.clearFormat();
            requestAnimationFrame(refresh);
          }}
        >
          <Eraser size={15} />
        </button>
      )}
    </div>
  );

  return panel ? panelEl : toolbarEl;
}
