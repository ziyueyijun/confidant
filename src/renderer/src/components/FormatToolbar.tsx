// 底部悬浮格式工具栏(07):12 按钮三组 + 标题下拉,胶囊形态(bottom 14px、圆角
// 18px、按钮 28×28 圆角 7px、图标 13px、分隔线 1×18px、双层柔和投影,基线 §3.3)。
// 默认隐藏(偏好设置「外观 → 显示工具栏」开启且非源码模式时显示);命令与菜单同一
// 引擎命令面。

import {
  Bold,
  Code,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Strikethrough,
  Table,
} from "lucide-react";
import type { Engine } from "../../../../packages/engine";
import { DropdownSelect } from "./DropdownSelect";

/** 标题下拉选项(07;反馈轮 02:原生 select 改自绘——展开列表 OS 渲染、
    night 下白底,CSS 变量管不到)。 */
const HEADING_OPTIONS = [
  { value: "paragraph", label: "正文" },
  { value: "heading1", label: "标题 1" },
  { value: "heading2", label: "标题 2" },
  { value: "heading3", label: "标题 3" },
  { value: "heading4", label: "标题 4" },
  { value: "heading5", label: "标题 5" },
  { value: "heading6", label: "标题 6" },
];

export interface FormatToolbarProps {
  engine: Engine | null;
  /** 引擎节拍(选区/编辑后重算激活态与标题下拉)。 */
  tick: number;
  /** 链接面板唤起(菜单命令同一通道)。 */
  onLink: () => void;
  /** 插入图片(菜单命令同一通道)。 */
  onInsertImage: () => void;
  /** 命令执行后节拍递增(激活态刷新)。 */
  bump: () => void;
}

const btnBase: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 7,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  opacity: 0.6,
};

const sep: React.CSSProperties = {
  width: 1,
  height: 18,
  background: "var(--toolbar-border)", // 反馈轮 02:分隔线走 token(原 rgba 硬编码)
  margin: "0 3px",
  flexShrink: 0,
};

export function FormatToolbar({ engine, tick, onLink, onInsertImage, bump }: FormatToolbarProps) {
  const run = (fn: (e: Engine) => boolean): void => {
    if (!engine) return;
    fn(engine);
    bump();
  };

  // 激活态:行内格式按选区(engine.isMarkAllActive);标题下拉按光标所在块(DOM)
  const boldOn = engine?.isMarkAllActive("bold") ?? false;
  const italicOn = engine?.isMarkAllActive("italic") ?? false;
  const strikeOn = engine?.isMarkAllActive("strike") ?? false;
  const sel = window.getSelection();
  const blockEl = sel?.anchorNode
    ? (sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : (sel.anchorNode as Element))?.closest(
        "h1, h2, h3, h4, h5, h6, p",
      )
    : null;
  const headingValue = blockEl?.tagName?.match(/^H([1-6])$/)
    ? `heading${RegExp.$1}`
    : "paragraph";

  const mkBtn = (
    testid: string,
    label: string,
    onClick: () => void,
    icon: React.ReactNode,
    active = false,
  ) => (
    <button
      key={testid}
      type="button"
      data-testid={testid}
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()} // 不抢编辑区焦点
      style={{
        ...btnBase,
        opacity: active ? 1 : 0.6,
        background: active ? "var(--toolbar-btn-active)" : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--toolbar-btn-hover)";
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.opacity = active ? "1" : "0.6";
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      data-testid="format-toolbar"
      style={{
        position: "fixed",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "3px 6px",
        borderRadius: 18,
        background: "var(--toolbar-bg)",
        border: "1px solid var(--toolbar-border)",
        color: "var(--toolbar-fg)",
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,.02)) drop-shadow(0 6px 16px rgba(0,0,0,.08))",
        userSelect: "none",
      }}
    >
      {/* 组 1:行内格式 + 标题下拉 */}
      {mkBtn("ft-bold", "加粗", () => run((e) => e.toggleBold()), <Bold size={13} />, boldOn)}
      {mkBtn("ft-italic", "斜体", () => run((e) => e.toggleItalic()), <Italic size={13} />, italicOn)}
      {mkBtn(
        "ft-strike",
        "删除线",
        () => run((e) => e.toggleStrike()),
        <Strikethrough size={13} />,
        strikeOn,
      )}
      <DropdownSelect
        value={headingValue}
        options={HEADING_OPTIONS}
        onSelect={(v) => {
          if (!engine) return;
          if (v === "paragraph") engine.setBlockKind("paragraph");
          else engine.setBlockKind(v as "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6");
          bump();
        }}
        ariaLabel="标题"
        testId="ft-heading-select"
        itemTestIdPrefix="ft-heading"
        direction="up"
        buttonStyle={{ height: 28, maxWidth: 96, fontSize: 12.5, borderRadius: 7, opacity: 0.6, padding: "0 4px" }}
      />
      <div style={sep} />
      {/* 组 2:块级 */}
      {mkBtn("ft-bullet", "无序列表", () => run((e) => e.setBlockKind("bulletList")), <List size={13} />)}
      {mkBtn("ft-ordered", "有序列表", () => run((e) => e.setBlockKind("orderedList")), <ListOrdered size={13} />)}
      {mkBtn("ft-task", "任务列表", () => run((e) => e.setBlockKind("taskList")), <ListTodo size={13} />)}
      {mkBtn("ft-quote", "引用", () => run((e) => e.setBlockKind("quote")), <Quote size={13} />)}
      {mkBtn("ft-code", "代码块", () => run((e) => e.setBlockKind("codeBlock")), <Code size={13} />)}
      {mkBtn("ft-table", "表格", () => run((e) => e.insertTable()), <Table size={13} />)}
      <div style={sep} />
      {/* 组 3:链接/图片 */}
      {mkBtn("ft-link", "链接", onLink, <Link size={13} />)}
      {mkBtn("ft-image", "插入图片", onInsertImage, <ImageIcon size={13} />)}
    </div>
  );
}
