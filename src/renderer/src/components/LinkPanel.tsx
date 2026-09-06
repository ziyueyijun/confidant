// 链接面板(29):插入/修改链接的独立弹层(原浮动工具条内的链接编辑拆出,07)。
// 触发:菜单「格式 → 链接」(Ctrl+K)与光标停在链接内时 Ctrl+K;打开时按
// 选区/光标上下文预填(链接内 → 编辑态;选区含链接 → 预填地址)。
// 提交走引擎 applyLinkEdit(有链接上下文更新,无则插入/包裹);移除链接保留;
// 关闭/提交后焦点归还编辑器。

import { useEffect, useRef, useState } from "react";
import type { Engine } from "../../../../packages/engine";

export interface LinkPanelProps {
  engine: Engine | null;
  /** 递增触发强制打开(菜单命令入口)。 */
  openLinkRequest: number;
}

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

export function LinkPanel({ engine, openLinkRequest }: LinkPanelProps) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const lastRequest = useRef(0);

  useEffect(() => {
    if (openLinkRequest === lastRequest.current) return;
    lastRequest.current = openLinkRequest;
    const ed = engine;
    if (!ed) return;
    // 预填:光标在链接内 → 编辑态(地址 + 显示文本);选区含链接 → 仅地址
    const info = ed.linkRangeAtSelection();
    const selHref = ed.linkHrefInSelection();
    setEditing(!!info || !!selHref);
    setHref(info?.href ?? selHref ?? "");
    setText(info ? ed.textBetween(info.from, info.to) : "");
    setOpen(true);
  }, [openLinkRequest, engine]);

  const close = (): void => {
    setOpen(false);
    engine?.focus();
  };

  const commit = (): void => {
    if (!engine) return;
    engine.applyLinkEdit(href.trim(), editing ? text : undefined);
    close();
  };

  if (!open || !engine) return null;
  return (
    <div
      data-testid="link-panel"
      style={{
        position: "fixed",
        left: "50%",
        top: 96,
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,.12)",
        zIndex: 60,
        width: 340,
      }}
    >
      <input
        data-testid="link-href-input"
        placeholder="链接地址(如 https://…、file.md、文件夹路径)"
        value={href}
        autoFocus
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") close();
        }}
        style={inputStyle}
      />
      {editing && (
        <input
          data-testid="link-text-input"
          placeholder="显示文本(留空保持原文)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") close();
          }}
          style={inputStyle}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {editing && (
            <button
              type="button"
              style={ghostBtn}
              onClick={() => {
                engine.applyLinkEdit("");
                close();
              }}
            >
              移除链接
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={ghostBtn} onClick={close}>
            取消
          </button>
          <button
            type="button"
            data-testid="link-commit"
            style={{ ...ghostBtn, background: "var(--accent-soft)", borderColor: "#9cc1e5" }}
            onClick={commit}
          >
            {editing ? "更新" : "设置"}
          </button>
        </div>
      </div>
    </div>
  );
}
