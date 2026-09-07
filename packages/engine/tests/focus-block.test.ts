// 专注模式焦点块装饰测试(06):selection 跟随 → 光标所在顶层块加 focus-block 类;
// 纯视图态(序列化零改动)。

import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";

function makeEngine(md: string): { engine: Engine; host: HTMLDivElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host);
  engine.loadMarkdown(md);
  return { engine, host };
}

describe("focus-block 装饰(06)", () => {
  it("光标所在段落获得 focus-block 类;其余块无", () => {
    const { engine, host } = makeEngine("# 甲\n\n正文一。\n\n正文二。\n");
    engine.setSelection(6, 6); // 光标在「正文一。」
    const ps = host.querySelectorAll("[contenteditable='true'] > p");
    expect(ps.length).toBe(2);
    expect(ps[0]!.classList.contains("focus-block")).toBe(true);
    expect(ps[1]!.classList.contains("focus-block")).toBe(false);
    engine.destroy();
  });

  it("光标移块后装饰跟随(旧块移除、新块获得)", () => {
    const { engine, host } = makeEngine("# 甲\n\n正文一。\n\n正文二。\n");
    engine.setSelection(6, 6);
    engine.setSelection(16, 16); // 光标移到「正文二。」
    const ps = host.querySelectorAll("[contenteditable='true'] > p");
    expect(ps[0]!.classList.contains("focus-block")).toBe(false);
    expect(ps[1]!.classList.contains("focus-block")).toBe(true);
    engine.destroy();
  });

  it("装载后初始选区即有焦点块(审查修:新文档专注模式不整篇淡出)", () => {
    const { engine, host } = makeEngine("# 甲\n\n正文一。\n");
    const h1 = host.querySelector("h1");
    expect(h1).not.toBeNull();
    // 装载后光标在文档首(标题处),首块立即带焦点标记
    expect(h1!.classList.contains("focus-block")).toBe(true);
    engine.destroy();
  });

  it("装饰为纯视图态:序列化字节不变", () => {
    const { engine } = makeEngine("# 甲\n\n正文一。\n");
    engine.setSelection(6, 6);
    expect(engine.getMarkdown()).toBe("# 甲\n\n正文一。\n");
    engine.destroy();
  });
});
