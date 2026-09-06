// 文本输入对话框(重命名/新建文件夹;原生无 prompt,小型内联)。

import { useEffect, useRef, useState } from "react";

export interface TextPromptProps {
  title: string;
  initial?: string;
  okLabel?: string;
  /** 命中即判定不可用(错误提示为红字);返回 null 表示无校验。 */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextPrompt({ title, initial = "", okLabel = "确定", validate, onSubmit, onCancel }: TextPromptProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (): void => {
    const v = value.trim();
    if (!v) {
      setError("名称不能为空");
      return;
    }
    const bad = validate ? validate(v) : null;
    if (bad) {
      setError(bad);
      return;
    }
    onSubmit(v);
  };

  return (
    <div
      data-testid="text-prompt"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.15)",
        zIndex: 60,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: 340,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 14,
          boxShadow: "0 4px 18px rgba(0,0,0,.18)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          style={{
            padding: "6px 8px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid #bbb",
            outline: "none",
          }}
        />
        {error && (
          <div data-testid="prompt-error" style={{ color: "#c0392b", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          <button type="button" onClick={onCancel} style={btnStyle}>
            取消
          </button>
          <button type="button" data-testid="prompt-ok" onClick={commit} style={{ ...btnStyle, background: "#e8f1fb" }}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 14px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #c5c5c5",
  background: "#fff",
  cursor: "pointer",
};
