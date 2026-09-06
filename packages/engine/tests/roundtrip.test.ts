// 引擎冒烟:显式扩展注册下 markdown ↔ 文档 的往返与图片防丢链(01 票验收)。
// 断言风格:序列化结果确定性(同一输入 → 同一输出),语义锚点显式抽查;
// 细粒度规范化矩阵夹具归 02 票。

import { describe, expect, it } from "vitest";
import { createEngine } from "../index";

function roundTrip(md: string): string {
  const host = document.createElement("div");
  const engine = createEngine(host);
  try {
    engine.loadMarkdown(md);
    return engine.getMarkdown();
  } finally {
    engine.destroy();
    host.remove();
  }
}

describe("markdown 往返(语义级)", () => {
  it("中文日常文本往返不丢语义(标题/段落/引用/列表)", () => {
    const input = [
      "# 标题一",
      "",
      "段落里有**粗体**、*斜体*、~~删除线~~与`行内代码`。",
      "",
      "> 引用行",
      "",
      "- 无序甲",
      "- 无序乙",
      "",
      "1. 有序一",
      "2. 有序二",
      "",
    ].join("\n");
    const out = roundTrip(input);
    expect(out).toContain("# 标题一");
    expect(out).toContain("**粗体**");
    expect(out).toContain("> 引用行");
    expect(out).toContain("- 无序甲");
    expect(out).toContain("1. 有序一");
    expect(out).toContain("`行内代码`");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("文末只有一个换行(序列化丢文末换行由引擎补齐)", () => {
    const out = roundTrip("一行文字");
    expect(out).toBe("一行文字\n");
  });

  it("代码块围栏与语言信息往返不丢", () => {
    const input = ["```ts", "const x: number = 1;", "```", ""].join("\n");
    const out = roundTrip(input);
    expect(out).toContain("```ts");
    expect(out).toContain("const x: number = 1;");
  });

  it("表格结构往返保留(GFM;列宽衬垫属规格内规范化,断言先去衬垫)", () => {
    const input = ["| 列甲 | 列乙 |", "| --- | --- |", "| 值1 | 值2 |", ""].join("\n");
    const out = roundTrip(input);
    const perLine = (s: string) =>
      s
        .split("\n")
        .map((line) =>
          line
            .split("|")
            .map((cell) => cell.trim())
            .join("|"),
        )
        .join("\n");
    expect(perLine(out)).toContain("|列甲|列乙|");
    expect(perLine(out)).toContain("|值1|值2|");
    expect(out).toContain("| --- | --- |");
  });

  it("任务列表往返保留完成态标记", () => {
    const input = ["- [x] 已完成", "- [ ] 未完成", ""].join("\n");
    const out = roundTrip(input);
    expect(out).toContain("- [x] 已完成");
    expect(out).toContain("- [ ] 未完成");
  });

  it("图片引用不丢(Image 显式注册的防静默降级验收)", () => {
    const input = ["![窗帘样品](./photo.jpg)", "", "段落。", ""].join("\n");
    const out = roundTrip(input);
    expect(out).toContain("![窗帘样品](./photo.jpg)");
    expect(out).toContain("段落。");
  });

  it("图片显示解析:NodeView 按注入 resolver 换源,文档/序列化保留原始引用(06)", () => {
    const host = document.createElement("div");
    const engine = createEngine(
      host,
      {},
      { resolveImageUrl: (raw) => `ASSET://${encodeURIComponent(raw)}` },
    );
    engine.loadMarkdown("![样品](./pic/a.png)\n");
    const img = host.querySelector("img") as HTMLImageElement | null;
    // getAttribute 取原始值(jsdom 会把 img.src 协议头小写化)
    expect(img?.getAttribute("src")).toBe("ASSET://.%2Fpic%2Fa.png");
    // 序列化仍是原文引用(不改源语法)
    expect(engine.getMarkdown()).toContain("![样品](./pic/a.png)");
    engine.destroy();
  });

  it("removeImageNodeAtElement:按 NodeView DOM 删除图片节点,序列化无残留(06)", () => {
    const host = document.createElement("div");
    const engine = createEngine(host);
    engine.loadMarkdown("![甲](a.png)\n\n尾段\n");
    const wrapper = host.querySelector(".confidant-image-node") as HTMLElement;
    expect(wrapper).not.toBeNull();
    const removed = engine.removeImageNodeAtElement(wrapper.querySelector("img")!);
    expect(removed).toBe(true);
    const out = engine.getMarkdown();
    expect(out).not.toContain("a.png");
    expect(out).toContain("尾段");
    // 非图片元素 → false
    expect(engine.removeImageNodeAtElement(host)).toBe(false);
    engine.destroy();
  });

  it("insertImage:光标处插入图片节点,序列化出相对引用(05 落盘后写引用路径)", () => {
    const host = document.createElement("div");
    const engine = createEngine(host);
    engine.loadMarkdown("开头段落\n");
    engine.focus();
    const ok = engine.insertImage("周报-123.png", "截图");
    expect(ok).toBe(true);
    const out = engine.getMarkdown();
    expect(out).toContain("![截图](周报-123.png)");
    // 往返不丢
    engine.loadMarkdown(out);
    expect(engine.getMarkdown()).toContain("![截图](周报-123.png)");
    engine.destroy();
  });

  it("序列化幂等(规范化收敛后二次往返不变)", () => {
    const input = ["# 标题", "", "", "段落。", "", "- a", "- b", "", ""].join("\n");
    const once = roundTrip(input);
    const twice = roundTrip(once);
    expect(twice).toBe(once);
  });

  it("front matter 拆分后的正文往返不受 head 影响", () => {
    const body = "# 周报\n\n本周小结。\n";
    const out = roundTrip(body);
    expect(out).toBe(body);
  });

  it("硬换行(行尾两空格)往返保留", () => {
    const input = "行甲  \n行乙\n";
    const out = roundTrip(input);
    expect(out).toBe("行甲  \n行乙\n");
  });

  it("所见即所得渲染:标题/列表/引用渲染为结构节点而非源码文本", () => {
    const host = document.createElement("div");
    const engine = createEngine(host);
    engine.loadMarkdown("# 标题甲\n\n- 甲\n- 乙\n\n> 引用\n");
    const editable = host.querySelector("[contenteditable='true']");
    const html = editable?.innerHTML ?? "";
    expect(html).toMatch(/<h1>/);
    expect(html).toContain("<ul>");
    expect(html).toContain("<blockquote>");
    // 不是把 markdown 原文当文本渲染
    expect(html).not.toContain("# 标题甲</p>");
    engine.destroy();
  });
});

describe("引擎实例生命周期", () => {
  it("create/load/get/destroy 全流程不抛错,host 清空", () => {
    const host = document.createElement("div");
    const engine = createEngine(host);
    engine.loadMarkdown("# 甲\n");
    expect(engine.getMarkdown()).toBe("# 甲\n");
    engine.loadMarkdown("## 乙\n");
    expect(engine.getMarkdown()).toBe("## 乙\n");
    engine.destroy();
    expect(host.innerHTML).toBe("");
    expect(engine.getMarkdown()).toBe("");
  });

  it("装载(重建)不触发 update 回调——外部重载不得引发保存回环", () => {
    const host = document.createElement("div");
    let calls = 0;
    const engine = createEngine(host, { onUpdate: () => calls++ });
    engine.loadMarkdown("第一次\n");
    engine.loadMarkdown("第二次\n");
    expect(calls).toBe(0);
    engine.destroy();
  });

  it("编辑区根元素以 contenteditable 存在,可聚焦", () => {
    const host = document.createElement("div");
    const engine = createEngine(host);
    const editable = host.querySelector("[contenteditable='true']");
    expect(editable).not.toBeNull();
    engine.destroy();
    expect(host.querySelector("[contenteditable='true']")).toBeNull();
  });
});
