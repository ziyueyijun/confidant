// 文档模型纯函数测试(拆/拼/文末换行兜底)。

import { describe, expect, it } from "vitest";
import { composeNoteText, ensureSingleTrailingNewline, parseNoteText } from "./note-document";

describe("parseNoteText / composeNoteText", () => {
  it("带 front matter 的文档:拆出 head,回拼保留 head 字节原样", () => {
    const text = "---\ntitle: 周报\n---\n# 标题\n";
    const doc = parseNoteText(text);
    expect(doc.head).toBe("---\ntitle: 周报\n---\n");
    expect(doc.bodyMd).toBe("# 标题\n");
    const composed = composeNoteText({ ...doc, bodyMd: "# 标题" });
    expect(composed).toBe(text);
  });

  it("无 front matter:正文即全文", () => {
    const doc = parseNoteText("一行\n");
    expect(doc.head).toBeNull();
    expect(doc.bodyMd).toBe("一行\n");
  });

  it("回拼强制单个换行结尾(多尾换行折叠)", () => {
    expect(composeNoteText({ head: null, bodyMd: "正文" })).toBe("正文\n");
    expect(composeNoteText({ head: null, bodyMd: "正文\n\n\n" })).toBe("正文\n");
    expect(composeNoteText({ head: "---\n---\n", bodyMd: "" })).toBe("---\n---\n\n");
  });
});

describe("ensureSingleTrailingNewline", () => {
  it("空串保持空串(空文档序列化边界)", () => {
    expect(ensureSingleTrailingNewline("")).toBe("\n");
  });
  it("无尾换行补一个;多尾换行折叠为一个", () => {
    expect(ensureSingleTrailingNewline("abc")).toBe("abc\n");
    expect(ensureSingleTrailingNewline("abc\n\n\n")).toBe("abc\n");
  });
  it("不触碰行尾两空格(硬换行语义)", () => {
    expect(ensureSingleTrailingNewline("甲  \n乙")).toBe("甲  \n乙\n");
  });
});
