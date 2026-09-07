// 代码块语言提取(反馈轮 01):doc 中 codeBlock 节点(文档序)↔ DOM pre 元素(文档序)
// 一一对应(与大纲滚动跟随同一 zip 假设:TipTap 块节点按序渲染)。
// 浮层标签读此数据(portal 渲染于编辑区之外,不受 PM 观察器影响)。

import type { ProseMirrorDoc } from "../../../../packages/engine";

/** 提取文档内全部 codeBlock 的语言(无语言 → null,与「无语言」态区分)。 */
export function codeBlockLanguages(doc: ProseMirrorDoc | null): Array<string | null> {
  if (!doc) return [];
  const out: Array<string | null> = [];
  doc.descendants((node) => {
    if (node.type.name === "codeBlock") {
      out.push(typeof node.attrs.language === "string" && node.attrs.language !== "" ? node.attrs.language : null);
    }
    return true;
  });
  return out;
}

/** 按 DOM pre 元素序号取语言(数量不一致时以 null 兜底)。 */
export function languageForPre(pre: HTMLElement, langs: Array<string | null>): string | null {
  const host = pre.closest("[data-testid='editor-prose']");
  if (!host) return null;
  const idx = [...host.querySelectorAll("pre")].indexOf(pre as HTMLPreElement);
  return idx >= 0 ? (langs[idx] ?? null) : null;
}
