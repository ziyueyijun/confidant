// 代码块快速复制(28):悬停代码块右上角出现「复制」按钮。
// 事件委托于编辑区滚动容器;按钮 portal 到滚动容器内(PM 视图外),
// 位置按 pre 矩形换算;复制取 code 文本并排除行号列(纯源码,不带行号)。

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const btnStyle: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 8,
  padding: "2px 10px",
  fontSize: 12,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  cursor: "pointer",
  opacity: 0.92,
  zIndex: 10,
};

export function CodeBlockActions() {
  const [pre, setPre] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback((el: HTMLElement) => {
    const scroll = el.closest("[data-testid='editor-scroll']");
    const sr = scroll?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!sr || r.width === 0) return;
    // 只定位 top;水平贴 right(8)即可——同时设 left 会把按钮拉伸成整宽
    setPos({ top: r.top - sr.top + 6 });
  }, []);

  useEffect(() => {
    const scroll = document.querySelector("[data-testid='editor-scroll']");
    if (!scroll) return;
    let current: HTMLElement | null = null;
    const sync = (): void => {
      if (current) place(current);
    };
    const onMove = (e: Event): void => {
      const target = (e as MouseEvent).target as Element | null;
      if (target?.closest("[data-testid='code-copy-btn']")) return;
      const preEl = target?.closest(".editor-prose pre") as HTMLElement | null;
      if (preEl !== current) {
        current = preEl;
        setPre(preEl);
        setCopied(false);
        if (preEl) place(preEl);
      } else if (preEl) {
        place(preEl);
      }
    };
    const onLeave = (e: Event): void => {
      const to = (e as MouseEvent).relatedTarget as Element | null;
      if (to && scroll.contains(to)) return;
      current = null;
      setPre(null);
      setPos(null);
    };
    scroll.addEventListener("mousemove", onMove);
    scroll.addEventListener("mouseleave", onLeave);
    scroll.addEventListener("scroll", sync, true);
    return () => {
      scroll.removeEventListener("mousemove", onMove);
      scroll.removeEventListener("mouseleave", onLeave);
      scroll.removeEventListener("scroll", sync, true);
    };
  }, [place]);

  const doCopy = useCallback(async (): Promise<void> => {
    if (!pre) return;
    const code = pre.querySelector("code");
    if (!code) return;
    const clone = code.cloneNode(true) as HTMLElement;
    clone.querySelector(".code-linenums")?.remove();
    try {
      await navigator.clipboard.writeText(clone.textContent ?? "");
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("[code-block] copy failed:", err);
    }
  }, [pre]);

  const host = document.querySelector("[data-testid='editor-scroll']");
  if (!host || !pre || !pos) return null;
  return createPortal(
    <button
      type="button"
      data-testid="code-copy-btn"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void doCopy()}
      style={{ ...btnStyle, top: pos.top }}
    >
      {copied ? "已复制" : "复制"}
    </button>,
    host,
  );
}
