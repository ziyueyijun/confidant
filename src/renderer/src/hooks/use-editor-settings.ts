// 编辑器设置(28 → 反馈轮 01):代码块自动换行(默认关——默认不换行横向滚动,
// 与 Typora 一致,行号对齐)/行号开关(默认开),持久化到 state("editorSettings")。

import { useCallback, useEffect, useState } from "react";

export interface EditorSettings {
  /** 代码块自动换行(关 = 横向滚动;反馈轮 01 默认关)。 */
  codeWrap: boolean;
  /** 代码块显示行号。 */
  codeLineNumbers: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = { codeWrap: false, codeLineNumbers: true };

export function useEditorSettings(): {
  settings: EditorSettings;
  toggleCodeWrap: () => void;
  toggleCodeLineNumbers: () => void;
} {
  const [settings, setSettings] = useState<EditorSettings>(DEFAULT_SETTINGS);

  // 启动载入持久化设置
  useEffect(() => {
    void (async () => {
      const stored = (await window.confidant.stateGet("editorSettings")) as
        | Partial<EditorSettings>
        | null;
      if (stored && typeof stored === "object") {
        setSettings((prev) => ({
          codeWrap: typeof stored.codeWrap === "boolean" ? stored.codeWrap : prev.codeWrap,
          codeLineNumbers:
            typeof stored.codeLineNumbers === "boolean" ? stored.codeLineNumbers : prev.codeLineNumbers,
        }));
      }
    })();
  }, []);

  // 跨窗同步(07):偏好设置窗口改动后广播到达即重载
  useEffect(() => {
    return window.confidant.onStateChanged((key) => {
      if (key !== "editorSettings") return;
      void (async () => {
        const stored = (await window.confidant.stateGet("editorSettings")) as
          | Partial<EditorSettings>
          | null;
        if (stored && typeof stored === "object") {
          setSettings((prev) => ({
            codeWrap: typeof stored.codeWrap === "boolean" ? stored.codeWrap : prev.codeWrap,
            codeLineNumbers:
              typeof stored.codeLineNumbers === "boolean" ? stored.codeLineNumbers : prev.codeLineNumbers,
          }));
        }
      })();
    });
  }, []);

  const toggle = useCallback((key: "codeWrap" | "codeLineNumbers") => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.confidant.stateSet("editorSettings", next);
      return next;
    });
  }, []);

  const toggleCodeWrap = useCallback(() => toggle("codeWrap"), [toggle]);
  const toggleCodeLineNumbers = useCallback(() => toggle("codeLineNumbers"), [toggle]);

  return { settings, toggleCodeWrap, toggleCodeLineNumbers };
}
