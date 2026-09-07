// 覆盖层横幅(10/11/12):文件被外部删除横幅、文件操作变更通知条。从 App.tsx 拆分(22)。

import type { CSSProperties } from "react";
import type { ChangeNotice } from "../session/types";

const btnSmall: CSSProperties = {
  padding: "3px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  cursor: "pointer",
};

const ghostAction: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--toast-action)",
  cursor: "pointer",
  fontSize: 13,
};

/** 正在编辑的文件被外部删除(12):恢复重建(救回键入)或放弃,不静默。
 *  颜色吃主题变量(05:三主题各自适配)。 */
export function DocMissingBanner(props: { onRecover: () => void; onAbandon: () => void }) {
  return (
    <div
      data-testid="doc-missing-banner"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        top: 12,
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 14px",
        background: "var(--banner-bg)",
        border: "1px solid var(--banner-border)",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span>文件已被删除</span>
      <button type="button" style={btnSmall} onClick={props.onRecover}>
        恢复重建
      </button>
      <button type="button" style={btnSmall} onClick={props.onAbandon}>
        放弃
      </button>
    </div>
  );
}

/** 文件操作变更通知条(10/11 单步撤销;导出完成动作按钮,19)。 */
export function ChangeNoticeToast(props: {
  notice: ChangeNotice;
  onUndo: () => void;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const { notice } = props;
  return (
    <div
      data-testid="change-notice"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 18,
        zIndex: 56,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "var(--toast-bg)", // 05:深色底改主题变量表达(night 同系)
        color: "var(--toast-fg)",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <span>{notice.label}</span>
      {notice.undo && (
        <button type="button" style={ghostAction} onClick={props.onUndo}>
          撤销
        </button>
      )}
      {notice.action && (
        <button type="button" style={ghostAction} data-testid="notice-action" onClick={props.onAction}>
          {notice.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="关闭"
        style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer" }}
        onClick={props.onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
