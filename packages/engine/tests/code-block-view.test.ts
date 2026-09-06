// 代码块视图层测试(28):高亮装饰(语言注册才高亮,不自动探测)、行号 widget、
// 开关联动、序列化/往返不回归(装饰层零文档改动)。

import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";

function makeEngine(md: string): { engine: Engine; host: HTMLDivElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host);
  engine.loadMarkdown(md);
  return { engine, host };
}

function codeEl(host: HTMLDivElement): HTMLElement | null {
  return host.querySelector("[contenteditable='true'] pre code");
}

describe("代码块高亮(28)", () => {
  it("带已注册语言的代码块出现 hljs 装饰 class", () => {
    const { engine, host } = makeEngine("```js\nconst x = 1;\n```\n");
    const code = codeEl(host);
    expect(code).not.toBeNull();
    expect(code!.querySelector(".hljs-keyword")).not.toBeNull();
    expect(code!.querySelector(".hljs-number")).not.toBeNull();
    engine.destroy();
  });

  it("无语言代码块不做高亮(不自动探测,28 裁决)", () => {
    const { engine, host } = makeEngine("```\nconst x = 1;\n```\n");
    const code = codeEl(host);
    expect(code!.querySelector(".hljs-keyword")).toBeNull();
    engine.destroy();
  });

  it("未知语言代码块不做高亮", () => {
    const { engine, host } = makeEngine("```nolangxyz\nfoo\n```\n");
    const code = codeEl(host);
    expect(code!.querySelector(".hljs-keyword")).toBeNull();
    engine.destroy();
  });
});

describe("代码块行号(28)", () => {
  it("行号 widget 默认存在,每行一个块级 span(不依赖 white-space)", () => {
    const { engine, host } = makeEngine("```js\na\nb\nc\n```\n");
    const nums = host.querySelector("[contenteditable='true'] .code-linenums");
    expect(nums).not.toBeNull();
    const lines = [...nums!.querySelectorAll(".code-ln")].map((s) => s.textContent);
    expect(lines).toEqual(["1", "2", "3"]);
    engine.destroy();
  });

  it("setCodeBlockOptions 关闭后行号消失,开启恢复", () => {
    const { engine, host } = makeEngine("```js\na\nb\n```\n");
    expect(host.querySelector(".code-linenums")).not.toBeNull();
    engine.setCodeBlockOptions({ lineNumbers: false });
    expect(host.querySelector(".code-linenums")).toBeNull();
    engine.setCodeBlockOptions({ lineNumbers: true });
    expect(host.querySelector(".code-linenums")).not.toBeNull();
    engine.destroy();
  });

  it("行号文本不进入文档文本(复制取码语义)", () => {
    const { engine, host } = makeEngine("```js\na\nb\n```\n");
    const code = codeEl(host);
    const clone = code!.cloneNode(true) as HTMLElement;
    clone.querySelector(".code-linenums")?.remove();
    expect(clone.textContent).toBe("a\nb");
    engine.destroy();
  });});

describe("代码块往返不回归(28)", () => {
  it("高亮与行号为纯视图态:序列化字节不变", () => {
    const md = "```js\nconst x = 1;\n```\n";
    const { engine, host } = makeEngine(md);
    expect(host.querySelector(".hljs-keyword")).not.toBeNull();
    expect(host.querySelector(".code-linenums")).not.toBeNull();
    expect(engine.getMarkdown()).toBe(md);
    engine.destroy();
  });

  it("语言属性跨装载无损", () => {
    const md = "```ts\nlet y: number = 2;\n```\n";
    const { engine } = makeEngine(md);
    const out = engine.getMarkdown();
    engine.destroy();
    const { engine: e2, host: h2 } = makeEngine(out);
    expect(h2.querySelector(".hljs-keyword")).not.toBeNull();
    expect(e2.getMarkdown()).toBe(md);
    e2.destroy();
  });
});
