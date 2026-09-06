// 链接区间定位(07/16):从 pos 向两侧合并同 href 的相邻链接文本节点。从 engine.ts 抽(23)。
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/** 链接节点信息(07 编辑 / 16 打开共用)。 */
export interface LinkInfo {
  href: string;
  /** 链接 mark 覆盖的文本区间(改文本/地址用)。 */
  from: number;
  to: number;
}

/** 链接 mark 文本区间扩展:从 pos 向两侧合并同 href 的相邻链接文本节点。 */
export function linkRangeAt(ed: Editor, pos: number): LinkInfo | null {
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
