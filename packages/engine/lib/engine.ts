// TipTap 控制器(引擎私有实现)。包外只经 ../index 的 createEngine 使用。

import type { Editor } from "@tiptap/core";

// 私有模块引用(23 抽分后):createEngine 实现所依赖的域件。
import { IDENTITY_RESOLVER, type ImageUrlResolver } from "./extensions";
import { SEARCH_KEY, type SearchHighlightState } from "./search-highlight";
import { linkRangeAt } from "./link-range";
import type { LinkInfo } from "./link-range";
import { moveTaskItem, toggleCheckedViaDom } from "./task-list-ops";
import { makeEditor } from "./keyboard";

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
  /** 单击链接文字(进入编辑态;不跳转,规格 §14)。ctrlKey 时由 App 转「打开」。 */
  onLinkClick?: (info: LinkInfo, modifiers: { ctrl: boolean }) => void;
}

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

  // ── 查找(14/15):子串匹配 + 临时高亮(decoration,不落盘/不进入导出) ──
  /** 文档内子串匹配(大小写不敏感;单文本节点内),返回区间与行文本上下文。 */
  findInDoc(query: string, limit?: number): Array<{ from: number; to: number; text: string }>;
  /** 设置高亮区间与当前命中索引(临时视图态;文档无变更、不进历史)。 */
  setSearchHighlights(ranges: Array<{ from: number; to: number }>, activeIndex?: number): void;
  /** 清除高亮。 */
  clearSearchHighlights(): void;
  /** 滚动定位到区间并聚焦(点击命中跳转)。 */
  revealRange(from: number, to: number): void;
  /** 定位到首个标题文本匹配(忽略大小写、空白折叠);未匹配返回 null。 */
  findHeadingAnchor(title: string): { from: number; to: number } | null;
  /** 跳转定位标题(滚动 + 光标)。 */
  jumpToHeading(title: string): boolean;
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
  /** 光标处插入纯文本(不解析 Markdown 语法;粘贴纯文本语义,17)。 */
  insertPlainText(text: string): boolean;
  /** 光标处插入已清洗 HTML(白名单经 schema 吸收;富文本粘贴语义,17)。 */
  insertHtml(html: string): boolean;  /** 在页面坐标处插入图片(drop 落点;失败回退光标处)。 */
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
  const resolveImageUrl = options.resolveImageUrl ?? IDENTITY_RESOLVER;  // 装载 = 销毁重建,重建时直接以 markdown 内容构造(原型 06 验证路径)。
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
      if (info) callbacks.onLinkClick(info, { ctrl: ev.ctrlKey || ev.metaKey });
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

    findInDoc(query, limit = 500) {
      const ed = editor;
      if (!ed) return [];
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const out: Array<{ from: number; to: number; text: string }> = [];
      ed.state.doc.descendants((node, pos) => {
        if (!node.isText) return true;
        const text = node.text ?? "";
        const lower = text.toLowerCase();
        let idx = lower.indexOf(q);
        while (idx >= 0 && out.length < limit) {
          const before = Math.max(0, idx - 12);
          const after = Math.min(text.length, idx + q.length + 12);
          out.push({
            from: pos + idx,
            to: pos + idx + q.length,
            text: text.slice(before, after),
          });
          idx = lower.indexOf(q, idx + q.length);
        }
        return out.length < limit;
      });
      return out;
    },

    setSearchHighlights(ranges, activeIndex = ranges.length > 0 ? 0 : -1) {
      const ed = editor;
      if (!ed) return;
      const safeActive = ranges.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), ranges.length - 1);
      ed.view.dispatch(
        ed.state.tr.setMeta(SEARCH_KEY, { ranges, active: safeActive } satisfies SearchHighlightState),
      );
    },

    clearSearchHighlights() {
      const ed = editor;
      if (!ed) return;
      ed.view.dispatch(ed.state.tr.setMeta(SEARCH_KEY, { ranges: [], active: -1 }));
    },

    revealRange(from, to) {
      const ed = editor;
      if (!ed) return;
      const coords = ed.view.coordsAtPos(from);
      const scroll = host.parentElement;
      const rect = host.getBoundingClientRect();
      if (scroll) {
        scroll.scrollTo({
          top: scroll.scrollTop + coords.top - rect.top - 72,
          behavior: "smooth",
        });
      }
      ed.chain().focus().setTextSelection({ from, to }).run();
    },

    findHeadingAnchor(title) {
      const ed = editor;
      if (!ed) return null;
      // 匹配规则:去全部空白 + 忽略大小写(锚点多来自链接手写,空白容忍最稳)
      const want = title.replace(/\s+/g, "").toLowerCase();
      if (!want) return null;
      const hit = { from: -1, to: -1 };
      ed.state.doc.descendants((node, pos) => {
        if (hit.from >= 0) return false;
        if (node.type.name !== "heading") return true;
        const text = ed.state.doc.textBetween(pos + 1, pos + node.nodeSize - 1, "");
        if (text.replace(/\s+/g, "").toLowerCase() === want) {
          const inner = pos + 1;
          hit.from = inner;
          hit.to = inner + text.length;
          return false;
        }
        return true;
      });
      return hit.from >= 0 ? hit : null;
    },

    jumpToHeading(title) {
      const hit = this.findHeadingAnchor(title);
      if (!hit) return false;
      this.revealRange(hit.from, hit.to);
      return true;
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

    insertPlainText(text) {
      const ed = editor;
      if (!ed) return false;
      return ed
        .chain()
        .focus()
        .insertContent({ type: "text", text })
        .run();
    },

    insertHtml(html) {
      const ed = editor;
      if (!ed) return false;
      return ed.chain().focus().insertContent(html, { contentType: "html" }).run();
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

export type { LinkInfo } from "./link-range";
export type { ImageUrlResolver } from "./extensions";
