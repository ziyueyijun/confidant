// Windows 语义路径工具测试(06/16 相对引用解析共用此实现)。

import { describe, expect, it } from "vitest";
import { basename, dirname, extname, isAbsolute, join, resolveRelative } from "./path";

describe("basename/dirname/extname", () => {
  it("basename:混合分隔符与盘符", () => {
    expect(basename("C:/a/b.md")).toBe("b.md");
    expect(basename("C:\\a\\b.md")).toBe("b.md");
    expect(basename("b.md")).toBe("b.md");
    expect(basename("C:/a/b.md/")).toBe("b.md");
  });
  it("dirname:盘符与常规", () => {
    expect(dirname("C:/a/b.md")).toBe("C:/a");
    expect(dirname("C:/b.md")).toBe("C:/");
    expect(dirname("a/b.md")).toBe("a");
    expect(dirname("a.md")).toBe(".");
    expect(dirname("")).toBe(".");
  });
  it("extname 小写含点", () => {
    expect(extname("a.PNG")).toBe(".png");
    expect(extname("a.md")).toBe(".md");
    expect(extname("noext")).toBe("");
    expect(extname(".hidden")).toBe("");
  });
});

describe("isAbsolute / join / resolveRelative", () => {
  it("isAbsolute:盘符/UNC/斜杠根为真,相对为假", () => {
    expect(isAbsolute("C:/a")).toBe(true);
    expect(isAbsolute("C:\\a")).toBe(true);
    expect(isAbsolute("//server/share/a")).toBe(true);
    expect(isAbsolute("a/b")).toBe(false);
    expect(isAbsolute("../a")).toBe(false);
  });

  it("join 归一反斜杠、去重复分隔", () => {
    expect(join("C:\\a", "b", "c.md")).toBe("C:/a/b/c.md");
    expect(join("C:/a/", "/b/", "/c.md")).toBe("C:/a/b/c.md");
  });

  it("resolveRelative:普通相对与 .. 上溯", () => {
    expect(resolveRelative("C:/notes/sub", "img/a.png")).toBe("C:/notes/sub/img/a.png");
    expect(resolveRelative("C:/notes/sub", "../img/a.png")).toBe("C:/notes/img/a.png");
    expect(resolveRelative("C:/notes/sub", "./a.png")).toBe("C:/notes/sub/a.png");
  });

  it("resolveRelative:不越过盘符根;绝对引用原样返回", () => {
    expect(resolveRelative("C:/notes", "../../a.md")).toBe("C:/a.md");
    expect(resolveRelative("C:/notes/sub", "D:/else/a.md")).toBe("D:/else/a.md");
    expect(resolveRelative("C:/notes/sub", "/abs/a.md")).toBe("/abs/a.md");
  });

  it("resolveRelative:UNC 保留服务器与共享两段根", () => {
    expect(resolveRelative("//server/share/notes", "../../x.md")).toBe("//server/share/x.md");
  });
});
