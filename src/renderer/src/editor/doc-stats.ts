// 文档统计与光标段落类型(04):纯函数,页脚状态条数据源。
// 字数口径 = 中文字符数 + 英文单词数(不含空白);明细四口径:字数/字符/段落/行数。
// 文本来源 = 引擎 textBetween(0, docSize())(纯文本,不含 markdown 语法字符)。

/** 字数:中文按字(每个 CJK 字符 1)+ 英文按词(空白分隔的 token 含字母数字即 1,
 *  标点粘连不拆词,如 world!、v2.0 各 1),空白不计。 */
export function countWords(text: string): number {
  const cjk = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) ?? []).length;
  const latin = text.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
  return cjk + latin;
}

export interface DocStats {
  /** 字数(中文字符 + 英文单词)。 */
  words: number;
  /** 字符:非空白字符总数。 */
  chars: number;
  /** 段落:空行分隔的文本块数(空文档为 0)。 */
  paragraphs: number;
  /** 行数:换行分段(空文档为 0)。 */
  lines: number;
}

export function docStats(text: string): DocStats {
  const chars = text.replace(/\s/g, "").length;
  const lines = text === "" ? 0 : text.split("\n").length;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
  return { words: countWords(text), chars, paragraphs, lines };
}

export type WordCountMetric = "words" | "chars" | "paragraphs" | "lines";

export const METRIC_LABELS: ReadonlyArray<{ id: WordCountMetric; label: string }> = [
  { id: "words", label: "字数" },
  { id: "chars", label: "字符" },
  { id: "paragraphs", label: "段落" },
  { id: "lines", label: "行数" },
];

/** 持久化口径值 → 合法口径(非法/缺省回落 words)。 */
export function normalizeMetric(value: unknown): WordCountMetric {
  return METRIC_LABELS.some((m) => m.id === value) ? (value as WordCountMetric) : "words";
}

/** 光标所在块元素 → 段落类型标签(04 清单:标题 N/代码块/引用/列表/表格;正文为默认态 null)。
 *  文本锚点取父元素,元素锚点(空块光标,如 `<h1><br></h1>`)直接取自身。 */
export function blockTypeLabel(anchor: Node | null): string | null {
  if (!anchor) return null;
  const base =
    anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
  // 文本节点的块级祖先(PM 块节点即这些标签之一)
  const el = base?.closest?.("h1, h2, h3, h4, h5, h6, pre, blockquote, ul, ol, td, th");
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `标题 ${tag.slice(1)}`;
  if (tag === "pre") return "代码块";
  if (tag === "blockquote") return "引用";
  if (tag === "ul" || tag === "ol") return "列表";
  if (tag === "td" || tag === "th") return "表格";
  return null;
}
