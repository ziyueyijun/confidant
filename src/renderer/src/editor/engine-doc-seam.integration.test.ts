// 02 集成探针:真实引擎(jsdom)装载围栏代码块 → getDoc() 只读访问器可用。
// 语言标签 widget 的 DOM 断言在引擎 code-block-view 测试域;本文件守护
// 「渲染层经引擎入口点读取 PM doc」这条 seam(03 大纲同源)。
import { describe, expect, it } from "vitest";
import { createEngine } from "../../../../packages/engine";

function mountEngine(markdown: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host, {}, { resolveImageUrl: (s) => s });
  engine.loadMarkdown(markdown);
  return { engine, host };
}

describe("Engine.getDoc() 渲染层 seam(02/03)", () => {
  it("可经入口点读取当前文档树(含 codeBlock language 属性)", () => {
    const { engine, host } = mountEngine("```js\nconst x = 1;\n```\n");
    try {
      const doc = engine.getDoc();
      expect(doc).not.toBeNull();
      const langs: string[] = [];
      doc!.descendants((node) => {
        if (node.type.name === "codeBlock") {
          langs.push(node.attrs.language as string);
        }
        return true;
      });
      expect(langs).toEqual(["js"]);
      // 语言标签浮层数据源可用(反馈轮 01:widget 已移除,渲染层浮层经 getDoc 提取)
      expect(host.querySelector(".code-lang")).toBeNull();
      expect(host.querySelector(".hljs-keyword")).not.toBeNull();
    } finally {
      engine.destroy();
      host.remove();
    }
  });

  it("无语言围栏不产生标签 widget", () => {
    const { engine, host } = mountEngine("```\nplain\n```\n");
    try {
      expect(engine.getDoc()).not.toBeNull();
      expect(host.querySelector(".code-lang")).toBeNull();
    } finally {
      engine.destroy();
      host.remove();
    }
  });
});
