// 代码块浮层(反馈轮 01,替代 28 的 CodeBlockActions):悬停代码块浮现——左上语言
// 标签(可点击切换语言)、右上复制按钮,同浮层同层级,不占内容流。
// 语言数据经引擎 getDoc() 按序 zip(portal 渲染于编辑区外,不受 PM 观察器影响);
// 语言切换 = 引擎 setCodeBlockLanguageAt(改 ``` 标记、进历史、自动保存)。

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Engine } from "../../../../packages/engine";
import { codeBlockLanguages, languageForPre } from "../editor/code-block-lang";
import { LangSelect } from "./LangSelect";

/** 剪贴板写入(反馈轮 01):navigator.clipboard 在非用户手势/权限被拒时抛异常,
 *  降级临时 textarea + execCommand 经典路径(产品级兜底,smoke 非真实点击场景必走)。 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CodeBlockOverlay({ engine }: { engine: Engine | null }) {
  const [pre, setPre] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; right: number } | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preRef = useRef<HTMLElement | null>(null);
  preRef.current = pre;
  /** 语言按钮自身(ref 量高:浮层上移贴块顶需要精确按钮高度)。 */
  const langBtnRef = useRef<HTMLButtonElement | null>(null);

  const place = useCallback(
    (el: HTMLElement) => {
      const scroll = el.closest("[data-testid='editor-scroll']");
      const sr = scroll?.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (!sr || r.width === 0) return;
      // 反馈轮 02:语言标签上移到代码块上方、底边贴住块顶(间隙 0),不再压行号
      const btnH = langBtnRef.current?.offsetHeight ?? 19;
      setPos({ top: r.top - sr.top - btnH, left: r.left - sr.left + 8, right: sr.right - r.right + 8 });
      // 语言:doc 按序 zip 当前 pre
      setLang(languageForPre(el, codeBlockLanguages(engine?.getDoc() ?? null)));
    },
    [engine],
  );

  useEffect(() => {
    const scroll = document.querySelector("[data-testid='editor-scroll']");
    if (!scroll) return;
    let current: HTMLElement | null = null;
    const sync = (): void => {
      if (current) place(current);
    };
    const onMove = (e: Event): void => {
      const target = (e as MouseEvent).target as Element | null;
      if (target?.closest("[data-testid='code-copy-btn'], [data-testid='code-lang-btn'], [data-testid='lang-select']")) return;
      const preEl = target?.closest(".editor-prose pre") as HTMLElement | null;
      if (preEl !== current) {
        current = preEl;
        setPre(preEl);
        setCopied(false);
        setPickerOpen(false);
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
      setPickerOpen(false);
    };
    scroll.addEventListener("mousemove", onMove);
    scroll.addEventListener("mouseleave", onLeave);
    scroll.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      scroll.removeEventListener("mousemove", onMove);
      scroll.removeEventListener("mouseleave", onLeave);
      scroll.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [place]);

  const doCopy = useCallback(async (): Promise<void> => {
    if (!pre) return;
    const code = pre.querySelector("code");
    if (!code) return;
    const clone = code.cloneNode(true) as HTMLElement;
    // 视图装饰剥离:行号列(纯源码不带行号;语言标签已不在内容流内)
    clone.querySelector(".code-linenums")?.remove();
    const ok = await writeClipboard(clone.textContent ?? "");
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } else {
      console.error("[code-block] copy failed");
    }
  }, [pre]);

  const switchLanguage = useCallback(
    (language: string) => {
      const el = preRef.current;
      if (!el || !engine) return;
      engine.setCodeBlockLanguageAt(el, language);
      setLang(language); // 反馈轮 02:切换后即时刷新按钮文案(此前要等下次 mousemove)
    },
    [engine],
  );

  const host = document.querySelector("[data-testid='editor-scroll']");
  if (!host || !pre || !pos) return null;
  return createPortal(
    <>
      {/* 语言标签(左上;点击弹出语言选择)。反馈轮 02:浮在代码块上方贴块顶,
          固定高 19px(place 估算基准),不再压行号 */}
      <button
        ref={langBtnRef}
        type="button"
        data-testid="code-lang-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const r = pre.getBoundingClientRect();
          setPickerAnchor({ x: r.left, y: r.top + 4 });
          setPickerOpen((v) => !v);
        }}
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          height: 19,
          boxSizing: "border-box",
          lineHeight: "15px",
          padding: "1px 8px",
          fontSize: 11.5,
          borderRadius: 4,
          border: "1px solid var(--toolbar-border)",
          background: "var(--surface)",
          color: "var(--lang-tag)",
          cursor: "pointer",
          zIndex: 12,
          opacity: 0.95,
        }}
      >
        {lang ?? "代码块"}
      </button>
      {/* 复制按钮(右上,交互保留:1.5s 已复制反馈) */}
      <button
        type="button"
        data-testid="code-copy-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void doCopy()}
        style={{
          position: "absolute",
          top: pos.top,
          right: pos.right,
          padding: "2px 10px",
          fontSize: 12,
          borderRadius: 5,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "inherit",
          cursor: "pointer",
          opacity: 0.92,
          zIndex: 12,
        }}
      >
        {copied ? "已复制" : "复制"}
      </button>
      {pickerOpen && pickerAnchor && (
        <LangSelect
          x={pickerAnchor.x}
          y={pickerAnchor.y}
          current={lang}
          languages={engine?.supportedLanguages() ?? []}
          onSelect={switchLanguage}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>,
    host,
  );
}
