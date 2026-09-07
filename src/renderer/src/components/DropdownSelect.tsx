// 自绘下拉选择器(反馈轮 02):替换原生 select——原生展开列表由操作系统渲染
// (night 下白底),主题 token 管不到;自绘用 --surface/--border/--shadow,
// 三主题全适配(复用 LangSelect 的浮层模式)。外部点击/Esc/滚动关闭;
// 按钮与行 mousedown preventDefault,不抢编辑区焦点。

import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownSelectProps {
  value: string;
  options: DropdownOption[];
  onSelect: (value: string) => void;
  /** 按钮 aria-label。 */
  ariaLabel: string;
  /** 按钮 data-testid。 */
  testId: string;
  /** 选项行 data-testid 前缀(行 = `${prefix}-${value}`)。 */
  itemTestIdPrefix: string;
  /** 按钮样式(尺寸/圆角/透明度等;内联覆盖组件默认)。 */
  buttonStyle?: CSSProperties;
  /** 整个控件禁用。 */
  disabled?: boolean;
  /** 浮层展开方向(顶部面板向下、底部工具栏向上)。 */
  direction?: "down" | "up";
}

export function DropdownSelect({
  value,
  options,
  onSelect,
  ariaLabel,
  testId,
  itemTestIdPrefix,
  buttonStyle,
  disabled = false,
  direction = "down",
}: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);

  const close = (): void => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      const t = e.target as Element | null;
      if (t && !t.closest(`[data-testid="${testId}"], [data-testid="${itemTestIdPrefix}-menu"]`)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    const onScroll = (): void => close(); // 滚动即关,避免 fixed 浮层错位
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, testId, itemTestIdPrefix]);

  const toggle = (): void => {
    if (disabled) return;
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setAnchor({ left: r.left, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, width: r.width });
    }
    setOpen((v) => !v);
  };

  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        style={{
          background: "transparent",
          color: "inherit",
          textAlign: "left",
          padding: 0,
          border: "none",
          outline: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          ...buttonStyle,
        }}
      >
        {current?.label ?? value}
      </button>
      {open && anchor && (
        <div
          data-testid={`${itemTestIdPrefix}-menu`}
          role="listbox"
          style={{
            position: "fixed",
            left: anchor.left,
            top: direction === "down" ? anchor.top : undefined,
            bottom: direction === "up" ? anchor.bottom : undefined,
            minWidth: anchor.width, // 反馈轮 03:宽度随内容自适应,不再按按钮宽截断折行
            zIndex: 80,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px var(--shadow)",
            padding: 4,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-testid={`${itemTestIdPrefix}-${o.value}`}
              disabled={o.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (o.disabled) return;
                onSelect(o.value);
                close();
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "3px 10px",
                fontSize: 12.5,
                border: "none",
                borderRadius: 4,
                background: o.value === value ? "var(--tree-active-bg)" : "transparent",
                color: "inherit",
                cursor: o.disabled ? "default" : "pointer",
                opacity: o.disabled ? 0.45 : 1,
                whiteSpace: "nowrap", // 反馈轮 03:选项独占一行不换行
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
