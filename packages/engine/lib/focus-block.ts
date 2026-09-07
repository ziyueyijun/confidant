// 专注模式焦点块标记(06):selection 跟随装饰——光标所在顶层块加 focus-block 类。
// 纯视图态(不进文档、不参与序列化),与行号/语言标签/查找高亮同一机制;
// 渲染层直写编辑区 DOM 属性会被 PM 观察器当外部变更重渲染抹掉(实测,记录于票 06 Answer)。

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const KEY = new PluginKey<DecorationSet>("focusBlock");

export function createFocusBlockPlugin(): Plugin {
  return new Plugin({
    key: KEY,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, value, _old, newState) => {
        if (!tr.selectionSet && !tr.docChanged) return value.map(tr.mapping, tr.doc);
        const { $from } = newState.selection;
        // 顶层块(光标所在;doc 直接子节点):depth 1 处节点
        if ($from.depth < 1) return DecorationSet.empty;
        const start = $from.before(1);
        const end = $from.after(1);
        if (!newState.doc.nodeAt(start)) return DecorationSet.empty;
        return DecorationSet.create(newState.doc, [
          Decoration.node(start, end, { class: "focus-block" }),
        ]);
      },
    },
    props: {
      decorations(state) {
        return KEY.getState(state);
      },
    },
  });
}
