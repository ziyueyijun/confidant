// 打印/导出宿主(19):隐藏窗口内渲染「当前文档渲染通道」,恒浅色观感。
// 收到主进程负载 → 装载引擎(只读容器)→ 就绪回执 → 主进程 printToPDF/系统打印。

import { useEffect, useRef, useState } from "react";
import { createEngine } from "../../../../packages/engine";

export function PrintHost() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const [payload, setPayload] = useState<{ head: string | null; bodyMd: string } | null>(null);

  // 恒浅色:即使系统深色,导出/打印恒浅(规格 §12/§13)
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("confidant-print");
  }, []);

  // 拉取当前打印负载(主进程先于窗口创建写入;拉取防竞态)
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const p = await window.confidant.getPrintData();
      if (disposed) return;
      setPayload(p);
      if (!p) window.confidant.printReady(false);
    })();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!payload || !hostRef.current) return;
    const host = hostRef.current;
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    const engine = createEngine(host);
    engineRef.current = engine;
    engine.loadMarkdown(payload.bodyMd);
    // 让首帧渲染与字体稳定后回执
    const t = setTimeout(() => window.confidant.printReady(true), 500);
    return () => {
      clearTimeout(t);
      engine.destroy();
      engineRef.current = null;
    };
  }, [payload]);

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "36px 48px 48px",
        fontFamily:
          '"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif',
        color: "var(--app-fg)",
      }}
    >
      {payload?.head && (
        <div className="fm-block" style={{ padding: 0, marginBottom: 12 }}>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {payload.head.replace(/\n$/, "")}
          </pre>
        </div>
      )}
      <div ref={hostRef} className="editor-prose" style={{ padding: "0 0 60px" }} />
    </div>
  );
}
