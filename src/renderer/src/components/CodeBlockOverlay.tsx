// 代码块工具区(反馈轮 03):常驻代码块顶部——左上语言标签(可点击切换语言)、
// 右上复制按钮,位于代码块预留的工具区内(pre padding-top 38px 让位,占内容流,
// 行号从内容第 1 行开始编号);替代反馈轮 01 悬停浮层与 02 浮块外方案。
// 语言数据经引擎 getDoc() 按序 zip(portal 渲染于编辑区外,不受 PM 观察器影响);
// 语言切换 = 引擎 setCodeBlockLanguageAt(改 ``` 标记、进历史、自动保存)。
// 内容/滚动变化经 MutationObserver + rAF 合并重扫,浅比较跳过无变化重渲染。

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

/** 单个代码块的工具条定位与语言(相对编辑区滚动容器坐标)。 */
interface BlockTool {
  pre: HTMLElement;
  top: number;
  left: number;
  right: number;
  lang: string | null;
}

export function CodeBlockOverlay({ engine }: { engine: Engine | null }) {
  const [tools, setTools] = useState<BlockTool[]>([]);
  const lastRef = useRef<BlockTool[] | null>(null);

  const scan = useCallback((): void => {
    const scroll = document.querySelector("[data-testid='editor-scroll']");
    if (!scroll) return;
    const sr = scroll.getBoundingClientRect();
    const pres = [...scroll.querySelectorAll(".editor-prose pre")] as HTMLElement[];
    const langs = codeBlockLanguages(engine?.getDoc() ?? null);
    const next: BlockTool[] = pres.map((pre, i) => {
      const r = pre.getBoundingClientRect();
      return {
        pre,
        top: r.top - sr.top,
        left: r.left - sr.left,
        right: sr.right - r.right,
        lang: languageForPre(pre, langs),
      };
    });
    // 浅比较:结构/位置/语言均未变时不重渲染(打字时每击键都触发 observer)
    const last = lastRef.current;
    const same =
      last !== null &&
      last.length === next.length &&
      last.every((t, i) => t.pre === next[i]!.pre && t.top === next[i]!.top && t.left === next[i]!.left && t.right === next[i]!.right && t.lang === next[i]!.lang);
    if (same) return;
    lastRef.current = next;
    setTools(next);
  }, [engine]);

  useEffect(() => {
    const prose = document.querySelector("[data-testid='editor-prose']");
    if (!prose) return;
    scan();
    // rAF 合并:避免编辑时每击键同步 reflow(getBoundingClientRect)
    let scheduled = false;
    const schedule = (): void => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(prose, { childList: true, subtree: true });
    const scroll = document.querySelector("[data-testid='editor-scroll']");
    scroll?.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      mo.disconnect();
      scroll?.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [scan]);

  const host = document.querySelector("[data-testid='editor-scroll']");
  if (!host || tools.length === 0) return null;
  return createPortal(
    <>
      {tools.map((t, i) => (
        <CodeBlockTools key={i} tool={t} engine={engine} />
      ))}
    </>,
    host,
  );
}

/** 单个代码块的工具条:语言标签(左)+ 复制按钮(右),位于 pre 顶部工具区内。 */
function CodeBlockTools({ tool, engine }: { tool: BlockTool; engine: Engine | null }) {
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pre, top, left, right, lang } = tool;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const doCopy = useCallback(async (): Promise<void> => {
    const code = pre.querySelector("code");
    if (!code) return;
    const clone = code.cloneNode(true) as HTMLElement;
    // 视图装饰剥离:行号列(纯源码不带行号;工具区在 pre padding 内,不在内容流)
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

  return (
    <>
      {/* 语言标签(左上;点击弹出语言选择)。切换后经 observer 重扫刷新文案 */}
      <button
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
          top: top + 8,
          left: left + 8,
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
          top: top + 8,
          right: right + 8,
          padding: "2px 10px",
          fontSize: 12,
          borderRadius: 5,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "inherit",
          cursor: "pointer",
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
          onSelect={(l) => {
            engine?.setCodeBlockLanguageAt(pre, l);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
