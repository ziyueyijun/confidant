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
 * 扩展显式注册清单(规格 §5 + 数据承诺 §4.4):
 * StarterKit(3.x 含 Link/Underline)之外显式列出 Table/Row/Cell/Header、
 * TaskList/TaskItem、Image——Image 不注册时图片语法会被静默降级成纯文本,
 * 违反「不得静默丢内容」;@tiptap/markdown 开 GFM。
 */
const EXTENSIONS = [
  StarterKit,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem,
  Image,
  Markdown.configure({ markedOptions: { gfm: true } }),
] as const;

function makeEditor(host: HTMLElement, markdown: string): Editor {
  return new Editor({
    element: host,
    content: markdown,
    contentType: "markdown",
    extensions: [...EXTENSIONS],
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
  /** 释放资源,host 内容清空。 */
  destroy(): void;
}

export function createEngine(host: HTMLElement, callbacks: EngineCallbacks = {}): Engine {
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
    editor = wire(makeEditor(host, ""));
    return editor;
  };

  attach();

  return {
    loadMarkdown(markdown: string) {
      const wasFocused = editor?.isFocused ?? false;
      editor?.destroy();
      host.innerHTML = "";
      editor = wire(makeEditor(host, markdown));
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

    destroy() {
      editor?.destroy();
      editor = null;
      host.innerHTML = "";
    },
  };
}
