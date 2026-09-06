// 顶栏(04/02):侧栏开关、工作区/文档名、保存状态条与保存按钮。从 App.tsx 拆分(22)。

import type { OpenNote } from "../session/types";
import type { Workspace } from "../workspace/workspace";

export interface TopBarProps {
  workspace: Workspace | null;
  doc: OpenNote | null;
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  /** 状态条文案(保存中…/已保存/错误/有未保存修改/已打开…,App 按 saveState 合成)。 */
  statusText: string;
  errorText: string | null;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

export function TopBar({
  workspace,
  doc,
  sidebarVisible,
  onToggleSidebar,
  statusText,
  errorText,
  dirty,
  saving,
  onSave,
}: TopBarProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 12px",
        borderBottom: "1px solid var(--shell-border, var(--border))",
        background: "var(--shell-bg, var(--panel))",
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {/* 27:无工作区时开关也可点(空态侧栏由 App 渲染) */}
      <button
        type="button"
        data-testid="sidebar-toggle"
        title={sidebarVisible ? "收起侧栏" : "显示侧栏"}
        onClick={onToggleSidebar}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 14,
          padding: "2px 6px",
          color: "inherit",
        }}
      >
        {sidebarVisible ? "◀" : "▶"}
      </button>
      {doc && <strong style={{ fontSize: 14 }}>{doc.name}</strong>}
      {!doc && workspace && (
        <strong style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>{workspace.name}</strong>
      )}
      {!workspace && <strong style={{ fontSize: 14 }}>知己笔记</strong>}
      {doc && <span style={{ color: errorText ? "var(--danger)" : "var(--muted)" }}>{statusText}</span>}
      {errorText && (
        <span data-testid="load-error" style={{ color: "var(--danger)" }}>
          {errorText}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {doc && (
        <button type="button" onClick={onSave} disabled={!dirty || saving}>
          保存
        </button>
      )}
    </header>
  );
}
