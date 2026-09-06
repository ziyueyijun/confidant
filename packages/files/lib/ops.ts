// 文件/文件夹操作(规格 §8;10/11/12 共享)。
// 重名防撞命名、移动/改名合法性(环/冲突)、占位冲突检测。删除走回收站(主进程 shell)。

import { mkdir, rename as fsRename, access } from "node:fs/promises";
import { dirname, join } from "node:path";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 重名自动加序号(规格 §8):未命名笔记.md → 未命名笔记 1.md → 未命名笔记 2.md… */
export async function nextAvailableName(dirAbs: string, stem: string, ext = ".md"): Promise<string> {
  if (!(await exists(join(dirAbs, `${stem}${ext}`)))) return `${stem}${ext}`;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!(await exists(join(dirAbs, candidate)))) return candidate;
  }
  throw Object.assign(new Error("无法生成可用文件名"), { code: "ENOSPC" });
}

/** 新建文件夹;重名冲突按系统规则拒绝(调用方提示)。 */
export async function makeFolder(dirAbs: string, name: string): Promise<void> {
  if (!/^[^\\/:*?"<>|]+$/.test(name) || name === "." || name === "..") {
    throw Object.assign(new Error("名称包含非法字符"), { code: "EINVAL" });
  }
  const target = join(dirAbs, name);
  if (await exists(target)) {
    throw Object.assign(new Error("同名文件或文件夹已存在"), { code: "EEXIST" });
  }
  await mkdir(target);
}

/** 新建笔记文件(空正文);重名序号防撞。返回新文件绝对路径。 */
export async function createNoteFile(dirAbs: string, stem = "未命名笔记"): Promise<string> {
  const name = await nextAvailableName(dirAbs, stem);
  const target = join(dirAbs, name);
  // 原子写空文档(单换行,与引擎空文档序列化一致)
  const { writeTextFileAtomic } = await import("./atomic-write");
  await writeTextFileAtomic(target, "\n");
  return target;
}

/** 改名/移动合法性(环与冲突);返回 null 时携带原因错误。 */
export function assertMoveAllowed(source: string, targetDir: string, targetName: string): void {
  const bad = /^[^\\/:*?"<>|]+$/.test(targetName) === false || targetName === "." || targetName === "..";
  if (bad) throw Object.assign(new Error("名称包含非法字符"), { code: "EINVAL" });
  // 移入自身或自己的子孙 = 环
  const src = source.replace(/\\/g, "/");
  const dst = join(targetDir, targetName).replace(/\\/g, "/");
  const dstLower = dst.toLowerCase();
  const srcLower = src.toLowerCase();
  if (srcLower === dstLower) {
    throw Object.assign(new Error("目标位置与当前位置相同"), { code: "ESAME" });
  }
  if (dstLower.startsWith(srcLower + "/") || dstLower.startsWith(srcLower + "\\")) {
    throw Object.assign(new Error("不能把文件夹移入自身或它的子文件夹"), { code: "ECYCLE" });
  }
}

/** 移动到 dir/name(冲突/非法由调用方先检测;rename 抛错透传)。 */
export async function moveInto(source: string, targetDir: string, targetName: string): Promise<string> {
  assertMoveAllowed(source, targetDir, targetName);
  const target = join(targetDir, targetName);
  if (await exists(target)) {
    throw Object.assign(new Error("目标位置已有同名文件或文件夹"), { code: "EEXIST" });
  }
  await fsRename(source, target);
  return target;
}

/** 重命名同目录(复用 moveInto 语义)。 */
export function renameEntry(source: string, newName: string): Promise<string> {
  return moveInto(source, dirname(source), newName);
}

/** 提示类错误文案(重名冲突/占用/只读;渲染层对码)。 */
export function describeOpError(code: string, fallback: string): string {
  switch (code) {
    case "EEXIST":
      return "同名文件或文件夹已存在,操作未执行。";
    case "EINVAL":
      return "名称包含非法字符,操作未执行。";
    case "ECYCLE":
      return "不能把文件夹移入自身或它的子文件夹。";
    case "ESAME":
      return "目标位置与当前位置相同。";
    case "EPERM":
    case "EACCES":
    case "EBUSY":
      return "没有权限或文件被占用,操作失败。";
    case "ENOTEMPTY":
      return "目标文件夹非空,操作失败。";
    default:
      return fallback;
  }
}
