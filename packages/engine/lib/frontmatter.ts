// front matter 拆分(规格 §4.3:不解析、不利用、不改写;原样保留)。
// 纯文本函数,不依赖 DOM 与 TipTap,可独立测试。

export interface FrontMatterSplit {
  /**
   * 文件首部 front matter 的原始字节块(首行 `---` 起,含闭合行及其行终止符;
   * 无 front matter 时为 null)。CRLF 原样保留。
   */
  head: string | null;
  /** head 之后的正文(原样文本,未规范化)。无 front matter 时等于全文。 */
  body: string;
}

const FENCE = "---";

/** 行内容(剥离 \n 与 \r 后)是否为 `---` 围栏行。 */
function isFence(content: string): boolean {
  return content === FENCE;
}

/** 一行原始文本(含行终止符),剥离行终止符后的内容。 */
function lineContent(line: string): string {
  return line.replace(/\n$/, "").replace(/\r$/, "");
}

/**
 * 规则(与规格一致的最小启发,front matter 内容不解析):
 * - 文件以 `---` 行开头,且其后存在闭合 `---` 行 → 自文件首至闭合行(含其行终止符)
 *   为 head,其余为 body;head + body === 原文(字节级),回拼即原样;
 * - 只有开头、没有闭合 → 不当作 front matter(整体按正文,`---` 按分隔线语义);
 * - 闭合行取第一个匹配;head 的换行风格(CRLF/LF)原样保留。
 */
export function splitFrontMatter(text: string): FrontMatterSplit {
  // 首行(含终止符)整体取回,再剥终止符做围栏判断
  const firstEnd = text.indexOf("\n");
  const firstLineRaw = firstEnd === -1 ? text : text.slice(0, firstEnd + 1);
  if (!isFence(lineContent(firstLineRaw))) {
    return { head: null, body: text };
  }
  // 从第二行起找第一个闭合 `---` 行
  let cursor = firstLineRaw.length;
  while (cursor < text.length) {
    const nl = text.indexOf("\n", cursor);
    const lineEnd = nl === -1 ? text.length : nl + 1;
    const content = lineContent(text.slice(cursor, lineEnd));
    if (isFence(content)) {
      const head = text.slice(0, lineEnd);
      return { head, body: text.slice(lineEnd) };
    }
    cursor = lineEnd;
  }
  // 有开头无闭合:不当作 front matter
  return { head: null, body: text };
}
