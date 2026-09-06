// 查找高亮插件(14):临时 decoration 层;文档零变更、不进撤销历史、不参与序列化。
// 从 engine.ts 抽为同包私有模块(23)。
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** 查找高亮(14):临时 decoration 层;文档零变更、不进撤销历史、不参与序列化。 */
export interface SearchHighlightState {
  ranges: Array<{ from: number; to: number }>;
  active: number;
}
export const SEARCH_KEY = new PluginKey<SearchHighlightState>("confidantSearch");
const EMPTY_SEARCH: SearchHighlightState = { ranges: [], active: -1 };

export function createSearchPlugin(): Plugin<SearchHighlightState> {
  return new Plugin<SearchHighlightState>({
    key: SEARCH_KEY,
    state: {
      init: () => EMPTY_SEARCH,
      apply: (tr, prev) => {
        const meta = tr.getMeta(SEARCH_KEY) as SearchHighlightState | undefined;
        return meta ?? prev;
      },
    },
    props: {
      decorations(state) {
        const { ranges, active } = SEARCH_KEY.getState(state) ?? EMPTY_SEARCH;
        if (ranges.length === 0) return null;
        const decos: Decoration[] = ranges.map((r, i) =>
          Decoration.inline(r.from, r.to, {
            class: i === active ? "search-hit search-hit-active" : "search-hit",
          }),
        );
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}
