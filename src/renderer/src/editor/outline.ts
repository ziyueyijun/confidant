// 大纲面板数据(03):doc 树 → 标题列表(层级/文本/位置)与折叠可见性。
// 纯函数,不改引擎(经只读 getDoc() 取数);点击跳转/滚动跟随由面板与 App 编排。

import type { ProseMirrorDoc } from "../../../../packages/engine";

export interface OutlineItem {
  /** 1–6(对应 h1–h6)。 */
  level: number;
  /** 标题纯文本(空标题保留空串,跳转以位置为准)。 */
  text: string;
  /** 标题节点在 doc 中的起始位置(点击跳转/滚动跟随用)。 */
  pos: number;
}

/** 按文档序提取全部标题节点。 */
export function extractOutline(doc: ProseMirrorDoc | null): OutlineItem[] {
  if (!doc) return [];
  const out: OutlineItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name.startsWith("heading")) {
      const level = Number(node.attrs.level);
      out.push({
        level: Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1,
        text: node.textContent,
        pos,
      });
    }
    return true;
  });
  return out;
}

/** 折叠可见性(03):标题 i 是否因祖先标题折叠而隐藏。O(n) 栈扫描。
 *  flat 大纲中标题的祖先 = 其左侧最近的层级更低的标题。 */
export function outlineVisibility(items: readonly OutlineItem[], collapsed: ReadonlySet<number>): boolean[] {
  const out = new Array<boolean>(items.length);
  // 栈:当前链上各级标题(level 递增),visible = 自身及其祖先均未折叠
  const stack: Array<{ level: number; pos: number; visible: boolean }> = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= it.level) stack.pop();
    const top = stack[stack.length - 1];
    const visible = top ? top.visible && !collapsed.has(top.pos) : true;
    out[i] = visible;
    stack.push({ level: it.level, pos: it.pos, visible });
  }
  return out;
}
