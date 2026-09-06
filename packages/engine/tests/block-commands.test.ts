// 块级命令测试(08:标题/正文/列表/引用/代码块/表格;多块生效;撤销重做链路)。

import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";

function makeEngine(md: string): Engine {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host);
  engine.loadMarkdown(md);
  engine.focus();
  return engine;
}

function findPos(engine: Engine, substr: string, from = 1): number {
  const size = engine.docSize();
  for (let i = Math.max(1, from); i + substr.length <= size + 1; i++) {
    if (engine.textBetween(i, i + substr.length) === substr) return i;
  }
  return -1;
}

describe("块级命令", () => {
  it("光标在段落中 → heading2 → 序列化 ##;正文命令还原", () => {
    const engine = makeEngine("第一段\n\n第二段\n");
    const at = findPos(engine, "第二段");
    engine.setSelection(at, at + 1);
    expect(engine.setBlockKind("heading2")).toBe(true);
    expect(engine.getMarkdown()).toContain("## 第二段");
    engine.setSelection(at, at + 1);
    expect(engine.setBlockKind("paragraph")).toBe(true);
    expect(engine.getMarkdown()).toContain("第二段");
    expect(engine.getMarkdown()).not.toContain("## 第二段");
    engine.destroy();
  });

  it("多块选择:命令对每块生效(两段同时转标题)", () => {
    const engine = makeEngine("甲段\n\n乙段\n");
    const a = findPos(engine, "甲段");
    const b = findPos(engine, "乙段");
    engine.setSelection(a, b + 2); // 跨两段
    expect(engine.setBlockKind("heading3")).toBe(true);
    const out = engine.getMarkdown();
    expect(out).toContain("### 甲段");
    expect(out).toContain("### 乙段");
    engine.destroy();
  });

  it("段落 → 无序列表 → 任务列表,各自独立文档转换正确", () => {
    // 无序列表
    const ul = makeEngine("条目内容\n");
    const at = findPos(ul, "条目内容");
    ul.setSelection(at, at + 1);
    expect(ul.setBlockKind("bulletList")).toBe(true);
    expect(ul.getMarkdown()).toContain("- 条目内容");
    ul.destroy();
    // 任务列表
    const tl = makeEngine("待办甲\n");
    const atTl = findPos(tl, "待办甲");
    tl.setSelection(atTl, atTl + 1);
    expect(tl.setBlockKind("taskList")).toBe(true);
    expect(tl.getMarkdown()).toContain("- [ ] 待办甲");
    tl.destroy();
    // 引用与代码块同文档转换
    const q = makeEngine("引用行\n");
    const atQ = findPos(q, "引用行");
    q.setSelection(atQ, atQ + 1);
    expect(q.setBlockKind("quote")).toBe(true);
    expect(q.getMarkdown()).toContain("> 引用行");
    q.destroy();
    const cb = makeEngine("代码行\n");
    const atCb = findPos(cb, "代码行");
    cb.setSelection(atCb, atCb + 1);
    expect(cb.setBlockKind("codeBlock")).toBe(true);
    const cbOut = cb.getMarkdown();
    expect(cbOut).toContain("```");
    expect(cbOut).toContain("代码行");
    cb.destroy();
  });

  it("插入表格:出现空表格、光标进入单元格,序列化合法表格;往返保留", () => {
    const engine = makeEngine("表格前\n");
    const at = findPos(engine, "表格前");
    engine.setSelection(at + 3, at + 3);
    expect(engine.insertTable(2, 2)).toBe(true);
    // 光标随插入进入表格(首个单元格内)
    expect(engine.isInsideTable()).toBe(true);
    const out = engine.getMarkdown();
    expect(out).toContain("| --- | --- |");
    // 往返:重开仍为表格结构
    engine.loadMarkdown(out);
    expect(engine.getMarkdown()).toContain("| --- | --- |");
    engine.destroy();
  });

  it("表格内块命令禁用的上下文标记正确", () => {
    const engine = makeEngine("段\n");
    expect(engine.isInsideTable()).toBe(false);
    engine.destroy();
  });

  it("撤销/重做覆盖块级变更与表格插入(历史链路)", () => {
    const engine = makeEngine("独段\n");
    const at = findPos(engine, "独段");
    engine.setSelection(at, at + 1);
    engine.setBlockKind("heading1");
    expect(engine.getMarkdown()).toContain("# 独段");
    expect(engine.canUndo()).toBe(true);
    engine.undo();
    expect(engine.getMarkdown()).toContain("独段");
    expect(engine.getMarkdown()).not.toContain("# 独段");
    engine.redo();
    expect(engine.getMarkdown()).toContain("# 独段");
    engine.destroy();
  });
});
