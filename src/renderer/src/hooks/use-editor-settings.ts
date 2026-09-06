// 编辑器设置(28):代码块自动换行/行号开关,持久化到 state("editorSettings")。
// 默认均开(28 裁决);勾选即时生效 + 防抖落盘(与侧栏布局同模式)。

import { useCallback, useEffect, useState } from "react";

export interface EditorSettings {
  /** 代码块自动换行(关 = 横向滚动)。 */
  codeWrap: boolean;
  /** 代码块显示行号。 */
  codeLineNumbers: boolean;
}

const DEFAULT_SETTINGS: EditorSettings = { codeWrap: true, codeLineNumbers: true };

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
