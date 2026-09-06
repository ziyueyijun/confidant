// 文件操作规则测试(10/11:防撞命名/环/冲突;真临时目录)。

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertMoveAllowed,
  createNoteFile,
  describeOpError,
  makeFolder,
  moveInto,
  nextAvailableName,
  renameEntry,
} from "../index";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "confidant-ops-"));
}

describe("文件操作规则", () => {
  it("新建笔记:默认名与空格序号防撞(未命名笔记 1.md)", async () => {
    const dir = await tempDir();
    try {
      const n1 = await createNoteFile(dir);
      const n2 = await createNoteFile(dir);
      const n3 = await createNoteFile(dir);
      expect(n1.endsWith("未命名笔记.md")).toBe(true);
      expect(n2.endsWith("未命名笔记 1.md")).toBe(true);
      expect(n3.endsWith("未命名笔记 2.md")).toBe(true);
      expect(await readdir(dir)).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("新建文件夹:重名冲突拒绝(EEXIST);非法名拒绝", async () => {
    const dir = await tempDir();
    try {
      await makeFolder(dir, "归档");
      await expect(makeFolder(dir, "归档")).rejects.toMatchObject({ code: "EEXIST" });
      await expect(makeFolder(dir, "a/b")).rejects.toMatchObject({ code: "EINVAL" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("移动:移入自身/子孙抛 ECYCLE;与目标同名抛 EEXIST;成功移动", async () => {
    const dir = await tempDir();
    try {
      await mkdir(join(dir, "a"));
      await writeFile(join(dir, "a", "n.md"), "x");
      expect(() => assertMoveAllowed(join(dir, "a"), join(dir, "a"), "a")).toThrow();
      try {
        assertMoveAllowed(join(dir, "a"), join(dir, "a", "n"), "a");
      } catch (e) {
        expect((e as { code?: string }).code).toBe("ECYCLE");
      }
      await moveInto(join(dir, "a", "n.md"), dir, "moved.md");
      expect((await readdir(dir)).includes("moved.md")).toBe(true);
      await writeFile(join(dir, "占位.md"), "z");
      await expect(moveInto(join(dir, "moved.md"), dir, "占位.md")).rejects.toMatchObject({
        code: "EEXIST",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("renameEntry 与描述文案", async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, "old.md"), "y");
      const next = await renameEntry(join(dir, "old.md"), "新名.md");
      expect(next.endsWith("新名.md")).toBe(true);
      expect(describeOpError("EEXIST", "")).toContain("同名");
      expect(describeOpError("EACCES", "")).toContain("权限");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("nextAvailableName 空格序号", async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, "周报.md"), "");
      await writeFile(join(dir, "周报 1.md"), "");
      expect(await nextAvailableName(dir, "周报")).toBe("周报 2.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
