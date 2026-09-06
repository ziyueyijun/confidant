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
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Fragment } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { goToNextCell } from "@tiptap/pm/tables";

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
    editorProps: {
      // Tab 语义(09):表格内移下一格;列表项缩进;Shift+Tab 反缩进/上一格
      handleKeyDown(view, event) {
        if (event.key !== "Tab") return false;
        const { state } = view;
        const $sel = state.selection.$from;
        const types = new Set<string>();
        for (let d = $sel.depth; d > 0; d--) types.add($sel.node(d).type.name);
        const shift = event.shiftKey;
        if (types.has("table")) {
          if (goToNextCell(shift ? -1 : 1)(state, view.dispatch)) {
            event.preventDefault();
            return true;
          }
          return false;
        }
        const schema = state.schema;
        const runListCmd = (nodeName: "listItem"): boolean => {
          const nodeType = schema.nodes[nodeName];
          if (!nodeType) return false;
          const cmd = shift ? liftListItem(nodeType) : sinkListItem(nodeType);
          if (cmd(state, view.dispatch)) {
            event.preventDefault();
            return true;
          }
          return false;
        };
        // 任务项缩进:extension-list 的包装与 PM sink/lift 不兼容,走结构化搬移
        if (types.has("taskItem")) {
          if (moveTaskItem(state, view.dispatch, shift ? "out" : "in")) {
            event.preventDefault();
            return true;
          }
          return false;
        }
        if (types.has("listItem")) return runListCmd("listItem");
        return false;
      },
    },
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
  /** 编辑器失焦(浮动条等失焦隐藏)。 */
  onBlur?: () => void;
  /** 单击链接文字(进入编辑态;不跳转,规格 §14;跳转在 16)。 */
  onLinkClick?: (info: LinkInfo) => void;
}

/** 链接节点信息(07 编辑 / 16 打开共用)。 */
export interface LinkInfo {
  href: string;
  /** 链接 mark 覆盖的文本区间(改文本/地址用)。 */
  from: number;
  to: number;
}

