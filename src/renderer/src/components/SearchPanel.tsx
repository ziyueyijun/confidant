// 查找面板(14 当前文件;15 将加工作区作用域)。输入即实时子串匹配,
// 命中行摘要点击 → 滚动定位并高亮(decoration 临时态);Esc/按钮关闭清除。

import { useEffect, useMemo, useRef, useState } from "react";
import type { Engine } from "../../../../packages/engine";

export interface SearchPanelProps {
  engine: Engine | null;
  /** 焦点请求计数(每次 +1 强制聚焦输入框)。 */
  focusRequest: number;
  onClose: () => void;
}

export function SearchPanel({ engine, focusRequest, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  const hits = useMemo(() => {
    if (!engine || query.trim() === "") return [];
    return engine.findInDoc(query);
  }, [engine, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const applyActive = (index: number): void => {
    if (!engine || hits.length === 0) return;
    const idx = Math.min(Math.max(index, 0), hits.length - 1);
    setActive(idx);
    engine.setSearchHighlights(hits, idx);
    const hit = hits[idx];
    if (hit) engine.revealRange(hit.from, hit.to);
  };

  useEffect(() => {
    if (hits.length === 0) {
      engine?.clearSearchHighlights();
      return;
    }
    engine?.setSearchHighlights(hits, active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits.length]);

  const summary = (text: string): string => text.replace(/\s+/g, " ").trim() || "(空行)";

  return (
    <div
      data-testid="search-panel"
      style={{
        position: "fixed",
        top: 44,
        right: 14,
        width: 380,
        maxHeight: "55vh",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        border: "1px solid #d5d5d5",
        borderRadius: 8,
        boxShadow: "0 3px 14px rgba(0,0,0,.15)",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
        <input
          ref={inputRef}
          data-testid="search-input"
          placeholder="搜索笔记…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const delta = e.shiftKey ? -1 : 1;
              applyActive(active + delta);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid #c5c5c5",
            outline: "none",
          }}
        />
        <button
          type="button"
          aria-label="关闭查找"
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#999",
          padding: "0 12px 6px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>当前文件</span>
        <span data-testid="search-count">
          {query.trim() === "" ? "" : hits.length > 0 ? `${hits.length} 处命中` : "无结果"}
        </span>
      </div>
      <div style={{ overflowY: "auto", padding: "0 6px 8px" }}>
        {query.trim() !== "" && hits.length === 0 && (
          <div style={{ padding: "10px 8px", color: "#b0b0b0", fontSize: 13 }}>无结果</div>
        )}
        {hits.map((h, i) => (
          <button
            key={`${h.from}-${h.to}`}
            type="button"
            data-testid={`search-hit-row-${i}`}
            onClick={() => applyActive(i)}
            onMouseEnter={() => applyActive(i)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "none",
              background: i === active ? "var(--tree-active-bg, #e3edf7)" : "transparent",
              padding: "5px 8px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12.5,
              color: "inherit",
            }}
          >
            {summary(h.text)}
          </button>
        ))}
      </div>
    </div>
  );
}
