// 大纲面板(03):侧边栏「大纲」tab 内容——层级缩进(每级 1em)、点击跳转、
// 滚动跟随高亮(激活项加粗)、层级折叠(箭头收起隐藏全部子级)、空态占位。

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { outlineVisibility, type OutlineItem } from "../editor/outline";

export interface OutlinePanelProps {
  items: OutlineItem[];
  /** 当前滚动位置应高亮的标题 pos。 */
  activePos: number | null;
  /** 源码模式下禁用(空态占位)。 */
  disabled: boolean;
  /** 点击条目:滚动定位 + 光标置入标题处 + 编辑器聚焦(App 编排)。 */
  onJump: (item: OutlineItem) => void;
}

export function OutlinePanel({ items, activePos, disabled, onJump }: OutlinePanelProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());

  if (disabled) {
    return (
      <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
        源码模式下大纲不可用
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: "14px 18px", fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
        暂无标题
      </div>
    );
  }

  const visible = outlineVisibility(items, collapsed);
  // 有子级 = 其后存在层级更深的标题(单遍从右向左扫最小层级,避免 O(n²))
  const hasChildrenArr = new Array<boolean>(items.length).fill(false);
  {
    let minLevel = Infinity;
    for (let i = items.length - 1; i >= 0; i--) {
      hasChildrenArr[i] = items[i]!.level < minLevel;
      minLevel = Math.min(minLevel, items[i]!.level);
    }
  }
  return (
    <div data-testid="outline-panel" style={{ userSelect: "none", padding: "3px 0" }}>
      {items.map((item, i) => {
        if (!visible[i]) return null;
        const hasChildren = hasChildrenArr[i]!;
        const isCollapsed = collapsed.has(item.pos);
        const active = activePos === item.pos;
        return (
          <div
            key={`${item.pos}-${i}`}
            data-testid={`outline-item-${item.pos}`}
            data-active={active || undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: "3px 18px 3px 4px",
              paddingLeft: (item.level - 1) * 14 + 4,
              fontSize: 14,
              lineHeight: 1.5,
              cursor: "pointer",
              fontWeight: active ? 700 : 400,
              color: active ? "var(--app-fg)" : "var(--muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
            onClick={() => onJump(item)}
          >
            <button
              type="button"
              aria-label={isCollapsed ? "展开" : "折叠"}
              data-testid={`outline-collapse-${item.pos}`}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.pos)) next.delete(item.pos);
                  else next.add(item.pos);
                  return next;
                });
              }}
              style={{
                flexShrink: 0,
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                opacity: hasChildren ? 1 : 0,
                pointerEvents: hasChildren ? "auto" : "none",
                padding: 0,
              }}
            >
              <ChevronRight
                size={10}
                style={{
                  transform: isCollapsed ? undefined : "rotate(90deg)",
                  transition: "transform 0.1s",
                }}
              />
            </button>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: item.text ? undefined : "var(--muted)",
                fontStyle: item.text ? undefined : "italic",
              }}
            >
              {item.text || "(空标题)"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
