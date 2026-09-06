// 文本读写基础(原子写见 atomic-write)。

import { readFile, writeFile } from "node:fs/promises";

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

/**
 * 整文件覆盖写(非原子;常规路径请用 writeTextFileAtomic)。
 * 仅用于不需要防半截文件的场景。
 */
export async function writeTextFile(path: string, content: string): Promise<void> {
  return writeFile(path, content, "utf8");
}
