// 冲突副本命名(决议 22)。本地文件保持不动,远端版本以
//   `笔记名 (冲突 来自远端 2026-09-14 15-30-12).md`
// 落在同目录;时间戳用 `-` 分隔(`:` 在 Windows 文件名中非法);非 .md 保留原扩展名。

import { nameOfRelPath, parentOfRelPath } from "./paths";

/** 本地时间戳 `YYYY-MM-DD HH-mm-ss`(文件名安全)。 */
export function formatConflictStamp(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  );
}

function splitExt(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot > 0) return { stem: name.slice(0, dot), ext: name.slice(dot) };
  return { stem: name, ext: "" };
}

/** 冲突副本的 relPath(带时间戳);不含防撞去重。 */
export function conflictCopyRelPath(relPath: string, date: Date): string {
  const dir = parentOfRelPath(relPath);
  const { stem, ext } = splitExt(nameOfRelPath(relPath));
  const name = `${stem} (冲突 来自远端 ${formatConflictStamp(date)})${ext}`;
  return dir ? `${dir}/${name}` : name;
}

/** 在扩展名前插入后缀(用于同名冲突副本防撞):`a.md` + ` (2)` → `a (2).md`。 */
export function insertNameSuffix(name: string, suffix: string): string {
  const { stem, ext } = splitExt(name);
  return `${stem}${suffix}${ext}`;
}

/** 在 relPath 基础上追加后缀。 */
export function withSuffix(relPath: string, suffix: string): string {
  const dir = parentOfRelPath(relPath);
  const name = insertNameSuffix(nameOfRelPath(relPath), suffix);
  return dir ? `${dir}/${name}` : name;
}

/**
 * 取一个尚未占用的冲突副本 relPath。`taken` 判定某 relPath 是否已被占用
 * (本地与远端两侧都要查,否则 createOnly 上传会 412)。
 */
export function uniqueConflictCopyRelPath(
  relPath: string,
  date: Date,
  taken: (candidate: string) => boolean,
): string {
  const base = conflictCopyRelPath(relPath, date);
  if (!taken(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = withSuffix(base, ` (${i})`);
    if (!taken(cand)) return cand;
  }
  return withSuffix(base, ` (${Date.now()})`);
}
