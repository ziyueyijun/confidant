// 图片插入助手(05 票落盘通道的渲染层一半):
// 位图字节/文件路径 → 落盘(主进程)→ 文档写相对引用(引擎)→ 自动保存管线持久化。
// 相对引用 = 笔记同目录下的裸文件名(06 用同一目录语义解析)。

import { IMAGE_EXT_RE, noteDirOf, noteStemOf } from "@shared/path";

export function looksLikeImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT_RE.test(file.name);
}

/** 剪贴板/拖入的位图数据落盘(剪贴板格式 png/jpeg 由主进程按 MIME 判定)。 */
export async function landClipboardImage(params: {
  notePath: string;
  mime: string;
  bytes: Uint8Array;
}): Promise<{ fileName: string } | null> {
  const res = await window.confidant.saveClipboardImage({
    dirAbs: noteDirOf(params.notePath),
    noteStem: noteStemOf(params.notePath),
    mime: params.mime,
    bytes: params.bytes,
  });
  if (!res.ok) {
    console.error("[image] save bytes failed:", res.error);
    return null;
  }
  return res.value;
}

/** 源图片文件复制落盘(拖入/菜单选取)。 */
export async function landImageFile(params: {
  notePath: string;
  sourcePath: string;
}): Promise<{ fileName: string } | null> {
  const res = await window.confidant.copyImageFromPath({
    dirAbs: noteDirOf(params.notePath),
    noteStem: noteStemOf(params.notePath),
    sourcePath: params.sourcePath,
  });
  if (!res.ok) {
    console.error("[image] save copy failed:", res.error);
    return null;
  }
  return res.value;
}
