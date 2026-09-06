// 键盘语义(09):Tab 表格内移格/列表缩进、表格末行回车加行并落格、任务项缩进走结构化搬移。
// makeEditor 从 engine.ts 抽为同包私有模块(23)。
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { addRowAfter as addRowAfterCmd, goToNextCell } from "@tiptap/pm/tables";
import { makeExtensions, type ImageUrlResolver } from "./extensions";
import { moveTaskItem } from "./task-list-ops";

export function makeEditor(
  host: HTMLElement,
  markdown: string,
  resolveImageUrl: ImageUrlResolver,
  handlePaste?: (event: ClipboardEvent) => boolean,
  getCodeLineNumbers: () => boolean = () => true,
): Editor {
  return new Editor({
    element: host,
    content: markdown,
    contentType: "markdown",
    extensions: makeExtensions(resolveImageUrl, getCodeLineNumbers),
    editorProps: {
      // Tab 语义(09):表格内移下一格;列表项缩进;Shift+Tab 反缩进/上一格
      // Enter 语义(09):表格最后一行回车 → 加行并把光标带入新行同列单元格
      handleKeyDown(view, event) {
        const { state } = view;
        const $sel = state.selection.$from;
        const types = new Set<string>();
        for (let d = $sel.depth; d > 0; d--) types.add($sel.node(d).type.name);
        const shift = event.shiftKey;

        if (event.key === "Enter" && !shift && types.has("table")) {
          let tableDepth = -1;
          for (let d = $sel.depth; d > 0; d--) {
            if ($sel.node(d).type.name === "table") {
              tableDepth = d;
              break;
            }
          }
          if (tableDepth >= 0) {
            const rowIndex = $sel.index(tableDepth);
            const totalRows = $sel.node(tableDepth).childCount;
            if (rowIndex === totalRows - 1 && addRowAfterCmd(state, view.dispatch)) {
              const doc = view.state.doc;
              const $p2 = view.state.selection.$from;
              let t2 = -1;
              for (let d = $p2.depth; d > 0; d--) {
                if ($p2.node(d).type.name === "table") {
                  t2 = d;
                  break;
                }
              }
              if (t2 < 0) return false;
              const table = $p2.node(t2);
              const rows = table.childCount;
              const prevRow = rows >= 2 ? table.child(rows - 2) : null;
              const colBefore = Math.min(
                $p2.index(t2 + 1),
                prevRow ? prevRow.childCount - 1 : 0,
              );
              // 新行 = 末行(加行后);定位同列单元格并取空段光标
              let rowAbs = $p2.before(t2) + 1; // 首行起点(表开 char 之后)
              for (let i = 0; i < rows - 1; i++) rowAbs += table.child(i)!.nodeSize;
              const lastRow = table.child(rows - 1)!;
              let cellAbs = rowAbs + 1;
              for (let i = 0; i < colBefore; i++) {
                const c = lastRow.child(i);
                if (c) cellAbs += c.nodeSize;
              }
              const paraStart = cellAbs + 1; // 空单元格段落始于开格 char 后
              const caret = paraStart + 1;
              const pos = Math.max(1, Math.min(caret, doc.content.size));
              view.dispatch(
                view.state.tr.setSelection(TextSelection.create(doc, pos, pos)),
              );
              event.preventDefault();
              return true;
            }
          }
        }

        if (event.key !== "Tab") return false;
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
      // 粘贴(17/26):在 PM 默认插入之前运行应用分派;返回 true 时 PM 不再插入(修双插)
      handlePaste: (_view, event) => (handlePaste ? handlePaste(event) : false),
    },
  });
}

/** 序列化保证:文本以单个换行结尾(TipTap 序列化丢文末换行,规格 §4.2 补)。 */
