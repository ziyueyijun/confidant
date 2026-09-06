// 图片落盘通道(规格 §10 落盘规则):自动复制到当前 .md 同目录,
// 命名 `{笔记名}-{时间戳}.ext`(位图按剪贴板格式 png/jpeg;拖入/选取沿用源扩展名),
// 重名自动防撞;文档内引用为相对路径(渲染层书写 `文件名`,正斜杠语义)。

import { access, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeBinaryFileAtomic } from "./atomic-write";

const EXT_RE = /^\.[a-z0-9]+$/i;

/** 位图剪贴板 MIME → 扩展名(未知按 png)。 */
export function extForImageMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 防撞:目标名已存在时按 `name-1.ext`、`name-2.ext`… 递增找空位。 */
export async function uniqueFileName(dirAbs: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let i = 1; ; i++) {
    if (!(await exists(join(dirAbs, candidate)))) return candidate;
    candidate = `${stem}-${i}${ext}`;
  }
}

/** 构造 `{笔记名}-{时间戳}{ext}` 基础名(未防撞;落盘前再经 uniqueFileName)。 */
export function imageBaseName(noteStem: string, ext: string, stamp = Date.now()): string {
  const cleanExt = EXT_RE.test(ext) ? ext.toLowerCase() : ".png";
  return `${noteStem}-${stamp}${cleanExt}`;
}

/**
 * 位图字节落盘:写 `{dir}/{stem}-{ts}{ext}`(自动防撞),返回实际文件名。
 */
export async function saveImageBytes(params: {
  dirAbs: string;
  noteStem: string;
  bytes: Uint8Array;
  ext: string;
  stamp?: number;
}): Promise<string> {
  const name = await uniqueFileName(
    params.dirAbs,
    imageBaseName(params.noteStem, params.ext, params.stamp),
  );
  await writeBinaryFileAtomic(join(params.dirAbs, name), params.bytes);
  return name;
}

/**
 * 图片文件复制落盘(拖入/菜单选取):沿用源扩展名,复制到同目录并防撞。
 */
export async function saveImageCopy(params: {
  dirAbs: string;
  noteStem: string;
  sourcePath: string;
  stamp?: number;
}): Promise<string> {
  const ext = (params.sourcePath.match(/\.[a-z0-9]+$/i)?.[0] ?? ".png").toLowerCase();
  const name = await uniqueFileName(
    params.dirAbs,
    imageBaseName(params.noteStem, ext, params.stamp),
  );
  await copyFile(params.sourcePath, join(params.dirAbs, name));
  return name;
}

/** 断言图片落盘目录 = 笔记所在目录(供调用方校验后调用以上落盘)。 */
export function noteStemOf(notePath: string): string {
  const base = notePath.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/\.md$/i, "");
}

/** 落盘目录(笔记同目录;带路径的 note 一并给 dir)。 */
export function noteDirOf(notePath: string): string {
  return dirname(notePath);
}
