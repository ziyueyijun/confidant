import { describe, expect, it } from "vitest";
import { codeBlockLanguages, languageForPre } from "./code-block-lang";

function fakeDoc(blocks: Array<{ type: string; lang?: string }>): {
  descendants(cb: (node: { type: { name: string }; attrs: Record<string, unknown> }) => boolean | void): void;
} {
  return {
    descendants(cb) {
      for (const b of blocks) {
        cb({ type: { name: b.type }, attrs: b.lang !== undefined ? { language: b.lang } : {} });
      }
    },
  };
}

describe("codeBlockLanguages(反馈轮 01:浮层语言数据)", () => {
  it("提取全部 codeBlock 语言(文档序);无语言 → null", () => {
    const doc = fakeDoc([
      { type: "paragraph" },
      { type: "codeBlock", lang: "js" },
      { type: "codeBlock" },
      { type: "codeBlock", lang: "" },
      { type: "codeBlock", lang: "ts" },
    ]);
    expect(codeBlockLanguages(doc as never)).toEqual(["js", null, null, "ts"]);
  });

  it("null doc → 空数组", () => {
    expect(codeBlockLanguages(null)).toEqual([]);
  });

  it("languageForPre 按序 zip(host 内 pre 序号 ↔ 语言列表)", () => {
    document.body.innerHTML =
      "<div data-testid='editor-prose'><pre></pre><pre></pre><pre></pre></div>";
    const pres = document.querySelectorAll("[data-testid='editor-prose'] pre");
    const langs = ["js", null, "ts"];
    expect(languageForPre(pres[0] as HTMLElement, langs)).toBe("js");
    expect(languageForPre(pres[1] as HTMLElement, langs)).toBeNull();
    expect(languageForPre(pres[2] as HTMLElement, langs)).toBe("ts");
  });

  it("host 外元素 → null", () => {
    document.body.innerHTML = "<pre></pre>";
    const pre = document.querySelector("pre") as HTMLElement;
    expect(languageForPre(pre, ["js"])).toBeNull();
  });
});