/** 块级命令种类(08「段落」菜单;同一命令面供菜单调用)。 */
export type BlockKind =
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "paragraph"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock";

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

  // ── 行内格式(07;浮动工具条与「格式」菜单同一命令面) ──
  toggleBold(): boolean;
  toggleItalic(): boolean;
  toggleStrike(): boolean;
  /** 清除格式 = 去全部行内 mark(含链接)。 */
  clearFormat(): boolean;
  /** 当前选区是否全为某 mark(混排时 false,工具条不误报全选态)。 */
  isMarkAllActive(kind: "bold" | "italic" | "strike" | "underline" | "link"): boolean;
  /** 选区中的首个链接 href(无则 null;供工具条/编辑态预填)。 */
  linkHrefInSelection(): string | null;
  /** 链接设置:有文本选区 → 包裹;空选区 → 插入显示文本并加链。 */
  applyLink(href: string, displayText?: string): boolean;
  /**
   * 链接编辑(07 编辑态):光标在已有链接内时更新地址(displayText 给出且不同 → 一并改文本,
   * 留空 → 只改地址;空 href → 移除链接);无链接上下文时退化为 applyLink。
   */
  applyLinkEdit(href: string, displayText?: string): boolean;
  /** 选区/光标处链接信息(编辑态入口)。 */
  linkRangeAtSelection(): LinkInfo | null;
  /** 在 pos 处的链接信息(单击命中用)。 */
  linkRangeAtPos(pos: number): LinkInfo | null;

  /** 设置文本选区并聚焦(测试/查找定位/点击跳转定位共用)。 */
  setSelection(from: number, to: number): boolean;
  /** 文档内容总长(定位用)。 */
  docSize(): number;
  /** 区间纯文本(doc.textBetween;定位/测试)。 */
  textBetween(from: number, to: number): string;

  // ── 块级命令(08;「段落」菜单入口,不依赖语法输入) ──
  /** 选区是否在表格内(段落命令在表格内置灰,规格 9.6 表交互由右键承担)。 */
  isInsideTable(): boolean;
  /** 当前块/多块应用块命令。kind: heading1..6 / paragraph / 列表 / 引用 / 代码块。 */
  setBlockKind(kind: BlockKind): boolean;
  /** 插入空表格并把光标带入首个单元格。 */
  insertTable(rows?: number, cols?: number): boolean;

  // ── 结构化交互(09) ──
  /** 点击复选框切换任务完成态(渲染层 DOM 事件驱动;更新写盘 - [x]/[ ])。 */
  toggleTaskCheckedAt(domEl: Element): boolean;
  /** 按页面坐标把光标定位到单元格内(右键行/列操作前置)。 */
  anchorCursorAtCoords(clientX: number, clientY: number): boolean;
  /** 表格操作(光标所在行/列):增删行列与对齐。 */
  tableOp(
    op: "rowBefore" | "rowAfter" | "rowDelete" | "colBefore" | "colAfter" | "colDelete" | "alignLeft" | "alignCenter" | "alignRight",
  ): boolean;
  /** 列表项缩进(+1)/反缩进(-1)(任务列表与普通列表)。 */
  listIndent(dir: 1 | -1): boolean;
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
    ed.on("blur", () => callbacks.onBlur?.());
    // 单击:任务勾选(09)优先,链接 → 编辑态回调(07;不跳转,16 打开)
    ed.view.dom.addEventListener("click", (ev) => {
      const target = ev.target as Element | null;
      if (!target) return;
      const checkbox = target.closest("input[type='checkbox']");
      const taskLi = checkbox ? checkbox.closest("li[data-checked]") : null;
      if (taskLi) {
        ev.preventDefault(); // 状态由文档 attrs 驱动渲染,不落浏览器默认勾选
        toggleCheckedViaDom(ed, taskLi);
        return;
      }
      if (!callbacks.onLinkClick) return;
      const coords = ed.view.posAtCoords({ left: ev.clientX, top: ev.clientY });
      if (!coords) return;
      const info = linkRangeAt(ed, coords.pos);
      if (info) callbacks.onLinkClick(info);
    });
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

    // ── 行内格式(07) ──
    toggleBold() {
      return editor?.chain().focus().toggleMark("bold").run() ?? false;
    },
    toggleItalic() {
      return editor?.chain().focus().toggleMark("italic").run() ?? false;
    },
    toggleStrike() {
      return editor?.chain().focus().toggleMark("strike").run() ?? false;
    },
    clearFormat() {
      if (!editor) return false;
      return editor.chain().focus().unsetAllMarks().run();
    },

    isMarkAllActive(kind) {
      const ed = editor;
      if (!ed) return false;
      const { doc, selection } = ed.state;
      if (selection.empty) return ed.isActive(kind);
      // 混排判定:任一覆盖文本节点不带该 mark → 非全选态(工具条不误报)
      for (const range of selection.ranges) {
        let all = true;
        doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
          if (!node.isText) return true;
          if (!node.marks.some((m) => m.type.name === kind)) {
            all = false;
            return false;
          }
          return true;
        });
        if (!all) return false;
      }
      return true;
    },

    linkHrefInSelection() {
      const ed = editor;
      if (!ed) return null;
      const link = ed.isActive("link");
      if (!link) return null;
      const href = ed.getAttributes("link")?.href as string | undefined;
      return href ?? null;
    },

    applyLink(href, displayText) {
      const ed = editor;
      if (!ed) return false;
      const clean = (href ?? "").trim();
      if (!clean) return ed.chain().focus().unsetMark("link").run();
      if (ed.state.selection.empty) {
        // 空选区:插入显示文本并加链(无文本则以 href 为文本)
        const text = (displayText ?? "").trim() || clean;
        return ed
          .chain()
          .focus()
          .insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href: clean } }] })
          .run();
      }
      return ed.chain().focus().setMark("link", { href: clean }).run();
    },

    linkRangeAtSelection() {
      const ed = editor;
      if (!ed) return null;
      return linkRangeAt(ed, ed.state.selection.from);
    },

    linkRangeAtPos(pos) {
      const ed = editor;
      if (!ed) return null;
      return linkRangeAt(ed, pos);
    },

    applyLinkEdit(href, displayText) {
      const ed = editor;
      if (!ed) return false;
      const info = linkRangeAt(ed, ed.state.selection.from);
      const clean = (href ?? "").trim();
      if (!info) return this.applyLink(clean, displayText);
      const currentText = ed.state.doc.textBetween(info.from, info.to, "");
      if (!clean) {
        // 移除链接 mark(保留文本)
        return ed
          .chain()
          .focus()
          .setTextSelection({ from: info.from, to: info.to })
          .unsetMark("link")
          .run();
      }
      const wantText = (displayText ?? "").trim();
      if (wantText && wantText !== currentText) {
        // 改显示文本:替换区间并保持链接 mark
        return ed
          .chain()
          .focus()
          .setTextSelection({ from: info.from, to: info.to })
          .deleteSelection()
          .insertContentAt(info.from, {
            type: "text",
            text: wantText,
            marks: [{ type: "link", attrs: { href: clean } }],
          })
          .run();
      }
      return ed
        .chain()
        .focus()
        .setTextSelection({ from: info.from, to: info.to })
        .setMark("link", { href: clean })
        .run();
    },

    setSelection(from, to) {
      const ed = editor;
      if (!ed) return false;
      return ed.chain().focus().setTextSelection({ from, to }).run();
    },

    docSize() {
      return editor?.state.doc.content.size ?? 0;
    },

    textBetween(from, to) {
      const ed = editor;
      if (!ed) return "";
      return ed.state.doc.textBetween(from, to, "");
    },

    isInsideTable() {
      const ed = editor;
      if (!ed) return false;
      const { selection } = ed.state;
      const atTable = ($pos: { depth: number; node: (d: number) => { type: { name: string } } }): boolean => {
        for (let d = $pos.depth; d > 0; d--) {
          if ($pos.node(d).type.name === "table") return true;
        }
        return false;
      };
      return atTable(selection.$from) || atTable(selection.$to);
    },

    setBlockKind(kind) {
      const ed = editor;
      if (!ed) return false;
      const chain = ed.chain().focus();
      switch (kind) {
        case "heading1":
        case "heading2":
        case "heading3":
        case "heading4":
        case "heading5":
        case "heading6":
          return chain.toggleHeading({ level: Number(kind.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        case "paragraph":
          return chain.setParagraph().run();
        case "bulletList":
          return chain.toggleBulletList().run();
        case "orderedList":
          return chain.toggleOrderedList().run();
        case "taskList":
          return chain.toggleTaskList().run();
        case "quote":
          return chain.toggleBlockquote().run();
        case "codeBlock":
          return chain.toggleCodeBlock().run();
      }
    },

    insertTable(rows = 2, cols = 2) {
      const ed = editor;
      if (!ed) return false;
      return ed.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    },

    toggleTaskCheckedAt(domEl) {
      const ed = editor;
      if (!ed) return false;
      const li = domEl.closest("li[data-checked]");
      if (!li) return false;
      return toggleCheckedViaDom(ed, li);
    },

    anchorCursorAtCoords(clientX, clientY) {
      const ed = editor;
      if (!ed) return false;
      const coords = ed.view.posAtCoords({ left: clientX, top: clientY });
      if (!coords) return false;
      const $p = ed.state.doc.resolve(coords.pos);
      if (!$p.parent.isTextblock) return false;
      return ed.chain().focus().setTextSelection({ from: coords.pos, to: coords.pos }).run();
    },

    tableOp(op) {
      const ed = editor;
      if (!ed) return false;
      const cmd = ed.chain().focus();
      switch (op) {
        case "rowBefore":
          return cmd.addRowBefore().run();
        case "rowAfter":
          return cmd.addRowAfter().run();
        case "rowDelete":
          return cmd.deleteRow().run();
        case "colBefore":
          return cmd.addColumnBefore().run();
        case "colAfter":
          return cmd.addColumnAfter().run();
        case "colDelete":
          return cmd.deleteColumn().run();
        case "alignLeft":
          return cmd.setCellAttribute("align", "left").run();
        case "alignCenter":
          return cmd.setCellAttribute("align", "center").run();
        case "alignRight":
          return cmd.setCellAttribute("align", "right").run();
      }
    },

    listIndent(dir) {
      const ed = editor;
      if (!ed) return false;
      const types = new Set<string>();
      const $sel = ed.state.selection.$from;
      for (let d = $sel.depth; d > 0; d--) types.add($sel.node(d).type.name);
      if (types.has("taskItem")) {
        // 官方 sink/lift 对 taskItem 包装不稳:先试 NodeSelection 路径,抛错回退手动搬移
        for (let d = $sel.depth; d > 0; d--) {
          if ($sel.node(d).type.name !== "taskItem") continue;
          const itemStart = $sel.before(d);
          try {
            const ok = ed
              .chain()
              .focus()
              .setNodeSelection(itemStart)
              [dir === 1 ? "sinkListItem" : "liftListItem"]("taskItem")
              .run();
            if (ok) return true;
          } catch {
            // 落入手动搬移
          }
          return moveTaskItem(ed.state, ed.view.dispatch, dir === 1 ? "in" : "out");
        }
        return false;
      }
      if (types.has("listItem")) {
        return ed
          .chain()
          .focus()
          [dir === 1 ? "sinkListItem" : "liftListItem"]("listItem")
          .run();
      }
      return false;
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

/** 链接 mark 文本区间扩展:从 pos 向两侧合并同 href 的相邻链接文本节点。 */
function linkRangeAt(ed: Editor, pos: number): LinkInfo | null {
  const { doc } = ed.state;
  if (doc.content.size === 0) return null;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const blockStart = $pos.start();
  const blockEnd = blockStart + parent.content.size;

  // 找覆盖 pos 的文本节点及其链接 mark
  const children: Array<{ node: PMNode; offset: number }> = [];
  parent.content.forEach((node, offset) => children.push({ node, offset }));
  let hit: { start: number; end: number; href: string } | null = null;
  for (const { node, offset } of children) {
    const start = blockStart + offset;
    const end = start + node.nodeSize;
    if (pos >= start && pos < end) {
      if (node.isText) {
        const link = node.marks.find((m) => m.type.name === "link");
        if (link) hit = { start, end, href: link.attrs.href as string };
      }
      break;
    }
  }
  if (!hit) return null;

  // 向两侧合并相邻同 href 链接文本
  let from = hit.start;
  let to = hit.end;
  for (;;) {
    const prev = doc.resolve(Math.max(from - 1, blockStart - 1)).nodeBefore;
    if (prev && prev.isText && from > blockStart) {
      const mk = prev.marks.find((m) => m.type.name === "link");
      if (mk && mk.attrs.href === hit.href) {
        from -= prev.nodeSize;
        continue;
      }
    }
    break;
  }
  for (;;) {
    const nxt = doc.resolve(Math.min(to + 1, blockEnd + 1)).nodeAfter;
    if (nxt && nxt.isText && to < blockEnd) {
      const mk = nxt.marks.find((m) => m.type.name === "link");
      if (mk && mk.attrs.href === hit.href) {
        to += nxt.nodeSize;
        continue;
      }
    }
    break;
  }
  return { href: hit.href, from, to };
}

/** 切换任务项完成态(checkbox 点击与右键命令共用;文档 attrs 驱动渲染)。 */
function toggleCheckedViaDom(ed: Editor, li: Element): boolean {
  const hit = { pos: -1, checked: false };
  ed.state.doc.descendants((node, pos) => {
    if (hit.pos >= 0) return false;
    if (node.type.name !== "taskItem") return true;
    const dom = ed.view.nodeDOM(pos) as Element | null;
    if (dom === li || (dom && dom.contains(li))) {
      hit.pos = pos;
      hit.checked = !!node.attrs.checked;
      return false;
    }
    return true;
  });
  if (hit.pos < 0) return false;
  ed.view.dispatch(ed.state.tr.setNodeMarkup(hit.pos, null, { checked: !hit.checked }));
  return true;
}




/**
 * 任务项 缩进(in)/反缩进(out)(09):整棵相关列表「节点重组」,与解析器产出的
 * 嵌套结构同构(taskItem 内嵌 taskList)。单事务替换 → 撤销一步。
 */
function moveTaskItem(state: EditorState, dispatch: (tr: Transaction) => void, dir: "in" | "out"): boolean {
  const { doc, tr } = state;
  const $p = doc.resolve(state.selection.$from.pos);
  const listType = state.schema.nodes.taskList;
  if (!listType) return false;
  const childrenOf = (n: PMNode): PMNode[] => {
    const out: PMNode[] = [];
    n.content.forEach((c) => out.push(c));
    return out;
  };

  // 当前 taskItem 祖先深度与其索引
  let itemDepth = -1;
  for (let d = $p.depth; d > 0; d--) {
    if ($p.node(d).type.name === "taskItem") {
      itemDepth = d;
      break;
    }
  }
  if (itemDepth < 0) return false;
  const listDepth = itemDepth - 1;
  if ($p.node(listDepth).type.name !== "taskList") return false;
  const listNode = $p.node(listDepth);
  const listStart = $p.before(listDepth);
  const itemIndex = $p.index(listDepth);
  const itemNode = listNode.child(itemIndex);
  if (!itemNode) return false;
  const children = childrenOf(listNode);

  if (dir === "in") {
    const prev = children[itemIndex - 1];
    if (!prev || prev.type.name !== "taskItem") return false;
    const tailIdx = prev.childCount - 1;
    const tail = tailIdx >= 0 ? prev.child(tailIdx) : null;
    const hasTailList = tail !== null && tail.type.name === "taskList";
    let prevNew: PMNode;
    if (hasTailList && tail) {
      const grown = tail.copy(tail.content.append(Fragment.from(itemNode)));
      prevNew = prev.copy(prev.content.replaceChild(tailIdx, grown));
    } else {
      prevNew = prev.copy(prev.content.append(Fragment.from(listType.create(null, [itemNode]))));
    }
    const rebuilt: PMNode[] = [];
    for (let i = 0; i < children.length; i++) {
      if (i === itemIndex) continue; // 原项被移入 prev 尾部
      rebuilt.push(i === itemIndex - 1 ? prevNew : children[i]!);
    }
    const newList = listNode.copy(Fragment.fromArray(rebuilt));
    tr.replaceWith(listStart, listStart + listNode.nodeSize, newList);
    dispatch(tr);
    return true;
  }

  // 反缩进:嵌套列表的父必须是 taskItem
  const outerItemDepth = listDepth - 1;
  if (outerItemDepth < 1) return false;
  if ($p.node(outerItemDepth).type.name !== "taskItem") return false;
  const outerListDepth = outerItemDepth - 1;
  if ($p.node(outerListDepth).type.name !== "taskList") return false;
  const outerList = $p.node(outerListDepth);
  const outerListStart = $p.before(outerListDepth);
  const outerItem = $p.node(outerItemDepth);
  const outerItemStart = $p.before(outerItemDepth);
  // 嵌套列表(去当前项)重建
  const tailIdxInOuter = outerItem.childCount - 1;
  const nestedList = outerItem.child(tailIdxInOuter);
  if (!nestedList || nestedList.type.name !== "taskList") return false;
  const nestedChildren = childrenOf(nestedList);
  const nestedNew = nestedList.copy(
    Fragment.fromArray(nestedChildren.filter((c) => c !== itemNode)),
  );
  const outerNew = outerItem.copy(outerItem.content.replaceChild(tailIdxInOuter, nestedNew));
  // 外层列表:outerItemNew 之后插入被移出的项
  const outerChildren = childrenOf(outerList);
  const rebuiltOuter: PMNode[] = [];
  for (const c of outerChildren) {
    if (c === outerItem) rebuiltOuter.push(outerNew, itemNode);
    else rebuiltOuter.push(c);
  }
  const newOuterList = outerList.copy(Fragment.fromArray(rebuiltOuter));
  tr.replaceWith(outerListStart, outerListStart + outerList.nodeSize, newOuterList);
  dispatch(tr);
  return true;
}
