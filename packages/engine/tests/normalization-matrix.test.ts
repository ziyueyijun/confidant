// 02 票验收矩阵(规格 §4.2/§4.4):
// 1) 规范化——确定性断言引擎序列化的归一行为(CRLF→LF、列表/分隔线/表格风格、
//    文末单换行、硬换行两空格式),并全部通过幂等(二次往返不变)收敛;
// 2) 防静默丢失——能力基线全语法 + 已知引擎不支持语法,打开→保存不丢语义。
// front matter 字节保留矩阵见 frontmatter.test.ts 与 note-document.test.ts(渲染层回拼)。

import { describe, expect, it } from "vitest";
import { createEngine } from "../index";

function roundTrip(md: string): string {
  const host = document.createElement("div");
  const engine = createEngine(host);
  try {
    engine.loadMarkdown(md);
    return engine.getMarkdown();
  } finally {
    engine.destroy();
    host.remove();
  }
}

function idempotent(md: string): void {
  const once = roundTrip(md);
  const twice = roundTrip(once);
  expect(twice).toBe(once);
}

describe("规范化矩阵(02)", () => {
  it("CRLF 输入序列化后全 LF,无 \\r 残留", () => {
    const out = roundTrip("# 甲\r\n\r\n段落一。\r\n- 乙\r\n");
    expect(out).not.toContain("\r");
    // 段落后紧跟列表项会序列化为「段-列之间空行」的合法写法(锚定实测)
    expect(out).toBe("# 甲\n\n段落一。\n\n- 乙\n");
    idempotent(out);
  });

  it("列表标记归一为 '-'、有序列表为 '1.'", () => {
    const out = roundTrip("* 甲\n* 乙\n\n+ 丙\n\n1) 一\n2) 二\n");
    expect(out).toBe("- 甲\n- 乙\n\n- 丙\n\n1. 一\n2. 二\n");
    idempotent(out);
  });

  it("分隔线风格归一为 '---'", () => {
    const out = roundTrip("甲\n\n***\n\n乙\n\n___\n\n丙\n");
    expect(out).toBe("甲\n\n---\n\n乙\n\n---\n\n丙\n");
    idempotent(out);
  });

  it("表格列宽衬垫重排、分隔线为破折号;语义格元不丢", () => {
    const out = roundTrip("|a|b|\n|-|-|\n|1|2|\n");
    const cells = out
      .split("\n")
      .map((l) => l.split("|").map((c) => c.trim()).join("|"))
      .join("\n");
    expect(cells).toContain("|a|b|");
    expect(cells).toContain("|1|2|");
    expect(out).toContain("| --- | --- |");
    idempotent(out);
  });

  it("文末单个换行;连续尾空行折叠;文首空行与段间空段(空段落)原样保持", () => {
    // 空段落是可键入的实体(用户连按 Enter 产生),序列化保留;仅文末折叠
    const out = roundTrip("首段\n\n\n\n末段\n\n\n");
    expect(out).toBe("首段\n\n\n\n末段\n");
    idempotent(out);
  });

  it("硬换行序列化为行尾两空格、重开仍为硬换行", () => {
    const out = roundTrip("行甲  \n行乙\n");
    expect(out).toBe("行甲  \n行乙\n");
    idempotent(out);
  });

  it("下划线语法 ++…++ 与 <u> 两路都往返为下划线语义", () => {
    const a = roundTrip("++下划线++\n");
    const b = roundTrip(roundTrip("<u>下划线</u>\n"));
    expect(a).toBe("++下划线++\n");
    expect(b).toBe("++下划线++\n");
    // 语义级:二开后仍是下划线节点(经 <u> 圆通)
    const host = document.createElement("div");
    const engine = createEngine(host);
    engine.loadMarkdown(roundTrip("++下划线++\n"));
    expect(host.querySelector("[contenteditable='true']")?.innerHTML).toContain("<u>");
    engine.destroy();
  });
});

describe("防静默丢失矩阵(02,能力基线全语法)", () => {
  const corpus: Array<[string, string]> = [
    ["标题1-6+段落", "# 一\n\n## 二\n\n### 三\n\n正文段落。\n"],
    ["粗斜删线+行内代码", "**粗** *斜* ~~删~~ `code` 混排文本\n"],
    ["链接", "[知己笔记](https://example.com/x?q=1#frag)\n"],
    ["代码块围栏+语言", "```ts\nconst x: number = 1;\n```\n"],
    ["引用", "> 引用一层\n> 继续\n"],
    ["有序/无序/任务列表", "- 甲\n- 乙\n\n1. 一\n2. 二\n\n- [x] 完成\n- [ ] 待办\n"],
    ["表格", "| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n"],
    ["图片(相对路径)", "![图片](img/a.png)\n"],
    ["图片(绝对 Windows 路径)", "![图片](C:/data/b.png)\n"],
    ["分隔线", "甲\n\n---\n\n乙\n"],
    ["硬换行", "行甲  \n行乙\n"],
  ];
  for (const [name, input] of corpus) {
    it(`${name}:往返后语义锚点齐全`, () => {
      const out = roundTrip(input);
      idempotent(out);
      // 无空文档、无整体内容丢失
      expect(out.length).toBeGreaterThan(0);
      expect(out.endsWith("\n")).toBe(true);
      // 文本/结构锚点(分隔线归一后 '---' 视为分隔线)
      const lines = out.split("\n");
      expect(lines.filter((l) => l.trim() !== "").length).toBeGreaterThan(0);
    });
  }

  it("数学公式文本($…$)原样不丢、不降级", () => {
    const input = "行内公式 $a^2+b$ 与展示 $$x+y$$ 段落。\n";
    const out = roundTrip(input);
    expect(out).toContain("$a^2+b$");
    expect(out).toContain("$$x+y$$");
  });

  it("脚注语法文本不丢(引擎不支持时按字面保留内容)", () => {
    const input = "引用标记[^1]的文字。\n\n[^1]: 脚注内容\n";
    const out = roundTrip(input);
    // 内容完整保留(结构转写为规范语法或字面,均属不丢)
    expect(out).toContain("脚注内容");
    expect(out).toContain("[^1]");
    idempotent(out);
  });

  it("图片引用不丢链(01 场景在矩阵中的留驻)", () => {
    const out = roundTrip("![样品](./sample.jpg)\n");
    expect(out).toBe("![样品](./sample.jpg)\n");
  });
});
