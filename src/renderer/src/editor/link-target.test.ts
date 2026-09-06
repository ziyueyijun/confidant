// 链接目标分类测试(16:分流规则 + 锚点解析)。

import { describe, expect, it } from "vitest";
import { classifyLink } from "./link-target";

const DOC = "C:/notes/sub/周报.md";
const WS = "C:/notes";

describe("classifyLink", () => {
  it("http(s)/mailto → web", () => {
    expect(classifyLink(DOC, WS, "https://example.com/a?x=1#frag")).toMatchObject({
      kind: "web",
      hrefPath: "https://example.com/a?x=1#frag",
    });
    expect(classifyLink(DOC, WS, "mailto:a@b.c")).toMatchObject({ kind: "web" });
  });

  it("工作区内 .md 相对/绝对 → note(带 relPath 与锚点)", () => {
    const t = classifyLink(DOC, WS, "../笔记/日志.md#上周小结");
    expect(t.kind).toBe("note");
    expect(t.abs).toBe("C:/notes/笔记/日志.md");
    expect(t.relPath).toBe("笔记/日志.md");
    expect(t.anchor).toBe("上周小结");
  });

  it("盘符绝对解析;UNC 视为本地;相对路径按工作区判定", () => {
    expect(classifyLink(DOC, WS, "D:/x.md")).toMatchObject({ kind: "local", hrefPath: "D:/x.md" });
    expect(classifyLink(DOC, WS, "//server/share/a.md")).toMatchObject({ kind: "local" });
    // 工作区内相对 .md(含 ./ )→ note
    const rel = classifyLink(DOC, WS, "./a.md");
    expect(rel.kind).toBe("note");
    expect(rel.abs).toBe("C:/notes/sub/a.md");
    // 工作区外 .md → local
    expect(classifyLink(DOC, WS, "D:/notes/x.md")).toMatchObject({ kind: "local" });
  });

  it("工作区内 .md 绝对路径识别为 note", () => {
    const t = classifyLink(DOC, WS, "C:/notes/other.md");
    expect(t.kind).toBe("note");
    expect(t.relPath).toBe("other.md");
  });

  it("非 md(工作区内图片等) → local;纯锚点 → 本文档 note", () => {
    expect(classifyLink(DOC, WS, "C:/notes/img/a.png")).toMatchObject({ kind: "local" });
    const self = classifyLink(DOC, WS, "#章首");
    expect(self.kind).toBe("note");
    expect(self.anchor).toBe("章首");
  });

  it("URL 编码锚点解码", () => {
    const t = classifyLink(DOC, WS, "b.md#%E4%B8%8A%E5%91%A8%E5%B0%8F%E7%BB%93");
    expect(t.anchor).toBe("上周小结");
  });
});
