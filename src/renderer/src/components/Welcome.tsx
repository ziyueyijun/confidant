// 欢迎页(13):未开工作区时的落点——产品名、打开文件夹、最近打开列表。从 App.tsx 拆分(22)。

export interface WelcomeProps {
  recentFolders: Array<{ path: string; name: string }>;
  onOpenFolder: () => void;
  onOpenRecent: (path: string) => void;
}

export function Welcome({ recentFolders, onOpenFolder, onOpenRecent }: WelcomeProps) {
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
      <p style={{ margin: 0, color: "var(--muted)" }}>
        confidant · 像写字板一样,直接写在你的文件夹里
      </p>
      <button
        type="button"
        onClick={onOpenFolder}
        style={{
          marginTop: 8,
          padding: "10px 22px",
          fontSize: 15,
          borderRadius: 6,
          border: "1px solid #b8b8b8",
          cursor: "pointer",
          background: "#f5f5f5",
        }}
      >
        打开文件夹
      </button>
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
