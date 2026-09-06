// front matter 拆分规则测试(规格 §4.3 原样保留;02 票补测场景的纯函数部分先立)。

import { describe, expect, it } from "vitest";
import { splitFrontMatter } from "../index";

describe("splitFrontMatter", () => {
  it("LF 普通文档:识别 head 含闭合行终止符,body 从下一行开始,拼接还原原文", () => {
    const text = "---\ntitle: 周报\ndate: 2026-09-06\n---\n正文第一行\n";
    const { head, body } = splitFrontMatter(text);
    expect(head).toBe("---\ntitle: 周报\ndate: 2026-09-06\n---\n");
    expect(body).toBe("正文第一行\n");
    expect(head! + body).toBe(text);
  });

  it("无 front matter 的普通文档:head 为 null,body 即全文", () => {
    const text = "# 标题\n\n正文。\n";
    const { head, body } = splitFrontMatter(text);
    expect(head).toBeNull();
    expect(body).toBe(text);
  });

  it("多行/中文/嵌套引号的 YAML 内容原样保留(不解析)", () => {
    const text = [
      "---",
      "title: \"带引号:冒号的标题\"",
      "tags:",
      "  - 中文甲",
      "  - 'b'",
      "notes: |",
      "  多行文本",
      "  ---",
      "---",
      "",
      "# 正文",
      "",
    ].join("\n");
    const { head, body } = splitFrontMatter(text);
    expect(head).toBe(
      "---\ntitle: \"带引号:冒号的标题\"\ntags:\n  - 中文甲\n  - 'b'\nnotes: |\n  多行文本\n  ---\n---\n",
    );
    expect(body).toBe("\n# 正文\n");
  });

  it("CRLF 文档:head 字节原样保留 CRLF,拼接还原", () => {
    const text = "---\r\ntitle: 甲\r\n---\r\n正文\r\n";
    const { head, body } = splitFrontMatter(text);
    expect(head).toBe("---\r\ntitle: 甲\r\n---\r\n");
    expect(body).toBe("正文\r\n");
    expect(head! + body).toBe(text);
  });

  it("空 front matter(立即闭合):head 含两个围栏,body 为空", () => {
    const text = "---\n---\n";
    const { head, body } = splitFrontMatter(text);
    expect(head).toBe("---\n---\n");
    expect(body).toBe("");
  });

  it("有开头无闭合:不当作 front matter(整体按正文)", () => {
    const text = "---\n这是分隔线场景\n# 标题\n";
    const { head, body } = splitFrontMatter(text);
    expect(head).toBeNull();
    expect(body).toBe(text);
  });

  it("front matter 是最后一块(文件以闭合行结尾无换行)", () => {
    const text = "---\nx: 1\n---";
    const { head, body } = splitFrontMatter(text);
    expect(head).toBe("---\nx: 1\n---");
    expect(body).toBe("");
  });

  it("空文件与无内容边界", () => {
    expect(splitFrontMatter("")).toEqual({ head: null, body: "" });
    expect(splitFrontMatter("---\n")).toEqual({ head: null, body: "---\n" });
  });
});
