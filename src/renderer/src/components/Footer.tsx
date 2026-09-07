// 页脚状态条(04):底部 28px——左「专注模式/打字机」按钮(hover 浮现,06 接线)、
// 右字数常驻 + 光标段落类型;点击字数弹四口径明细浮层(选中口径持久化)。
// 统计文本源 = 引擎 textBetween 全文纯文本(不含语法字符);输入停顿 250ms 防抖。

import { useEffect, useMemo, useRef, useState } from "react";
import type { Engine } from "../../../../packages/engine";
import {
  blockTypeLabel,
  docStats,
  METRIC_LABELS,
  normalizeMetric,
  type DocStats,
  type WordCountMetric,
} from "../editor/doc-stats";

export interface FooterProps {
  engine: Engine | null;
  /** 文档内容/选区变化节拍(驱动统计与段落类型刷新)。 */
  tick: number;
  /** 有无文档(空态显示占位)。 */
  hasDoc: boolean;
  /** 06:专注/打字机模式状态与切换(页脚按钮入口)。 */
  focusMode: boolean;
  typewriterMode: boolean;
  onToggleFocus: () => void;
  onToggleTypewriter: () => void;
}

export function Footer({ engine, tick, hasDoc, focusMode, typewriterMode, onToggleFocus, onToggleTypewriter }: FooterProps) {
  const [metric, setMetric] = useState<WordCountMetric>("words");
  const [stats, setStats] = useState<DocStats>({ words: 0, chars: 0, paragraphs: 0, lines: 0 });
  const [blockType, setBlockType] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 启动载入持久化口径(选中口径重启保持)
  useEffect(() => {
    void (async () => {
      setMetric(normalizeMetric(await window.confidant.stateGet("wordCountMetric")));
    })();
  }, []);

  // 统计刷新:停顿 250ms 防抖(04:输入停顿 200–300ms)
  useEffect(() => {
    if (statsTimer.current) clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => {
      if (!engine || !hasDoc) {
        setStats({ words: 0, chars: 0, paragraphs: 0, lines: 0 });
        return;
      }
      const text = engine.textBetween(0, engine.docSize());
      setStats(docStats(text));
    }, 250);
    return () => {
      if (statsTimer.current) clearTimeout(statsTimer.current);
    };
  }, [engine, tick, hasDoc]);

  // 段落类型:实时跟随 selection(选区变化即刷新,不做防抖)
  useEffect(() => {
    const sync = (): void => {
      if (!hasDoc) {
        setBlockType(null);
        return;
      }
      const sel = window.getSelection();
      setBlockType(blockTypeLabel(sel?.anchorNode ?? null));
    };
    sync();
    document.addEventListener("selectionchange", sync);
    return () => document.removeEventListener("selectionchange", sync);
  }, [hasDoc, tick]);

  const metricLabel = useMemo(
    () => METRIC_LABELS.find((m) => m.id === metric)?.label ?? "字数",
    [metric],
  );
  const metricValue = stats[metric];

  return (
    <footer
      data-testid="status-footer"
      style={{
        height: 28,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "0 4px 0 6px",
        borderTop: "1px solid var(--footer-border)",
        background: "var(--app-bg)",
        fontSize: 12,
        userSelect: "none",
        position: "relative",
      }}
    >
      {/* 左:专注/打字机按钮(hover 浮现;激活态高亮,06 接线) */}
      <div
        data-testid="footer-modes"
        style={{ display: "flex", gap: 2, opacity: 0, transition: "opacity 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
      >
        {(
          [
            { id: "focus", label: "专注模式", on: focusMode, toggle: onToggleFocus },
            { id: "typewriter", label: "打字机", on: typewriterMode, toggle: onToggleTypewriter },
          ] as const
        ).map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid={`footer-mode-${b.id}`}
            aria-pressed={b.on}
            onClick={b.toggle}
            style={{
              padding: "2px 8px",
              fontSize: 12,
              border: "none",
              borderRadius: 4,
              background: b.on ? "var(--footer-btn-active)" : "transparent",
              color: b.on ? "#ffffff" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      {/* 右:段落类型 + 字数常驻 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {blockType && (
          <span data-testid="footer-block-type" style={{ color: "var(--muted)", opacity: 0.75 }}>
            {blockType}
          </span>
        )}
        <button
          type="button"
          data-testid="footer-word-count"
          onClick={() => setPopupOpen((v) => !v)}
          style={{
            padding: "2px 12px",
            fontSize: 12,
            border: "none",
            borderRadius: 4,
            background: popupOpen ? "var(--footer-btn-hover)" : "transparent",
            color: "inherit",
            opacity: 0.75,
            cursor: "pointer",
          }}
        >
          {hasDoc ? `${metricLabel} ${metricValue}` : ""}
        </button>
      </div>
      {/* 四口径明细浮层(04):选中行持久化 */}
      {popupOpen && hasDoc && (
        <div
          data-testid="word-count-popup"
          style={{
            position: "absolute",
            right: 8,
            bottom: 32,
            minWidth: 168,
            padding: "4px 0",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px var(--shadow)",
            zIndex: 70,
          }}
        >
          {METRIC_LABELS.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`wc-metric-${m.id}`}
              onClick={() => {
                setMetric(m.id);
                window.confidant.stateSet("wordCountMetric", m.id);
                setPopupOpen(false);
              }}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                width: "100%",
                padding: "3px 12px",
                border: "none",
                background: m.id === metric ? "var(--footer-btn-hover)" : "transparent",
                color: "inherit",
                fontSize: 12.5,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span>{m.label}</span>
              <span style={{ color: "var(--muted)" }}>{stats[m.id]}</span>
            </button>
          ))}
        </div>
      )}
    </footer>
  );
}
