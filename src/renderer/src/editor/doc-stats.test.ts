import { describe, expect, it } from "vitest";
import { blockTypeLabel, countWords, docStats, normalizeMetric } from "./doc-stats";

describe("countWords(04:中文按字 + 英文按词)", () => {
  it("中文字符每个计 1(不含空白)", () => {
    expect(countWords("知己笔记 最懂你")).toBe(7);
  });

  it("英文按连续字母数字串计词(含连字符/撇号)", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("don't stop won't-stop")).toBe(3); // don't/stop/won't-stop 各 1
    expect(countWords("v2.0 test123")).toBe(2);
  });

  it("中英混排相加;标点/空白不计", () => {
    expect(countWords("你好 world! 再见，朋友。")).toBe(2 + 1 + 4);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords("")).toBe(0);
  });
});

describe("docStats(04:四口径)", () => {
  it("字数/字符/段落/行数口径一致", () => {
    const text = "标题 1\n\n正文一段。\n第二行\n\n第三段 world";
    const s = docStats(text);
    expect(s.words).toBe(14); // 标题(2)+1+正文一段。(4)+第二行(3)+第三段(3)+world(1)
    expect(s.chars).toBe("标题1正文一段。第二行第三段world".length);
    expect(s.paragraphs).toBe(3);
    expect(s.lines).toBe(6); // split("\n") 段数
  });

  it("空文档全为 0", () => {
    expect(docStats("")).toEqual({ words: 0, chars: 0, paragraphs: 0, lines: 0 });
  });
});

describe("blockTypeLabel(04:段落类型映射)", () => {
  function mount(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  it("标题 → 标题 N", () => {
    const host = mount("<h3>标题</h3>");
    const tn = host.querySelector("h3")!.firstChild!;
    expect(blockTypeLabel(tn)).toBe("标题 3");
  });

  it("代码块/引用/列表/表格各自映射", () => {
    const host = mount(
      "<pre><code>x</code></pre><blockquote>q</blockquote><ul><li>l</li></ul><table><tr><td>t</td></tr></table>",
    );
    expect(blockTypeLabel(host.querySelector("pre code")!.firstChild!)).toBe("代码块");
    expect(blockTypeLabel(host.querySelector("blockquote")!.firstChild!)).toBe("引用");
    expect(blockTypeLabel(host.querySelector("li")!.firstChild!)).toBe("列表");
    expect(blockTypeLabel(host.querySelector("td")!.firstChild!)).toBe("表格");
  });

  it("正文/非文本节点 → null(默认态)", () => {
    const host = mount("<p>正文</p>");
    expect(blockTypeLabel(host.querySelector("p")!.firstChild!)).toBeNull();
    expect(blockTypeLabel(null)).toBeNull();
    expect(blockTypeLabel(host.querySelector("p"))).toBeNull(); // 元素锚点在正文块
  });

  it("空块光标(元素锚点)→ 块类型仍识别(审查修)", () => {
    const host = mount("<h3><br></h3>");
    expect(blockTypeLabel(host.querySelector("h3"))).toBe("标题 3");
    const host2 = mount("<p><br></p>");
    expect(blockTypeLabel(host2.querySelector("p"))).toBeNull(); // 空正文 → 默认态
  });
});

describe("normalizeMetric(04:口径持久化)", () => {
  it("合法口径原样返回;非法/缺省回落 words", () => {
    expect(normalizeMetric("chars")).toBe("chars");
    expect(normalizeMetric("lines")).toBe("lines");
    expect(normalizeMetric("bogus")).toBe("words");
    expect(normalizeMetric(null)).toBe("words");
    expect(normalizeMetric(undefined)).toBe("words");
  });
});
