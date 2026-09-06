// 笔记文档模型:front matter 头 + 正文 markdown 的解析与回拼(渲染层)。
// 纯函数;拆/拼语义来自 packages/engine 的 splitFrontMatter。

import { finalizeMarkdown, splitFrontMatter } from "../../../../packages/engine";

export interface NoteDocument {
  /** front matter 原始块(无则 null);字节原样,回拼不触碰。 */
  head: string | null;
  /** 正文 markdown(引擎序列化结果或原文)。 */
  bodyMd: string;
}

/** 打开文件文本 → 文档模型(拆 front matter)。 */
export function parseNoteText(text: string): NoteDocument {
  const { head, body } = splitFrontMatter(text);
  return { head, bodyMd: body };
}

/** 回拼保存文本:head 原样 + 规范化正文;整体以单个换行结尾。 */
export function composeNoteText(doc: NoteDocument): string {
  return (doc.head ?? "") + finalizeMarkdown(doc.bodyMd);
}

/** 单一实现已上收 packages/engine.finalizeMarkdown(24);旧名别名保留。 */
export { finalizeMarkdown as ensureSingleTrailingNewline };
