// 路径归一化矩阵(票 01a 穷举要求):buildUrl 编码 + normalizeHref 前缀换算。
// 回归锚点:非 ASCII 前缀永不命中曾导致「列举静默清空」(规格 Further Notes)。

import { describe, expect, it } from "vitest";
import { buildUrl, normalizeHref, normalizeUrlPath } from "../client";

describe("buildUrl", () => {
  it("把相对路径拼到 base 路径下", () => {
    expect(buildUrl("http://h:1/dav/notes", "a.md")).toBe("http://h:1/dav/notes/a.md");
    expect(buildUrl("http://h:1/dav/notes", "sub/a.md")).toBe("http://h:1/dav/notes/sub/a.md");
  });

  it("base 无路径时拼到根", () => {
    expect(buildUrl("http://h:1", "a.md")).toBe("http://h:1/a.md");
  });

  it("base 尾斜杠不重复", () => {
    expect(buildUrl("http://h:1/dav/notes/", "a.md")).toBe("http://h:1/dav/notes/a.md");
  });

  it("trailingSlash 选项(集合用)", () => {
    expect(buildUrl("http://h:1/dav", "", { trailingSlash: true })).toBe("http://h:1/dav/");
    expect(buildUrl("http://h:1/dav", "sub", { trailingSlash: true })).toBe("http://h:1/dav/sub/");
    expect(buildUrl("http://h:1/dav", "a.md")).toBe("http://h:1/dav/a.md");
  });

  it("特殊字符逐段百分号编码:空格 / # / % / 中文", () => {
    expect(buildUrl("http://h/dav", "a b.md")).toBe("http://h/dav/a%20b.md");
    expect(buildUrl("http://h/dav", "a#b.md")).toBe("http://h/dav/a%23b.md");
    expect(buildUrl("http://h/dav", "a%b.md")).toBe("http://h/dav/a%25b.md");
    expect(buildUrl("http://h/dav", "笔记.md")).toBe("http://h/dav/%E7%AC%94%E8%AE%B0.md");
  });
});

describe("normalizeUrlPath", () => {
  it("解码、去尾斜杠、根为空", () => {
    expect(normalizeUrlPath("/dav/notes/")).toBe("/dav/notes");
    expect(normalizeUrlPath("/")).toBe("");
    expect(normalizeUrlPath("/dav/a%20b")).toBe("/dav/a b");
    expect(normalizeUrlPath("/dav/%E7%AC%94%E8%AE%B0")).toBe("/dav/笔记");
    expect(normalizeUrlPath("/dav/a%b")).toBe("/dav/a%b"); // 非法转义原样保留,不抛
  });
});

describe("normalizeHref", () => {
  const base = "http://h:1/dav/notes";

  it("根绝对路径 href → 相对 base", () => {
    expect(normalizeHref("/dav/notes/a.md", base)).toBe("a.md");
    expect(normalizeHref("/dav/notes/sub/b.md", base)).toBe("sub/b.md");
  });

  it("base 前缀不同(更深/更浅)也正确", () => {
    expect(normalizeHref("/dav/notes/a.md", "http://h:1/dav")).toBe("notes/a.md");
    expect(normalizeHref("/dav/a.md", "http://h:1/dav")).toBe("a.md");
  });

  it("绝对 URL href 与相对 href", () => {
    expect(normalizeHref("http://h:1/dav/notes/a.md", base)).toBe("a.md");
    expect(normalizeHref("a.md", base)).toBe("a.md");
    expect(normalizeHref("./a.md", base)).toBe("a.md");
  });

  it("集合自身 / 根", () => {
    expect(normalizeHref("/dav/notes/", base)).toBe("");
    expect(normalizeHref("/dav/notes", base)).toBe("");
    expect(normalizeHref("/a.md", "http://h:1")).toBe("a.md");
  });

  it("尾斜杠的集合 href 归一化为无尾斜杠", () => {
    expect(normalizeHref("/dav/notes/sub/", base)).toBe("sub");
  });

  it("URL 编码过的 href 解码:空格、#、%、中文", () => {
    expect(normalizeHref("/dav/notes/a%20b.md", base)).toBe("a b.md");
    expect(normalizeHref("/dav/notes/a%23b.md", base)).toBe("a#b.md");
    expect(normalizeHref("/dav/notes/a%25b.md", base)).toBe("a%b.md");
    expect(normalizeHref("/dav/notes/%E7%AC%94%E8%AE%B0.md", base)).toBe("笔记.md");
  });

  it("非 ASCII 目录名:base 与 href 一致编码时才命中(回归锚点)", () => {
    const b = "http://h:1/dav/笔记 目录";
    expect(normalizeHref("/dav/%E7%AC%94%E8%AE%B0%20%E7%9B%AE%E5%BD%95/a.md", b)).toBe("a.md");
    expect(normalizeHref("/dav/%E7%AC%94%E8%AE%B0%20%E7%9B%AE%E5%BD%95/", b)).toBe("");
  });

  it("前缀不匹配时退回 href 自身,绝不返回空冒充命中", () => {
    expect(normalizeHref("/other/a.md", base)).toBe("other/a.md");
  });

  it("非法转义(裸 %)的文件名 href 原样保留", () => {
    expect(normalizeHref("/dav/notes/a%b.md", base)).toBe("a%b.md");
  });
});
