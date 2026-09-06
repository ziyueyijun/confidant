// 粘贴分派(17):位图/文件路径/富文本/纯文本四分支的单一事实源。
// 经 engine 的 editorProps.handlePaste(26)在 ProseMirror 默认插入之前运行:
// 返回 true 表示已处理(PM 不再插入),消除「PM 先插 + 应用再插」的双插缺陷。
// 位图优先于文本(规格 9.2:截图与文件路径并存时,位图优先)。

import { basename } from "@shared/path";
import type { Engine } from "../../../../packages/engine";
import type { OpenNote } from "../session/types";
import { sanitizePasteHtml } from "./html-sanitize";
import { landClipboardImage, landImageFile, looksLikeImageFile } from "./image-insert";

export interface PasteDispatchRefs {
  docRef: { current: OpenNote | null };
  engineRef: { current: Engine | null };
}

/** 粘贴分派工厂:refs 稳定、随引擎装载即用(use-editor-host 注入)。 */
export function createPasteDispatcher(refs: PasteDispatchRefs): (e: ClipboardEvent) => boolean {
  return (e) => {
    const doc = refs.docRef.current;
    const current = refs.engineRef.current;
    if (!doc || !current) return false;
    const items = [...(e.clipboardData?.items ?? [])];
    // 1) 剪贴板位图优先(截图;含文件路径并存时位图优先,规格 9.2)
    const imageItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return false;
      void (async () => {
        try {
          const landed = await landClipboardImage({
            notePath: doc.path,
            mime: file.type || "image/png",
            bytes: new Uint8Array(await file.arrayBuffer()),
          });
          if (landed) current.insertImage(landed.fileName, "");
        } catch (err) {
          console.error("[image] paste insert failed:", err);
        }
      })();
      return true;
    }
    // 2) 文件路径(资源管理器复制):图片扩展名走落盘;非图片插指向文件的链接文本
    const fileItem = items.find((it) => it.kind === "file");
    if (fileItem) {
      const file = fileItem.getAsFile();
      if (!file) return false;
      e.preventDefault();
      const sourcePath = window.confidant.pathForFile(file);
      if (!sourcePath) {
        console.error("[paste] cannot resolve file path");
        return false;
      }
      if (looksLikeImageFile(file)) {
        void (async () => {
          const landed = await landImageFile({ notePath: doc.path, sourcePath });
          if (landed) current.insertImage(landed.fileName, "");
        })();
        return true;
      }
      // 插入链接文本(不复制文件):以笔记目录为基准的相对路径更稳,跨盘则用绝对路径。
      // 用 applyLink 走 JSON 命令面:C: 盘符等本地路径经 HTML 解析会被 extension-link
      // 的 isAllowedUri 拒绝,退化成字面文本(26 顺带修复)。
      const base = basename(sourcePath);
      current.applyLink(sourcePath.replace(/\\/g, "/"), base);
      return true;
    }
    // 3) 富文本来源:净化后按 schema 吸收(结构保留,样式级降级)
    const html = e.clipboardData?.getData("text/html");
    if (html && html.trim() !== "") {
      e.preventDefault();
      current.insertHtml(sanitizePasteHtml(html));
      return true;
    }
    // 4) 纯文本来源:原样插入,不把 Markdown 语法文本解析成格式(规格 9.2)
    const plain = e.clipboardData?.getData("text/plain");
    if (plain != null) {
      e.preventDefault();
      current.insertPlainText(plain);
      return true;
    }
    return false;
  };
}
