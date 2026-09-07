import { describe, expect, it } from "vitest";
import { extractOutline, outlineVisibility } from "./outline";

/** 手工伪造的 PM doc 子树(仅 descendants 形状;真实 schema 由 seam 集成测试守护)。 */
function fakeDoc(blocks: Array<{ type: string; text?: string; level?: number }>): {
  descendants(cb: (node: { type: { name: string }; attrs: Record<string, unknown>; textContent: string }, pos: number) => boolean | void): void;
} {
  return {
    descendants(cb) {
      let pos = 0;
      for (const b of blocks) {
        cb(
          { type: { name: b.type }, attrs: b.level !== undefined ? { level: b.level } : {}, textContent: b.text ?? "" },
          pos,
        );
        pos += (b.text ?? "").length + 1;
      }
    },
  };
}

describe("extractOutline(03:标题提取)", () => {
  it("按文档序提取 h1–h6(层级/文本/位置)", () => {
    const doc = fakeDoc([
      { type: "heading", text: "一", level: 1 },
      { type: "paragraph", text: "正文" },
      { type: "heading", text: "二", level: 2 },
      { type: "codeBlock", text: "x" },
    ]);
    expect(extractOutline(doc as never)).toEqual([
      { level: 1, text: "一", pos: 0 },
      { level: 2, text: "二", pos: 5 },
    ]);
  });

  it("空标题保留空串;无标题文档返回空列表", () => {
    const doc = fakeDoc([
      { type: "heading", text: "", level: 3 },
      { type: "paragraph", text: "正文" },
    ]);
    expect(extractOutline(doc as never)).toEqual([{ level: 3, text: "", pos: 0 }]);
    expect(extractOutline(fakeDoc([{ type: "paragraph", text: "x" }]) as never)).toEqual([]);
    expect(extractOutline(null)).toEqual([]);
  });

  it("非法 level 回落为 1", () => {
    const doc = fakeDoc([{ type: "heading", text: "x", level: 99 }]);
    expect(extractOutline(doc as never)[0]!.level).toBe(1);
  });
});

describe("outlineVisibility(03:折叠可见性)", () => {
  const items = [
    { level: 1, text: "a", pos: 1 },
    { level: 2, text: "a1", pos: 2 },
    { level: 3, text: "a1x", pos: 3 },
    { level: 2, text: "a2", pos: 4 },
    { level: 1, text: "b", pos: 5 },
  ] as const;

  it("未折叠时全部可见", () => {
    expect(outlineVisibility(items, new Set())).toEqual([true, true, true, true, true]);
  });

  it("折叠 a 隐藏其全部子级,但不影响兄弟标题 b", () => {
    expect(outlineVisibility(items, new Set([1]))).toEqual([true, false, false, false, true]);
  });

  it("折叠 a1 只隐藏其子级 a1x", () => {
    expect(outlineVisibility(items, new Set([2]))).toEqual([true, true, false, true, true]);
  });

  it("空列表/空折叠集", () => {
    expect(outlineVisibility([], new Set())).toEqual([]);
  });
});
