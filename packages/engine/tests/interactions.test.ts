// 结构化交互测试(09):任务勾选/缩进、表格行列与对齐、撤销链路与往返。

import { describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";

function makeEngine(md: string): { engine: Engine; host: HTMLDivElement } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const engine = createEngine(host);
  engine.loadMarkdown(md);
  engine.focus();
  return { engine, host };
}

function findPos(engine: Engine, substr: string, from = 1): number {
  const size = engine.docSize();
  for (let i = Math.max(1, from); i + substr.length <= size + 1; i++) {
    if (engine.textBetween(i, i + substr.length) === substr) return i;
  }
  return -1;
}

/** 派发真实路径的键盘事件(Tab 语义由 handleKeyDown 承载)。 */
function pressTab(host: HTMLDivElement, shift = false): void {
  const editable = host.querySelector("[contenteditable='true']") as HTMLElement;
  editable.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }),
  );
}

/** 去表格衬垫的语义化行文本(比较用)。 */
function stripPad(md: string): string {
  return md
    .split("\n")
    .map((l) =>
      l
        .split("|")
        .map((c) => c.trim())
        .join("|"),
    )
    .join("\n");
}

describe("任务列表交互", () => {
  it("点击复选框切换完成态;写盘 - [x]/[ ];可撤销", () => {
    const { engine, host } = makeEngine("- [ ] 待办甲\n- [x] 待办乙\n");
    const inputs = host.querySelectorAll("li[data-checked] input[type='checkbox']");
    expect(inputs.length).toBe(2);
    (inputs[0] as HTMLInputElement).click();
    expect(engine.getMarkdown()).toContain("- [x] 待办甲");
    expect(engine.canUndo()).toBe(true);
    const after = host.querySelectorAll("li[data-checked] input[type='checkbox']");
    (after[1] as HTMLInputElement).click();
    expect(engine.getMarkdown()).toContain("- [ ] 待办乙");
    engine.undo();
    expect(engine.getMarkdown()).toContain("- [x] 待办乙");
    engine.destroy();
  });

  it("任务项引擎命令缩进/反缩进;嵌套往返;缩进可单步撤销", () => {
    const { engine } = makeEngine("- [ ] 任务一\n- [ ] 任务二\n");
    const at = findPos(engine, "任务二");
    engine.setSelection(at, at + 1);
    expect(engine.listIndent(1)).toBe(true);
    const nested = engine.getMarkdown();
    expect(nested).toContain("  - [ ] 任务二");
    // 撤销一步回到平铺
    expect(engine.canUndo()).toBe(true);
    engine.undo();
    expect(engine.getMarkdown()).toContain("- [ ] 任务一\n- [ ] 任务二");
    // 再缩进并反缩进
    engine.redo();
    expect(engine.getMarkdown()).toContain("  - [ ] 任务二");
    const at2 = findPos(engine, "任务二");
    engine.setSelection(at2, at2 + 1);
    expect(engine.listIndent(-1)).toBe(true);
    const flat = engine.getMarkdown();
    expect(flat).toContain("- [ ] 任务二");
    expect(flat).not.toContain("  - [ ] 任务二");
    engine.destroy();
  });

  it("任务项 Tab/Shift+Tab 键盘路径与右键命令同效", () => {
    const { engine, host } = makeEngine("- [ ] 键盘一\n- [ ] 键盘二\n");
    const at = findPos(engine, "键盘二");
    engine.setSelection(at, at + 1);
    pressTab(host);
    expect(engine.getMarkdown()).toContain("  - [ ] 键盘二");
    pressTab(host, true);
    expect(engine.getMarkdown()).toContain("- [ ] 键盘二");
    engine.destroy();
  });
});

describe("表格交互", () => {
  const TABLE = "| a | b |\n| --- | --- |\n| c | d |\n";

  it("光标在格内:增行/增列后结构合法", () => {
    const { engine } = makeEngine(TABLE);
    const at = findPos(engine, "a");
    engine.setSelection(at, at + 1);
    expect(engine.tableOp("rowAfter")).toBe(true);
    const out1 = engine.getMarkdown();
    expect(out1.split("\n").filter((l) => l.trim().startsWith("|")).length).toBe(4);
    expect(engine.tableOp("colAfter")).toBe(true);
    const out2 = engine.getMarkdown();
    const header = out2.split("\n").find((l) => l.includes("a"))!;
    expect(header.split("|").length).toBe(5); // 3 列
    engine.destroy();
  });

  it("删行可撤销;删列生效(删光标所在列)", () => {
    const { engine } = makeEngine(TABLE);
    const atC = findPos(engine, "c");
    engine.setSelection(atC, atC + 1);
    engine.tableOp("rowDelete");
    expect(stripPad(engine.getMarkdown())).not.toContain("|c|d|");
    engine.undo();
    expect(stripPad(engine.getMarkdown())).toContain("|c|d|");
    const atA = findPos(engine, "a");
    engine.setSelection(atA, atA + 1);
    engine.tableOp("colDelete");
    const after = stripPad(engine.getMarkdown());
    expect(after).not.toContain("|a|");
    expect(after).toContain("|b|");
    engine.destroy();
  });

  it("单元格对齐 → 分隔线冒号;往返保留", () => {
    const { engine } = makeEngine(TABLE);
    const atA = findPos(engine, "a");
    engine.setSelection(atA, atA + 1);
    expect(engine.tableOp("alignCenter")).toBe(true);
    const out = engine.getMarkdown();
    expect(out).toContain(":---:");
    engine.loadMarkdown(out);
    expect(engine.getMarkdown()).toContain(":---:");
    engine.destroy();
  });
});

describe("表格 Enter 加行(09)", () => {
  const T2 = "| a | b |\n| --- | --- |\n| c | d |\n";
  it("末行回车:新行出现且输入落在新行同列格", () => {
    const { engine, host } = makeEngine(T2);
    // 光标移到末行末格 'd' 内结尾
    const at = findPos(engine, "d");
    engine.setSelection(at + 1, at + 1);
    const editable = host.querySelector("[contenteditable='true']") as HTMLElement;
    editable.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    const out1 = engine.getMarkdown();
    const rows1 = out1.split("\n").filter((l) => l.trim().startsWith("|")).length;
    expect(rows1).toBe(4); // 表头+分隔线+原数据+新增
    // 新行同列格应可输入(光标已移入)
    expect(engine.insertPlainText("Z")).toBe(true);
    const out2 = engine.getMarkdown();
    const lines = out2.split("\n").filter((l) => l.includes("Z"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("| Z");
    engine.destroy();
  });

  it("非末行回车不进新行(表头行回车仍留在表内,行数不变)", () => {
    const { engine, host } = makeEngine(T2);
    const at = findPos(engine, "a"); // 表头行(非末行)
    engine.setSelection(at + 1, at + 1);
    const editable = host.querySelector("[contenteditable='true']") as HTMLElement;
    editable.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    const rows = engine
      .getMarkdown()
      .split("\n")
      .filter((l) => l.trim().startsWith("|")).length;
    expect(rows).toBe(3);
    engine.destroy();
  });
});
