// 图片源解析测试(06;相对/盘符/UNC/远程/扩展名各分支)。

import { describe, expect, it } from "vitest";
import {
  isRemoteSrc,
  resolveImageAbsPath,
  resolveImageSourceUrl,
} from "./image-source";

const NOTE = "C:/notes/sub/周报.md";

describe("resolveImageSourceUrl", () => {
  it("同目录裸名 → 资产 URL", () => {
    expect(resolveImageSourceUrl(NOTE, "周报-1.png")).toBe(
      "confidant-img://asset/C%3A%2Fnotes%2Fsub%2F%E5%91%A8%E6%8A%A5-1.png",
    );
  });
  it("./ 与 ../ 相对解析", () => {
    expect(resolveImageSourceUrl(NOTE, "./a.png")).toBe(
      "confidant-img://asset/C%3A%2Fnotes%2Fsub%2Fa.png",
    );
    expect(resolveImageSourceUrl(NOTE, "../img/b.jpg")).toBe(
      "confidant-img://asset/C%3A%2Fnotes%2Fimg%2Fb.jpg",
    );
  });
  it("反斜杠源与绝对路径透传", () => {
    expect(resolveImageSourceUrl(NOTE, "D:\\data\\x.gif")).toBe(
      "confidant-img://asset/D%3A%2Fdata%2Fx.gif",
    );
  });
  it("远程/未知协议不渲染(网络图裁决出)", () => {
    expect(resolveImageSourceUrl(NOTE, "https://example.com/a.png")).toBeNull();
    expect(resolveImageSourceUrl(NOTE, "data:image/png;base64,xx")).toBeNull();
  });
  it("非图片扩展名/非本地 → null", () => {
    expect(resolveImageSourceUrl(NOTE, "a.txt")).toBeNull();
    expect(resolveImageSourceUrl(NOTE, "a.png/x")).toBeNull();
    expect(resolveImageSourceUrl("a.md", "x.png")).toBeNull(); // 相对笔记路径无盘符
  });
});

describe("resolveImageAbsPath", () => {
  it("相对与绝对一致解析;远程 null", () => {
    expect(resolveImageAbsPath(NOTE, "./a.png")).toBe("C:/notes/sub/a.png");
    expect(resolveImageAbsPath(NOTE, "../a.png")).toBe("C:/notes/a.png");
    expect(resolveImageAbsPath(NOTE, "D:/b.png")).toBe("D:/b.png");
    expect(resolveImageAbsPath(NOTE, "https://x/y.png")).toBeNull();
  });
});

describe("isRemoteSrc", () => {
  it("协议头判定", () => {
    expect(isRemoteSrc("https://a/b.png")).toBe(true);
    expect(isRemoteSrc("http://a/b.png")).toBe(true);
    expect(isRemoteSrc("a.png")).toBe(false);
  });
});
