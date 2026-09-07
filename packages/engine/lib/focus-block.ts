// 专注模式焦点块标记(06):selection 跟随装饰——光标所在顶层块加 focus-block 类。
// 纯视图态(不进文档、不参与序列化),与行号/语言标签/查找高亮同一机制;
// 渲染层直写编辑区 DOM 属性会被 PM 观察器当外部变更重渲染抹掉(实测,记录于票 06 Answer)。

import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const KEY = new PluginKey<DecorationSet>("focusBlock");

export function createFocusBlockPlugin(): Plugin {
  return new Plugin({
    key: KEY,
    state: {
      // 初始即以当前选区标记(否则刚装载的文档在专注模式下整篇淡出,直到首次交互)
      init: (_config, state: EditorState) => decorateFor(state),
      apply: (tr, value, _old, newState) => {
        if (!tr.selectionSet && !tr.docChanged) return value.map(tr.mapping, tr.doc);
        return decorateFor(newState);
      },
    },
    props: {
      decorations(state) {
        return KEY.getState(state);
      },
    },
  });
}

/** 光标所在顶层块(doc 直接子节点)的 focus-block 装饰;光标在 doc 根时为空。 */
function decorateFor(state: EditorState): DecorationSet {
  const { $from } = state.selection;
  if ($from.depth < 1) return DecorationSet.empty;
  const start = $from.before(1);
  const end = $from.after(1);
  if (!state.doc.nodeAt(start)) return DecorationSet.empty;
  return DecorationSet.create(state.doc, [Decoration.node(start, end, { class: "focus-block" })]);
}
