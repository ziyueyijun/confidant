// 显式扩展清单工厂(规格 §5 + §4.4):StarterKit(3.x 含 Link/Underline)之外显式列出
// Table/Row/Cell/Header、TaskList/TaskItem、Image——Image 不注册时图片语法会被静默
// 降级成纯文本,违反「不得静默丢内容」;@tiptap/markdown 开 GFM。
// Image 配 NodeView:显示层按 resolveImageUrl 换源,文档 attrs 不动。从 engine.ts 抽(23)。
import { Extension } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Image } from "@tiptap/extension-image";
import { createSearchPlugin } from "./search-highlight";

/**
 * 图片显示解析器:markdown 引用(src 原样) → 渲染层可加载的 URL。
 * 默认原样(引擎无路径知识);App 侧注入 confidant-img 资产协议(06)。
 * 序列化仍输出原始 src,不改源语法。
 */
export type ImageUrlResolver = (srcRaw: string) => string;

export const IDENTITY_RESOLVER: ImageUrlResolver = (s) => s;

export function makeExtensions(resolveImageUrl: ImageUrlResolver) {
  const ImageNodeView = Image.extend({
    addNodeView() {
      return ({ node }) => {
        const raw = (node.attrs.src as string) ?? "";
        const wrap = document.createElement("div");
        wrap.className = "confidant-image-node";
        wrap.contentEditable = "false";
        wrap.dataset.srcRaw = raw; // 渲染层右键定位用(序列化不经此)
        const img = document.createElement("img");
        img.src = resolveImageUrl(raw);
        img.alt = (node.attrs.alt as string) ?? "";
        img.draggable = false;
        wrap.appendChild(img);
        return {
          dom: wrap,
          ignoreMutation: () => true,
          update: (updated) => {
            if (updated.attrs.src !== raw) {
              wrap.dataset.srcRaw = updated.attrs.src as string;
              img.src = resolveImageUrl((updated.attrs.src as string) ?? "");
            }
            return true;
          },
        };
      };
    },
  });
  return [
    StarterKit,
    Table,
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem,
    ImageNodeView,
    Markdown.configure({ markedOptions: { gfm: true } }),
    Extension.create({ addProseMirrorPlugins: () => [createSearchPlugin()] }),
  ];
}
