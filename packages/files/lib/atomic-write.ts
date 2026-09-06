// 原子写盘(规格 §9.3):先写同目录临时文件,再 rename 替换目标。
// 写盘中断不留半截目标文件;失败时清理临时文件后抛错。
// 测试可注入 fs 适配器模拟写盘中断。

import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import * as fsReal from "node:fs/promises";

export interface FsAdapter {
  writeFile(path: string, data: string | Uint8Array, encoding?: BufferEncoding): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

const REAL_FS: FsAdapter = fsReal as unknown as FsAdapter;

function tmpSiblingPath(targetPath: string): string {
  const dir = dirname(targetPath);
  const base = basename(targetPath);
  const rand = randomBytes(4).toString("hex");
  return join(dir, `.${base}.confidant-tmp-${process.pid}-${rand}`);
}

/**
 * 原子写文本:先写临时文件再替换目标。
 * 任一步失败:尽力清理临时文件,抛出原错误(带 errno code 供上层提示)。
 */
export async function writeTextFileAtomic(
  targetPath: string,
  content: string,
  fsAdapter: FsAdapter = REAL_FS,
): Promise<void> {
  const tmp = tmpSiblingPath(targetPath);
  try {
    await fsAdapter.writeFile(tmp, content, "utf8");
    await fsAdapter.rename(tmp, targetPath);
  } catch (err) {
    try {
      await fsAdapter.unlink(tmp);
    } catch {
      // 临时文件可能未创建或已不在;忽略清理失败,保留原错误
    }
    throw err;
  }
}

/** 二进制原子写(图片落盘等;语义同 writeTextFileAtomic)。 */
export async function writeBinaryFileAtomic(
  targetPath: string,
  data: Uint8Array,
  fsAdapter: FsAdapter = REAL_FS,
): Promise<void> {
  const tmp = tmpSiblingPath(targetPath);
  try {
    await fsAdapter.writeFile(tmp, data);
    await fsAdapter.rename(tmp, targetPath);
  } catch (err) {
    try {
      await fsAdapter.unlink(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}
