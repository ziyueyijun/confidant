// 代码块视图层(28):语法高亮 + 行号,纯视图态(P M 装饰,文档与序列化零改动)。
// 高亮:围栏语言已注册才装饰;无语言/未知语言不高亮(不做自动探测,28 裁决)。
// 行号:inline widget 置于代码文本起点,绝对定位覆盖 pre 左 padding 区
// (pre position:relative;padding-left 由渲染层 data-code-lines 控制)。
// 行号文本随插件重建刷新(1..N);复制按钮取 code 文本时排除 .code-linenums。

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createLowlight, common } from "lowlight";

/** lowlight 实例类型(createLowlight 返回内联对象类型,无命名导出)。 */
export type Lowlight = ReturnType<typeof createLowlight>;

/** 引擎级单例:highlight.js common 语言集(常用子集;打包体积与覆盖的折中)。 */
export const LOWLIGHT: Lowlight = createLowlight(common);

/** 插件重算信令(行号开关切换时经空事务触发)。 */
export const CODE_BLOCK_VIEW_META = "codeBlockViewRefresh";

export interface CodeBlockViewOptions {
  lowlight: Lowlight;
  /** 行号开关(引擎级设置,关闭时不再生成行号 widget)。 */
  getLineNumbers: () => boolean;
}

const KEY = new PluginKey<DecorationSet>("codeBlockView");

interface HighlightSegment {
  text: string;
  classes: string[];
}

/** 仿官方 lowlight 扩展:hljs 语法树叶子 → 文本段 + 继承的 class 链。 */
function parseHighlightNodes(nodes: unknown, className: string[] = []): HighlightSegment[] {
  const out: HighlightSegment[] = [];
  const walk = (n: { properties?: { className?: unknown }; children?: unknown[]; value?: unknown }, cls: string[]): void => {
    const classes = [...cls, ...(Array.isArray(n.properties?.className) ? (n.properties!.className as string[]) : [])];
    if (Array.isArray(n.children)) {
      for (const c of n.children) walk(c as never, classes);
    } else if (typeof n.value === "string") {
      out.push({ text: n.value, classes });
    }
  };
  if (Array.isArray(nodes)) {
    for (const c of nodes) walk(c as never, className);
  } else {
    walk(nodes as never, className);
  }
  return out;
}

function lineCount(text: string): number {
  return text === "" ? 1 : text.split("\n").length;
}

function getDecorations(doc: Parameters<typeof DecorationSet.create>[0], opts: CodeBlockViewOptions): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node: { type: { name: string }; attrs: Record<string, unknown>; textContent: string }, pos: number) => {
    if (node.type.name !== "codeBlock") return true;
    const language = typeof node.attrs.language === "string" ? node.attrs.language : null;
    const text = node.textContent;
    // 高亮:仅围栏语言已注册(无语言/未知语言不高亮;不做自动探测,28 裁决)。
    // registered 判别名(listLanguages 只返回主名,如 js 的别名 "js" 主名是 "javascript")。
    const isRegistered =
      language !== null &&
      (opts.lowlight.listLanguages().includes(language) || opts.lowlight.registered(language));
    if (isRegistered) {
      const result = opts.lowlight.highlight(language, text) as {
        value?: unknown;
        children?: unknown[];
      };
      let from = pos + 1;
      for (const seg of parseHighlightNodes(result.value ?? result.children ?? [])) {
        const to = from + seg.text.length;
        if (seg.classes.length) decorations.push(Decoration.inline(from, to, { class: seg.classes.join(" ") }));
        from = to;
      }
    }
    // 行号:inline widget 于文本起点;内容随插件重建刷新(1..N 行)。
    // 每行一个块级 span(不依赖 white-space——CSS 文件规则在该环境下
    // computed 异常,span 块方案 100% 确定单列,修复「行号折成两列」)。
    if (opts.getLineNumbers()) {
      const lines = lineCount(text);
      decorations.push(
        Decoration.widget(
          pos + 1,
          () => {
            const el = document.createElement("span");
            el.className = "code-linenums";
            for (let i = 1; i <= lines; i++) {
              const n = document.createElement("span");
              n.className = "code-ln";
              n.textContent = String(i);
              el.appendChild(n);
            }
            return el;
          },
          { side: -1 },
        ),
      );
    }
    // 语言标签(02):widget 装饰于文本起点,绝对定位左上(纯视图态,同行号机制)。
    // 经装饰而非属性写 DOM——直接改 contenteditable 内属性会被 PM 观察器
    // 当外部变更重渲染抹掉(渲染层方案实测失败,记录于票 02 Answer)。
    if (language !== null && language !== "") {
      decorations.push(
        Decoration.widget(
          pos + 1,
          () => {
            const el = document.createElement("span");
            el.className = "code-lang";
            el.textContent = language;
            return el;
          },
          { side: -1 },
        ),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

export function createCodeBlockViewPlugin(opts: CodeBlockViewOptions): Plugin {
  return new Plugin({
    key: KEY,
    state: {
      init: (_, { doc }) => getDecorations(doc, opts),
      apply: (tr, value, _oldState, newState) => {
        // 行号开关等视图设置变化:空事务携带信令强制重算
        if (tr.getMeta(CODE_BLOCK_VIEW_META)) return getDecorations(tr.doc, opts);
        if (tr.docChanged) return getDecorations(tr.doc, opts);
        return value.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return KEY.getState(state);
      },
    },
  });
}
