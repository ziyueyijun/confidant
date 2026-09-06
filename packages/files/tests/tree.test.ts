// 工作区目录树扫描测试(规格 §8 排序/过滤/结构)。真实临时目录夹具。

import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countMarkdown, scanWorkspaceTree, type TreeEntry } from "../index";

async function makeTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "confidant-tree-"));
  await writeFile(join(root, "b.md"), "# b\n");
  await writeFile(join(root, "a10.md"), "");
  await writeFile(join(root, "a2.md"), "");
  await writeFile(join(root, "note.txt"), "not md");
  await writeFile(join(root, ".hidden.md"), "hidden");
  await writeFile(join(root, ".env"), "");
  await mkdir(join(root, "子目录乙"));
  await writeFile(join(root, "子目录乙", "内.md"), "");
  await mkdir(join(root, "子目录甲"));
  await mkdir(join(root, "子目录甲", "深层"));
  await writeFile(join(root, "子目录甲", "深层", "deep.md"), "");
  await mkdir(join(root, ".git"));
  await mkdir(join(root, "空目录"));
  return root;
}

function names(entries: TreeEntry[]): string[] {
  return entries.map((e) => e.name);
}

describe("scanWorkspaceTree", () => {
  it("结构:目录全显(含空)、文件仅 .md、隐藏名不出现、非 md 不出现", async () => {
    const root = await makeTree();
    try {
      const tree = await scanWorkspaceTree(root);
      const top = names(tree);
      expect(top).toContain("子目录甲");
      expect(top).toContain("子目录乙");
      expect(top).toContain("空目录");
      expect(top).toContain("a2.md");
      expect(top).not.toContain("note.txt");
      expect(top).not.toContain(".hidden.md");
      expect(top).not.toContain(".env");
      expect(top).not.toContain(".git");
      expect(countMarkdown(tree)).toBe(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("排序:文件夹在前,组内名称自然升序(10 在 2 后)", async () => {
    const root = await makeTree();
    try {
      const tree = await scanWorkspaceTree(root);
      const byName = new Map(tree.map((e) => [e.name, e]));
      const dirsIdx = tree.map((e) => e.kind === "dir");
      const firstFileIdx = dirsIdx.indexOf(false);
      for (let i = 0; i < tree.length; i++) {
        if (firstFileIdx >= 0 && i < firstFileIdx) expect(tree[i]!.kind).toBe("dir");
      }
      const files = tree.filter((e) => e.kind === "md").map((e) => e.name);
      expect(files).toEqual(["a2.md", "a10.md", "b.md"]);
      // 嵌套结构:子目录甲 含 深层/深层/deep.md
      expect(names(byName.get("子目录甲")!.children ?? [])).toContain("深层");
      expect(byName.get("子目录甲")!.children!.length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("符号链接指向 md 可见、指向目录可下钻、悬空不可见", async () => {
    const root = await makeTree();
    try {
      await symlink(join(root, "b.md"), join(root, "链接笔记.md"), "file");
      await symlink(join(root, "子目录甲"), join(root, "链接目录"), "dir");
      await symlink(join(root, "不存在"), join(root, "悬空链接"), "file");
      const tree = await scanWorkspaceTree(root);
      const namesAll = names(tree);
      expect(namesAll).toContain("链接笔记.md");
      expect(namesAll).toContain("链接目录");
      expect(namesAll).not.toContain("悬空链接");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
