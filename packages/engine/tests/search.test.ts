// 查找与高亮测试(14):子串匹配(中文/大小写/多命中)、decoration 不落盘不进历史。

import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";

function makeEngine(md: string): { engine: Engine; host: HTMLDivElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host);
  engine.loadMarkdown(md);
  return { engine, host };
}

describe("findInDoc", () => {
  it("中文子串多命中,区间指向文档坐标", () => {
    const { engine } = makeEngine("正文里出现 主题 与第二次 主题。\n");
    const hits = engine.findInDoc("主题");
    expect(hits.length).toBe(2);
    expect(engine.textBetween(hits[0]!.from, hits[0]!.to)).toBe("主题");
    engine.destroy();
  });

  it("大小写不敏感;空查询/无命中为空", () => {
    const { engine } = makeEngine("Alpha beta gamma\n");
    expect(engine.findInDoc("ALPHA").length).toBe(1);
    expect(engine.findInDoc("").length).toBe(0);
    expect(engine.findInDoc("不存在词").length).toBe(0);
    engine.destroy();
  });
});

describe("search highlights", () => {
  it("高亮渲染为 decoration,不进入序列化与历史", () => {
    const { engine, host } = makeEngine("甲 命中 乙 命中\n");
    const hits = engine.findInDoc("命中");
    engine.setSearchHighlights(hits, 0);
    const marked = host.querySelectorAll(".search-hit");
    expect(marked.length).toBe(2);
    const before = engine.getMarkdown();
    expect(before).not.toContain("<mark");
    expect(engine.canUndo()).toBe(false); // 无事务步骤
    engine.setSearchHighlights(hits, 1);
    expect(host.querySelectorAll(".search-hit-active").length).toBe(1);
    engine.clearSearchHighlights();
    expect(host.querySelectorAll(".search-hit").length).toBe(0);
    engine.destroy();
  });
});

describe("标题锚点(16)", () => {
  it("findHeadingAnchor 首个匹配(大小写/空白折叠);jump 选中标题", () => {
    const { engine } = makeEngine("# 上周 小结\n\n## 其他\n");
    const hit = engine.findHeadingAnchor("上周   小结");
    expect(hit).not.toBeNull();
    const { engine: e2 } = makeEngine("# 上周 小结\n\n# 上周 小结二\n");
    const hit2 = e2.findHeadingAnchor("上周小结二");
    expect(hit2).not.toBeNull();
    e2.destroy();
    engine.destroy();
  });

  it("无匹配返回 null 且不抛错", () => {
    const { engine } = makeEngine("# 甲\n");
    expect(engine.findHeadingAnchor("不存在")).toBeNull();
    expect(engine.jumpToHeading("不存在")).toBe(false);
    engine.destroy();
  });
});
