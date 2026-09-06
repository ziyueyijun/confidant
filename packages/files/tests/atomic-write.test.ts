// 原子写盘测试(01 票基座;02 票把保存管线接上)。

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTextFileAtomic, type FsAdapter } from "../index";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "confidant-files-"));
}

describe("writeTextFileAtomic", () => {
  it("写入目标:内容正确、目标目录无临时文件残留", async () => {
    const dir = await tempDir();
    try {
      const target = join(dir, "note.md");
      await writeTextFileAtomic(target, "# 你好\n");
      expect(await readFile(target, "utf8")).toBe("# 你好\n");
      const left = (await readdir(dir)).filter((n) => n.includes("confidant-tmp"));
      expect(left).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("覆盖已有目标(替换语义)", async () => {
    const dir = await tempDir();
    try {
      const target = join(dir, "note.md");
      await writeFile(target, "旧内容\n", "utf8");
      await writeTextFileAtomic(target, "新内容\n");
      expect(await readFile(target, "utf8")).toBe("新内容\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("写盘中断(注入失败):磁盘不残留半截目标文件、不残留临时文件", async () => {
    const dir = await tempDir();
    try {
      const target = join(dir, "note.md");
      await writeFile(target, "完整旧内容\n", "utf8");
      // 注入:rename 阶段失败(模拟替换中断)
      const broken: FsAdapter = {
        writeFile: async () => {},
        rename: async () => {
          throw Object.assign(new Error("simulated rename failure"), { code: "EPERM" });
        },
        unlink: async () => {},
      };
      await expect(writeTextFileAtomic(target, "半截新内容\n", broken)).rejects.toThrow(
        "simulated rename failure",
      );
      // 目标文件保持上次完整保存的内容
      expect(await readFile(target, "utf8")).toBe("完整旧内容\n");
      const left = (await readdir(dir)).filter((n) => n.includes("confidant-tmp"));
      expect(left).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("写临时文件阶段失败:抛错且目标不动", async () => {
    const dir = await tempDir();
    try {
      const target = join(dir, "note.md");
      await writeFile(target, "原内容\n", "utf8");
      const broken: FsAdapter = {
        writeFile: async () => {
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        },
        rename: async () => {
          throw new Error("should not be called");
        },
        unlink: async () => {},
      };
      await expect(writeTextFileAtomic(target, "新内容\n", broken)).rejects.toThrow("disk full");
      expect(await readFile(target, "utf8")).toBe("原内容\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
