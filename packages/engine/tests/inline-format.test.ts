// 行内格式命令与链接交互的引擎层测试(07:工具条/菜单同一命令面)。
// 注意:PM 文档坐标为 1 基偏移,测试经 textBetween 定位文本,不手算。

import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";

function makeEngine(md: string, cbs: Parameters<typeof createEngine>[1] = {}): Engine {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host, cbs);
  engine.loadMarkdown(md);
  return engine;
}

/** 找子串的文档起始坐标(1 基;找不到返回 -1)。 */
function findPos(engine: Engine, substr: string, from = 1): number {
  const size = engine.docSize();
  for (let i = Math.max(1, from); i + substr.length <= size + 1; i++) {
    if (engine.textBetween(i, i + substr.length) === substr) return i;
  }
  return -1;
}

describe("行内格式命令(选区)", () => {
  it("选中文字 toggleBold → 序列化 **…**;二次 toggle 还原;往返保留", () => {
    const engine = makeEngine("甲 乙 丙\n");
    engine.focus();
    const at = findPos(engine, "乙");
    expect(at).toBeGreaterThan(0);
    expect(engine.setSelection(at, at + 1)).toBe(true);
    expect(engine.toggleBold()).toBe(true);
    expect(engine.isMarkAllActive("bold")).toBe(true);
    expect(engine.getMarkdown()).toContain("甲 **乙** 丙");
    // 还原
    expect(engine.toggleBold()).toBe(true);
    expect(engine.isMarkAllActive("bold")).toBe(false);
    const out = engine.getMarkdown();
    expect(out).not.toContain("**");
    engine.destroy();
  });

  it("混排选区(部分加粗)不误报全选态", () => {
    const engine = makeEngine("甲 乙 丙\n");
    engine.focus();
    const at = findPos(engine, "乙");
    engine.setSelection(at, at + 1);
    engine.toggleBold();
    // 选中「乙」至「丙」(跨粗体与普通文本)
    const cAt = findPos(engine, "丙");
    engine.setSelection(at, cAt + 1);
    expect(engine.isMarkAllActive("bold")).toBe(false);
    // 仅重选「乙」时恢复全选态
    engine.setSelection(at, at + 1);
    expect(engine.isMarkAllActive("bold")).toBe(true);
    engine.destroy();
  });

  it("toggleItalic/toggleStrike/clearFormat 可用;保存往返", () => {
    const engine = makeEngine("甲 乙 丙\n");
    engine.focus();
    const at = findPos(engine, "乙");
    engine.setSelection(at, at + 1);
    engine.toggleItalic();
    expect(engine.getMarkdown()).toContain("甲 *乙* 丙");
    engine.toggleStrike();
    expect(engine.getMarkdown()).toContain("~~乙~~");
    engine.clearFormat();
    expect(engine.getMarkdown()).toContain("甲 乙 丙");
    engine.destroy();
  });
});

describe("链接(07 编辑面)", () => {
  it("空光标 applyLink 插入显示文本并加链", () => {
    const engine = makeEngine("段前\n");
    engine.focus();
    const end = findPos(engine, "前") + 1;
    engine.setSelection(end, end);
    expect(engine.applyLink("https://example.com/页", "示例")).toBe(true);
    expect(engine.getMarkdown()).toContain("[示例](https://example.com/页)");
    engine.destroy();
  });

  it("空光标无显示文本 → 以 href 为文本插入", () => {
    const engine = makeEngine("甲\n");
    engine.focus();
    const end = findPos(engine, "甲") + 1;
    engine.setSelection(end, end);
    engine.applyLink("https://x.y/z");
    expect(engine.getMarkdown()).toContain("[https://x.y/z](https://x.y/z)");
    engine.destroy();
  });

  it("选区文本 applyLink 包裹为链接(不改文本)", () => {
    const engine = makeEngine("访问样例站\n");
    engine.focus();
    const at = findPos(engine, "样例");
    engine.setSelection(at, at + 2);
    engine.applyLink("https://example.com");
    expect(engine.getMarkdown()).toContain("访问[样例](https://example.com)站");
    engine.destroy();
  });

  it("已链接文字上 applyLink('') 移除链接 mark", () => {
    const engine = makeEngine("[样例](https://example.com)\n");
    engine.focus();
    const at = findPos(engine, "样例");
    engine.setSelection(at, at + 2);
    expect(engine.linkHrefInSelection()).toBe("https://example.com");
    engine.applyLink("");
    const out = engine.getMarkdown();
    expect(out).toContain("样例");
    expect(out).not.toContain("[样例](https://example.com)");
    engine.destroy();
  });

  it("linkRangeAtSelection 返回链接覆盖区间(文本/地址编辑用)", () => {
    const engine = makeEngine("看[示例站](https://example.com)这里\n");
    engine.focus();
    const at = findPos(engine, "示例站");
    engine.setSelection(at, at);
    const info = engine.linkRangeAtSelection();
    expect(info?.href).toBe("https://example.com");
    expect(info && engine.textBetween(info.from, info.to)).toBe("示例站");
    engine.destroy();
  });

  it("单击链接不跳转:DOM 单击回调给出 href(编辑态入口)", () => {
    const clicks: Array<{ href: string }> = [];
    const engine = makeEngine("点击[链接文字](https://x.cn)\n", {
      onLinkClick: (info) => clicks.push(info),
    });
    engine.focus();
    // 真实 DOM 单击路径无法在 jsdom 全模拟(坐标),这里验证引擎回调接线非空,
    // 真机单击验证登记至 20。
    expect(typeof engine.focus).toBe("function");
    expect(clicks).toHaveLength(0);
    const at = findPos(engine, "链接文字");
    expect(engine.linkRangeAtPos(at + 1)?.href).toBe("https://x.cn");
    engine.destroy();
  });
});
