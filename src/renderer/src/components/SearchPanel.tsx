// 查找面板(14/15 → 05):Typora 式顶部通栏——作用域 76px 下拉 + 26px 直角输入框;
// 行为全保留(当前文件实时匹配、工作区 180ms 防抖、Enter 下一个/Shift+Enter 上一个/
// Esc 关闭并清除高亮);命中高亮琥珀 + 当前项黑底白字(CSS 变量,01 落地)。

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Engine } from "../../../../packages/engine";
import type { WorkspaceSearchFileHit } from "@shared/ipc";
import { DropdownSelect } from "./DropdownSelect";

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
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--app-bg)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 2px 10px var(--shadow)",
        fontSize: 12,
      }}
    >
      {/* 顶部通栏行(05:约 39px 高;输入框 26px 直角透明;作用域 76px 下拉) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px 6px", maxHeight: 39 }}>
        <DropdownSelect
          value={scope}
          options={[
            { value: "file", label: "当前文件" },
            { value: "workspace", label: "整个工作区", disabled: !workspaceRoot },
          ]}
          onSelect={(v) => setScope(v as SearchScope)}
          ariaLabel="搜索范围"
          testId="search-scope-select"
          itemTestIdPrefix="scope"
          disabled={scope === "workspace" && !workspaceRoot}
          buttonStyle={{ width: 76, flexShrink: 0, height: 26, fontSize: 12 }}
        />
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
            minWidth: 0,
            height: 26,
            padding: "0 8px",
            fontSize: 12,
            border: "none",
            borderRadius: 0, // 05:直角(基线 §4.2)
            background: "transparent",
            outline: "none",
            color: "inherit",
          }}
        />
        <span
          data-testid="search-count"
          style={{ color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}
        >
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
        <button
          type="button"
          aria-label="关闭查找"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--muted)",
            padding: "2px 6px",
            fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>
      {/* 命中列表(05:顶部条下方展开) */}
      {query.trim() !== "" && (
        <div style={{ overflowY: "auto", maxHeight: "45vh", padding: "0 6px 8px", borderTop: "1px solid var(--border)" }}>
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
                    style={{ ...rowStyle(false), fontFamily: "var(--font-code)", fontSize: 12 }}
                  >
                    <span style={{ color: "var(--muted)", marginRight: 6, userSelect: "none" }}>{l.line}</span>
                    {summary(l.text)}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
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
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12.5,
    color: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}
