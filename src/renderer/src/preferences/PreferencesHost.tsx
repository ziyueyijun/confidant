// 偏好设置窗口(07):左侧分类列表(外观/编辑器,预留扩展位)+ 右侧设置区。
// 独立 BrowserWindow(#preferences 路由,main 进程创建);样式吃主题变量
// (启动时读持久化主题写 data-theme)。改动经 stateSet 落盘,主进程广播
// state:changed 同步主窗口。

import { useEffect, useState } from "react";
import { normalizeTheme } from "../theme/theme-state";

type Category = "appearance" | "editor";

const CATEGORIES: ReadonlyArray<{ id: Category; label: string }> = [
  { id: "appearance", label: "外观" },
  { id: "editor", label: "编辑器" },
  // 预留扩展位(快捷键/导出等,spec Out of Scope 不实现内容)
];

interface EditorSettings {
  codeWrap: boolean;
  codeLineNumbers: boolean;
}

export function PreferencesHost() {
  const [category, setCategory] = useState<Category>("appearance");
  const [showToolbar, setShowToolbar] = useState(false);
  const [editor, setEditor] = useState<EditorSettings>({ codeWrap: true, codeLineNumbers: true });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      // 窗口标题(document.title 覆盖 BrowserWindow 初始 title)
      document.title = "confidant · 偏好设置";
      // 主题:窗口样式吃主题变量(读持久化选择)
      document.documentElement.dataset.theme = normalizeTheme(await window.confidant.stateGet("theme"));
      const prefs = (await window.confidant.stateGet("preferences")) as Partial<{ showToolbar: boolean }> | null;
      const eds = (await window.confidant.stateGet("editorSettings")) as Partial<EditorSettings> | null;
      if (prefs && typeof prefs.showToolbar === "boolean") setShowToolbar(prefs.showToolbar);
      if (eds) {
        setEditor({
          codeWrap: typeof eds.codeWrap === "boolean" ? eds.codeWrap : true,
          codeLineNumbers: typeof eds.codeLineNumbers === "boolean" ? eds.codeLineNumbers : true,
        });
      }
      setLoaded(true);
    })();
  }, []);

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 0",
    fontSize: 13,
  } as const;

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--app-bg)", color: "var(--app-fg)" }}>
      {/* 左:分类列表 */}
      <nav
        data-testid="pref-categories"
        style={{
          width: 140,
          flexShrink: 0,
          padding: "14px 0",
          borderRight: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            data-testid={`pref-cat-${c.id}`}
            onClick={() => setCategory(c.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 18px",
              fontSize: 13,
              border: "none",
              background: category === c.id ? "var(--tree-active-bg)" : "transparent",
              borderLeft: category === c.id ? "4px solid var(--tree-active-border)" : "4px solid transparent",
              color: category === c.id ? "var(--tree-active-fg)" : "inherit",
              fontWeight: category === c.id ? 600 : 400,
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {c.label}
          </button>
        ))}
      </nav>
      {/* 右:设置区 */}
      <main style={{ flex: 1, minWidth: 0, padding: "16px 22px", overflowY: "auto" }}>
        {!loaded ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>加载中…</div>
        ) : category === "appearance" ? (
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>外观</h2>
            <div style={rowStyle}>
              <input
                type="checkbox"
                data-testid="pref-show-toolbar"
                checked={showToolbar}
                onChange={(e) => {
                  setShowToolbar(e.target.checked);
                  window.confidant.stateSet("preferences", { showToolbar: e.target.checked });
                }}
              />
              <label htmlFor="pref-show-toolbar">显示工具栏(编辑区底部悬浮格式工具栏)</label>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, paddingLeft: 26 }}>
              默认隐藏;开启后编辑区底部显示格式工具栏(源码模式下自动隐藏)。
            </div>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>编辑器</h2>
            <div style={rowStyle}>
              <input
                type="checkbox"
                data-testid="pref-code-wrap"
                checked={editor.codeWrap}
                onChange={(e) => {
                  const next = { ...editor, codeWrap: e.target.checked };
                  setEditor(next);
                  window.confidant.stateSet("editorSettings", next);
                }}
              />
              <label>代码块自动换行</label>
            </div>
            <div style={rowStyle}>
              <input
                type="checkbox"
                data-testid="pref-code-line-numbers"
                checked={editor.codeLineNumbers}
                onChange={(e) => {
                  const next = { ...editor, codeLineNumbers: e.target.checked };
                  setEditor(next);
                  window.confidant.stateSet("editorSettings", next);
                }}
              />
              <label>代码块显示行号</label>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
