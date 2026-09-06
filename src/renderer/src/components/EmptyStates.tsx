// 编辑区空态提示(04/10):空工作区引导与「从左侧选择」占位。从 App.tsx 拆分(22)。

export const EMPTY_WORKSPACE_GUIDANCE =
  "这个文件夹还没有笔记:右键左侧空白处可以新建,也可以把 .md 文件放进这个文件夹。";

/** 空工作区(无任何 .md)居中引导。 */
export function EmptyWorkspaceGuidance() {
  return (
    <div
      data-testid="empty-workspace-guidance"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <p
        style={{
          maxWidth: 420,
          textAlign: "center",
          lineHeight: 1.8,
          color: "var(--muted)",
          fontSize: 14,
        }}
      >
        {EMPTY_WORKSPACE_GUIDANCE}
      </p>
    </div>
  );
}

/** 有工作区未开文档时的轻提示(仅当树内确有 .md)。 */
export function NotePickHint() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <p style={{ color: "var(--border)", fontSize: 14 }}>从左侧选择一个笔记开始书写</p>
    </div>
  );
}
