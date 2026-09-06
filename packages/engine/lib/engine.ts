// TipTap 控制器(引擎私有实现)。包外只经 ../index 的 createEngine 使用。

import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Image } from "@tiptap/extension-image";

/**
 * 图片显示解析器:markdown 引用(src 原样) → 渲染层可加载的 URL。
 * 默认原样(引擎无路径知识);App 侧注入 confidant-img 资产协议(06)。
 * 序列化仍输出原始 src,不改源语法。
 */
export type ImageUrlResolver = (srcRaw: string) => string;

const IDENTITY_RESOLVER: ImageUrlResolver = (s) => s;

/**
 * 显式扩展清单工厂(规格 §5 + §4.4):
 * StarterKit(3.x 含 Link/Underline)之外显式列出 Table/Row/Cell/Header、
 * TaskList/TaskItem、Image——Image 不注册时图片语法会被静默降级成纯文本,
 * 违反「不得静默丢内容」;@tiptap/markdown 开 GFM。
 * Image 配 NodeView:显示层按 resolveImageUrl 换源,文档 attrs 不动。
 */
function makeExtensions(resolveImageUrl: ImageUrlResolver) {
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
  ];
}

function makeEditor(
  host: HTMLElement,
  markdown: string,
  resolveImageUrl: ImageUrlResolver,
): Editor {
  return new Editor({
    element: host,
    content: markdown,
    contentType: "markdown",
    extensions: makeExtensions(resolveImageUrl),
  });
}

/** 序列化保证:文本以单个换行结尾(TipTap 序列化丢文末换行,规格 §4.2 补)。 */
function finalizeMarkdown(md: string): string {
  return md.replace(/\n+$/, "") + "\n";
}

export interface EngineCallbacks {
  /** 文档内容(含撤销/重做影响的结构)发生变更。 */
  onUpdate?: () => void;
  /** 选区变化(菜单启用态等消费)。 */
  onSelectionChange?: () => void;
}

export interface Engine {
  /** 以 markdown 整体替换文档(正文,front matter 由调用方拆出)。重建撤销历史。 */
  loadMarkdown(markdown: string): void;
  /** 序列化当前文档为 markdown,保证单个换行结尾、换行统一 LF。 */
  getMarkdown(): string;
  /** 键盘焦点移入编辑器。 */
  focus(): void;
  /** 编辑器是否持有焦点。 */
  isFocused(): boolean;
  /** 撤销历史可用(03 菜单启用态;空文档/未编辑为 false)。 */
  canUndo(): boolean;
  /** 重做历史可用。 */
  canRedo(): boolean;
  /** 执行撤销(编辑面,菜单命令源)。 */
  undo(): void;
  /** 执行重做。 */
  redo(): void;
  /** 在光标处插入图片节点(引用相对路径;自动保存由上层管线触发)。 */
  insertImage(src: string, alt?: string): boolean;
  /** 在页面坐标处插入图片(drop 落点;失败回退光标处)。 */
  insertImageAtCoords(clientX: number, clientY: number, src: string, alt?: string): boolean;
  /**
   * 删除图片节点(06 右键「删除」:引用移除走自动保存,图片文件由主进程入回收站)。
   * domEl 为 NodeView 包装内的任意元素;非图片返回 false。
   */
  removeImageNodeAtElement(domEl: Element): boolean;
  /** 释放资源,host 内容清空。 */
  destroy(): void;
}

export interface EngineOptions {
  /** 图片显示源解析(默认原样;App 注入资产协议 resolver)。 */
  resolveImageUrl?: ImageUrlResolver;
}

export function createEngine(
  host: HTMLElement,
  callbacks: EngineCallbacks = {},
  options: EngineOptions = {},
): Engine {
  const resolveImageUrl = options.resolveImageUrl ?? IDENTITY_RESOLVER;
  // 装载 = 销毁重建,重建时直接以 markdown 内容构造(原型 06 验证路径)。
  // 逐文件切换时历史栈随重建清空——本票范围不承诺跨文件撤销历史。
  let editor: Editor | null = null;

  const wire = (ed: Editor): Editor => {
    ed.on("update", () => callbacks.onUpdate?.());
    ed.on("selectionUpdate", () => callbacks.onSelectionChange?.());
    return ed;
  };

  const attach = (): Editor => {
    if (editor) return editor;
    editor = wire(makeEditor(host, "", resolveImageUrl));
    return editor;
  };

  attach();

  return {
    loadMarkdown(markdown: string) {
      const wasFocused = editor?.isFocused ?? false;
      editor?.destroy();
      host.innerHTML = "";
      editor = wire(makeEditor(host, markdown, resolveImageUrl));
      if (wasFocused) editor.commands.focus();
    },

    getMarkdown() {
      const ed = editor;
      if (!ed) return "";
      return finalizeMarkdown(ed.getMarkdown());
    },

    focus() {
      editor?.commands.focus();
    },

    isFocused(): boolean {
      return editor?.isFocused ?? false;
    },

    canUndo(): boolean {
      return editor?.can().undo() ?? false;
    },

    canRedo(): boolean {
      return editor?.can().redo() ?? false;
    },

    undo() {
      editor?.commands.undo();
    },

    redo() {
      editor?.commands.redo();
    },

    insertImage(src, alt = "") {
      if (!editor) return false;
      return editor
        .chain()
        .focus()
        .insertContent({ type: "image", attrs: { src, alt } })
        .run();
    },

    insertImageAtCoords(clientX, clientY, src, alt = "") {
      if (!editor) return false;
      const coords = editor.view.posAtCoords({ left: clientX, top: clientY });
      if (coords) {
        return editor
          .chain()
          .focus()
          .insertContentAt(coords.pos, { type: "image", attrs: { src, alt } })
          .run();
      }
      return this.insertImage(src, alt);
    },

    removeImageNodeAtElement(domEl: Element) {
      if (!editor) return false;
      const target = domEl.closest(".confidant-image-node") ?? domEl;
      // NodeView 包装是原子块,posAtDOM 不可靠:遍历文档找 DOM 对应的图片节点
      const hit = { pos: -1, size: 0 };
      editor.state.doc.descendants((node, pos) => {
        if (hit.pos >= 0) return false;
        if (node.type.name !== "image") return true;
        const dom = editor!.view.nodeDOM(pos) as Element | null;
        if (dom && (dom === target || dom.contains(target) || target.contains(dom))) {
          hit.pos = pos;
          hit.size = node.nodeSize;
          return false;
        }
        return true;
      });
      if (hit.pos < 0) return false;
      return editor
        .chain()
        .focus()
        .deleteRange({ from: hit.pos, to: hit.pos + hit.size })
        .run();
    },

    destroy() {
      editor?.destroy();
      editor = null;
      host.innerHTML = "";
    },
  };
}
