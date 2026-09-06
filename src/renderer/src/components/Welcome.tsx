// 欢迎页(13/25/27):未开工作区且无文档时的落点——产品名 + 标语行(纯空态)。
// 25 裁决定稿:移除「打开文件夹」主按钮,入口收敛到菜单(文件 → 打开文件夹, Ctrl+O)。
// 27 裁决:移除最近打开列表,页面不再陈列任何历史;打开一律经菜单。

export function Welcome() {
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
    </div>
  );
}
