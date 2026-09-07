// 代码块语言选择浮层(反馈轮 01):点击语言标签弹出——输入框过滤 + 语言列表
// (引擎 supportedLanguages 主名集)+「无语言」项;手输任意名字回车亦生效
// (别名如 js/ts 引擎按 registered 判定高亮)。

import { useEffect, useMemo, useRef, useState } from "react";

export interface LangSelectProps {
  /** 锚点(相对视口)。 */
  x: number;
  y: number;
  current: string | null;
  languages: string[];
  onSelect: (lang: string) => void;
  onClose: () => void;
}

export function LangSelect({ x, y, current, languages, onSelect, onClose }: LangSelectProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onDocMouseDown = (e: MouseEvent): void => {
      const t = e.target as Element | null;
      if (t && !t.closest("[data-testid='lang-select']")) onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    const starts = languages.filter((l) => l.toLowerCase().startsWith(q));
    const contains = languages.filter((l) => l.toLowerCase().includes(q) && !starts.includes(l));
    return [...starts, ...contains];
  }, [query, languages]);

  const commit = (lang: string): void => {
    onSelect(lang);
    onClose();
  };

  return (
    <div
      data-testid="lang-select"
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 80,
        width: 220,
        maxHeight: 280,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 4px 16px var(--shadow)",
        overflow: "hidden",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <input
        ref={inputRef}
        data-testid="lang-select-input"
        placeholder="语言(如 js / python)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) commit(query.trim());
        }}
        style={{
          margin: 8,
          padding: "5px 8px",
          fontSize: 12.5,
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--input-bg)",
          color: "inherit",
          outline: "none",
        }}
      />
      <div style={{ overflowY: "auto", padding: "0 4px 6px" }}>
        <button
          type="button"
          data-testid="lang-none"
          onClick={() => commit("")}
          style={rowStyle(current === null)}
        >
          无语言
        </button>
        {filtered.slice(0, 60).map((l) => (
          <button
            key={l}
            type="button"
            data-testid={`lang-option-${l}`}
            onClick={() => commit(l)}
            style={rowStyle(current === l)}
          >
            {l}
          </button>
        ))}
        {query.trim() && !languages.includes(query.trim()) && (
          <button type="button" data-testid="lang-custom" onClick={() => commit(query.trim())} style={rowStyle(false)}>
            使用「{query.trim()}」
          </button>
        )}
      </div>
    </div>
  );
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "3px 10px",
    fontSize: 12.5,
    border: "none",
    borderRadius: 4,
    background: active ? "var(--tree-active-bg)" : "transparent",
    color: "inherit",
    cursor: "pointer",
  };
}
