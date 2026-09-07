// 查找面板(14/15):作用域「当前文件 / 整个工作区」;输入即实时匹配,
// 命中行摘要点击 → 打开/定位并高亮(decoration 临时态);Esc/✕ 关闭清除。

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Engine } from "../../../../packages/engine";
import type { WorkspaceSearchFileHit } from "@shared/ipc";

export type SearchScope = "file" | "workspace";

export interface SearchPanelProps {
  engine: Engine | null;
  /** 焦点请求计数(每次 +1 强制聚焦输入框)。 */
  focusRequest: number;
  initialScope?: SearchScope;
  /** 工作区根(整个工作区作用域可用时)。 */
  workspaceRoot?: string | null;
  /** 工作区命中跳转后待补写的文件内高亮(08:由面板在挂载清除后应用,
      消除 React 提交时机竞态)。 */
  jump?: { ranges: Array<{ from: number; to: number }>; active: number } | null;
  /** 打开并定位工作区命中文件(父层负责自动保存/高亮首个命中)。 */
  onOpenWorkspaceHit: (absPath: string, query: string) => void;
  onClose: () => void;
}

export function SearchPanel({
  engine,
  focusRequest,
  initialScope = "file",
  workspaceRoot,
  jump = null,
  onOpenWorkspaceHit,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [active, setActive] = useState(0);
  const [wsHits, setWsHits] = useState<WorkspaceSearchFileHit[]>([]);
  const [wsSearching, setWsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 上一作用域(ref;仅跨作用域时清文件高亮——hits 每次重算都清会把
      工作区命中的跳转高亮一并抹掉,08 修)。 */
  const prevScopeRef = useRef<SearchScope | null>(null);
  /** 树刷新节拍(工作区搜索重跑;state 而非 ref——ref 变化不触发 effect 重跑,24)。 */
  const [treeTick, setTreeTick] = useState(0);

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

  // 工作区作用域:防抖实时搜索;树更新时重跑(与监听同源,不建索引)
  useEffect(() => {
    if (scope !== "workspace" || !workspaceRoot || query.trim() === "") {
      setWsHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setWsSearching(true);
      void window.confidant.searchWorkspace(workspaceRoot, query).then((res) => {
        setWsHits(res.ok ? res.value : []);
        setWsSearching(false);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, scope, workspaceRoot, treeTick]);

  useEffect(() => {
    if (scope !== "workspace") return;
    return window.confidant.onWorkspaceTree(() => {
      setTreeTick((t) => t + 1);
    });
  }, [scope]);

  const applyActive = (index: number): void => {
    if (!engine || hits.length === 0) return;
    const idx = Math.min(Math.max(index, 0), hits.length - 1);
    setActive(idx);
    engine.setSearchHighlights(hits, idx);
    const hit = hits[idx];
    if (hit) engine.revealRange(hit.from, hit.to);
  };

  useEffect(() => {
    // 作用域离开 file 时清文件高亮;仅跨作用域时清(prevScope 判界),避免
    // 命中列表每次重算把「工作区跳转后补写的命中高亮」抹掉(08 修)
    const prev = prevScopeRef.current;
    prevScopeRef.current = scope;
    if (scope !== "file") {
      if (prev !== "workspace") engine?.clearSearchHighlights();
      return;
    }
    if (hits.length === 0) {
      engine?.clearSearchHighlights();
      return;
    }
    engine?.setSearchHighlights(hits, active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, hits.length]);

  // 工作区命中跳转高亮(08):声明于清除 effect 之后——同一提交内按声明序
  // 执行,挂载清除(scope≠file)先跑、此处补写后跑,顺序确定
  useEffect(() => {
    if (!jump || !engine) return;
    engine.setSearchHighlights(jump.ranges, jump.active);
    const first = jump.ranges[0];
    if (first) engine.revealRange(first.from, first.to);
  }, [jump, engine]);

  const summary = (text: string): string => text.replace(/\s+/g, " ").trim() || "(空行)";
  const fileHitsCount = hits.length;
  const wsCount = wsHits.reduce((n, f) => n + f.lines.length, 0);
  const empty = query.trim() !== "" && ((scope === "file" && fileHitsCount === 0) || (scope === "workspace" && wsCount === 0 && !wsSearching));

  return (
    <div
      data-testid="search-panel"
      style={{
        position: "fixed",
        top: 12,
        right: 14,
        width: 400,
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 3px 14px var(--overlay)",
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
              applyActive(active + (e.shiftKey ? -1 : 1));
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid var(--border)",
            outline: "none",
          }}
        />
        <button
          type="button"
          aria-label="关闭查找"
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 12px 8px" }}>
        {(["file", "workspace"] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`scope-${s}`}
            disabled={s === "workspace" && !workspaceRoot}
            onClick={() => setScope(s)}
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: scope === s ? "var(--accent)" : "var(--panel)",
              color: scope === s ? "var(--surface)" : "var(--quote-fg)",
            }}
          >
            {s === "file" ? "当前文件" : "整个工作区"}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span data-testid="search-count" style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
          {query.trim() === ""
            ? ""
            : wsSearching
              ? "搜索中…"
              : scope === "file"
                ? fileHitsCount > 0
                  ? `${fileHitsCount} 处命中`
                  : ""
                : wsCount > 0
                  ? `${wsHits.length} 个文件 / ${wsCount} 处`
                  : ""}
        </span>
      </div>
      <div style={{ overflowY: "auto", padding: "0 6px 8px" }}>
        {empty && (
          <div style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 13 }}>无结果</div>
        )}
        {scope === "file" &&
          hits.map((h, i) => (
            <button
              key={`${h.from}-${h.to}`}
              type="button"
              data-testid={`search-hit-row-${i}`}
              onClick={() => applyActive(i)}
              onMouseEnter={() => applyActive(i)}
              style={rowStyle(i === active)}
            >
              {summary(h.text)}
            </button>
          ))}
        {scope === "workspace" &&
          wsHits.map((f) => (
            <div key={f.path} style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--quote-fg)",
                  padding: "2px 6px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={f.relPath}
              >
                {f.name}
              </div>
              {f.lines.map((l) => (
                <button
                  key={`${f.path}:${l.line}`}
                  type="button"
                  data-testid="ws-hit-row"
                  onClick={() => onOpenWorkspaceHit(f.path, query)}
                  style={{ ...rowStyle(false), fontFamily: "Consolas, monospace", fontSize: 12 }}
                >
                  <span style={{ color: "var(--muted)", marginRight: 6, userSelect: "none" }}>{l.line}</span>
                  {summary(l.text)}
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function rowStyle(active: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: active ? "var(--tree-active-bg, var(--accent-soft))" : "transparent",
    padding: "4px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12.5,
    color: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}
