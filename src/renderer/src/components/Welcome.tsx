// 欢迎页(13/25):未开工作区时的落点——产品名、标语行、最近打开列表。
// 25 裁决定稿:移除「打开文件夹」主按钮,入口统一收敛到菜单(文件 → 打开文件夹, Ctrl+O)。

export interface WelcomeProps {
  recentFolders: Array<{ path: string; name: string }>;
  onOpenRecent: (path: string) => void;
}

export function Welcome({ recentFolders, onOpenRecent }: WelcomeProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "var(--color-background, #fff)",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>知己笔记</h1>
      <p style={{ margin: 0, color: "var(--muted)" }}>最懂你的笔记软件</p>
      {recentFolders.length > 0 && (
        <div
          data-testid="welcome-recents"
          style={{ marginTop: 22, width: 320, maxHeight: 220, overflowY: "auto" }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>最近打开</div>
          {recentFolders.map((r) => (
            <button
              key={r.path}
              type="button"
              title={r.path}
              onClick={() => onOpenRecent(r.path)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
                color: "inherit",
                borderRadius: 4,
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
