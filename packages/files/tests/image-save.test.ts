// 图片落盘命名/防撞/字节与复制落盘测试(05 票;落盘规则全自动化覆盖)。

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extForImageMime,
  imageBaseName,
  noteDirOf,
  noteStemOf,
  saveImageBytes,
  saveImageCopy,
  uniqueFileName,
} from "../index";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "confidant-img-"));
}

const PNG_1PX = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("命名与防撞", () => {
  it("imageBaseName:{笔记名}-{时间戳}{ext};未知/非法 ext 回落 png", () => {
    expect(imageBaseName("周报", ".png", 1234)).toBe("周报-1234.png");
    expect(imageBaseName("周报", ".JPEG", 1)).toBe("周报-1.jpeg");
    expect(imageBaseName("周报", "jpg", 1)).toBe("周报-1.png");
    expect(imageBaseName("周报", "", 1)).toBe("周报-1.png");
  });

  it("位图 MIME → 扩展名", () => {
    expect(extForImageMime("image/png")).toBe(".png");
    expect(extForImageMime("image/jpeg")).toBe(".jpg");
    expect(extForImageMime("image/gif")).toBe(".gif");
    expect(extForImageMime("application/octet-stream")).toBe(".png");
  });

  it("uniqueFileName 递增防撞不覆盖", async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, "a.png"), "x");
      await writeFile(join(dir, "a-1.png"), "x");
      expect(await uniqueFileName(dir, "a.png")).toBe("a-2.png");
      expect(await uniqueFileName(dir, "b.png")).toBe("b.png");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("noteStemOf / noteDirOf", () => {
    expect(noteStemOf("C:/notes/周报.md")).toBe("周报");
    expect(noteStemOf("C:/notes/x/未命名笔记 1.md")).toBe("未命名笔记 1");
    expect(noteDirOf("C:/notes/周报.md").replace(/\\/g, "/")).toBe("C:/notes");
  });
});

describe("落盘", () => {
  it("saveImageBytes:字节落到同目录 `{stem}-{ts}.png`,可读回原字节", async () => {
    const dir = await tempDir();
    try {
      const name = await saveImageBytes({ dirAbs: dir, noteStem: "日记", bytes: PNG_1PX, ext: ".png", stamp: 999 });
      expect(name).toBe("日记-999.png");
      const back = await readFile(join(dir, name));
      expect(Buffer.from(back).equals(Buffer.from(PNG_1PX))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saveImageBytes 防撞:同名自动 -1", async () => {
    const dir = await tempDir();
    try {
      const n1 = await saveImageBytes({ dirAbs: dir, noteStem: "甲", bytes: PNG_1PX, ext: ".png", stamp: 7 });
      const n2 = await saveImageBytes({ dirAbs: dir, noteStem: "甲", bytes: PNG_1PX, ext: ".png", stamp: 7 });
      expect(n1).toBe("甲-7.png");
      expect(n2).toBe("甲-7-1.png");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saveImageCopy:沿用源扩展名复制;源文件保留", async () => {
    const dir = await tempDir();
    const srcDir = await tempDir();
    try {
      const src = join(srcDir, "photo.GIF");
      await writeFile(src, "gif-bytes");
      const name = await saveImageCopy({ dirAbs: dir, noteStem: "笔记", sourcePath: src, stamp: 5 });
      expect(name).toBe("笔记-5.gif");
      expect(await readFile(join(dir, name), "utf8")).toBe("gif-bytes");
      expect(await readFile(src, "utf8")).toBe("gif-bytes"); // 源不删
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(srcDir, { recursive: true, force: true });
    }
  });
});
