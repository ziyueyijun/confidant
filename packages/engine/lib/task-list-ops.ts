// 任务列表结构操作(09):勾选切换与缩进/反缩进的结构化搬移。从 engine.ts 抽(23)。
import type { Editor } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";

/** 切换任务项完成态(checkbox 点击与右键命令共用;文档 attrs 驱动渲染)。 */
export function toggleCheckedViaDom(ed: Editor, li: Element): boolean {
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
export function moveTaskItem(state: EditorState, dispatch: (tr: Transaction) => void, dir: "in" | "out"): boolean {
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
