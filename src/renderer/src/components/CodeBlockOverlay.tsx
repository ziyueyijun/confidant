// 代码块工具区(反馈轮 05):语言标签(左)+ 复制按钮(右)经 PM 装饰容器
// (.code-tools widget,引擎层插入 pre 内)内嵌代码块顶部工具区——按钮长在
// 代码块上,滚动天然跟随零重算(替代反馈轮 03 的 absolute 坐标跟随:
// 滚动滞后一帧「跳」、front matter 块偏移「有的代码块没有」)。
// 语言数据经引擎 getDoc() 按序 zip;语言切换 = setCodeBlockLanguageAt
// (改 ``` 标记、进历史、自动保存)。

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Engine } from "../../../../packages/engine";
import { codeBlockLanguages } from "../editor/code-block-lang";
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
  const [containers, setContainers] = useState<HTMLElement[]>([]);
  const [langs, setLangs] = useState<(string | null)[]>([]);
  const lastRef = useRef<{ els: HTMLElement[]; langs: (string | null)[] } | null>(null);

  const scan = useCallback((): void => {
    const host = document.querySelector("[data-testid='editor-scroll']");
    if (!host) return;
    const els = [...host.querySelectorAll(".editor-prose pre .code-tools")] as HTMLElement[];
    const nextLangs = codeBlockLanguages(engine?.getDoc() ?? null);
    // 浅比较:结构/语言未变不重渲染(打字时每击键都触发 observer)
    const last = lastRef.current;
    const same =
      last !== null &&
      last.els.length === els.length &&
      last.els.every((el, i) => el === els[i]!) &&
      last.langs.length === nextLangs.length &&
      last.langs.every((l, i) => l === nextLangs[i]!);
    if (same) return;
    lastRef.current = { els, langs: nextLangs };
    setContainers(els);
    setLangs(nextLangs);
  }, [engine]);

  useEffect(() => {
    const host = document.querySelector("[data-testid='editor-scroll']");
    if (!host) return;
    scan();
    // rAF 合并:结构/语言变化重扫(编辑时每击键触发 observer,合并到每帧一次)
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
    mo.observe(host, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [scan]);

  if (containers.length === 0) return null;
  return (
    <>
      {containers.map((container, i) => (
        <CodeBlockTools key={i} container={container} lang={langs[i] ?? null} engine={engine} />
      ))}
    </>
  );
}

/** 单个代码块的工具条:语言标签(左)+ 复制按钮(右),portal 进 .code-tools 容器。 */
function CodeBlockTools({ container, lang, engine }: { container: HTMLElement; lang: string | null; engine: Engine | null }) {
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pre = container.closest("pre");

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const doCopy = useCallback(async (): Promise<void> => {
    const code = pre?.querySelector("code");
    if (!code) return;
    const clone = code.cloneNode(true) as HTMLElement;
    // 视图装饰剥离:行号列 + 工具条容器(纯源码不带行号/按钮文字)
    clone.querySelector(".code-linenums")?.remove();
    clone.querySelector(".code-tools")?.remove();
    const ok = await writeClipboard(clone.textContent ?? "");
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } else {
      console.error("[code-block] copy failed");
    }
  }, [pre]);

  return createPortal(
    <>
      {/* 语言标签(左;点击弹出语言选择)。切换后经 observer 重扫刷新文案 */}
      <button
        type="button"
        data-testid="code-lang-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const r = pre?.getBoundingClientRect();
          if (!r) return;
          setPickerAnchor({ x: r.left, y: r.top + 4 });
          setPickerOpen((v) => !v);
        }}
        style={{
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
      {/* 复制按钮(右,交互保留:1.5s 已复制反馈) */}
      <button
        type="button"
        data-testid="code-copy-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void doCopy()}
        style={{
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
            if (pre) engine?.setCodeBlockLanguageAt(pre, l);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>,
    container,
  );
}
