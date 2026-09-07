// 大纲数据 hook(03):doc 防抖重建 + 滚动跟随高亮(rAF 节流)。
// 重建依赖引擎 UI 节拍(tick);滚动跟随把 DOM h1-h6 与标题列表按文档序 zip
// (与语言标签同一可靠性假设:TipTap 块节点按序渲染)。

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Engine } from "../../../../packages/engine";
import { extractOutline, type OutlineItem } from "../editor/outline";

export interface OutlineState {
  items: OutlineItem[];
  /** 当前滚动位置应高亮的标题 pos(无 → null)。 */
  activePos: number | null;
}

/** 编辑内容变化(引擎 tick 递增,含编辑与选区)后防抖重建大纲。 */
export function useOutline(
  engine: Engine | null,
  tick: number,
  scrollRef: RefObject<HTMLDivElement | null>,
  debounceMs = 350,
): OutlineState {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // 防抖重建:doc 遍历 O(n),连续输入不抖(03:300–500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setItems(extractOutline(engine?.getDoc() ?? null));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [engine, tick, debounceMs]);

  // 滚动跟随:rAF 节流计算视口顶部当前标题(DOM zip;无 h1-h6 时无激活项)
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const compute = (): void => {
      const headings = [...scroll.querySelectorAll(".editor-prose :is(h1, h2, h3, h4, h5, h6)")];
      if (headings.length === 0 || items.length === 0) {
        setActivePos(null);
        return;
      }
      const viewTop = scroll.getBoundingClientRect().top + 2;
      let active: Element | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= viewTop) active = h;
        else break;
      }
      if (!active) {
        setActivePos(null);
        return;
      }
      // DOM 序 ↔ 大纲序一一对应(按序 zip;NodeList 无 indexOf,先转数组)
      const idx = [...headings].indexOf(active);
      setActivePos(items[idx]?.pos ?? null);
    };
    const onScroll = (): void => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    };
    compute();
    scroll.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroll.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null; // 不清空会导致重建后的滚动事件被守卫永久丢弃
      }
    };
  }, [items, scrollRef]);

  return { items, activePos };
}
