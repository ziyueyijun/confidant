// 启动探测渲染层纯逻辑单测(决议 8)。
// 「未打开工作区 → 不探测(零请求)」与「同步完成后圆点消失」在这里可断言。

import { describe, expect, it } from "vitest";
import type { SyncOutcome } from "@shared/sync";
import { dotClearedByOutcome, probePathFor } from "./probe-gating";

describe("probePathFor(未打开工作区 → 不探测)", () => {
  it("null / undefined / 空 / 空白 → null(不发起探测)", () => {
    expect(probePathFor(null)).toBeNull();
    expect(probePathFor(undefined)).toBeNull();
    expect(probePathFor("")).toBeNull();
    expect(probePathFor("   ")).toBeNull();
  });

  it("有效工作区路径原样返回", () => {
    expect(probePathFor("C:\\Notes")).toBe("C:\\Notes");
    expect(probePathFor("  /home/u/notes  ")).toBe("/home/u/notes");
  });
});

describe("dotClearedByOutcome(同步完成后圆点消失)", () => {
  it("ok → 清除", () => {
    expect(dotClearedByOutcome({ status: "ok" })).toBe(true);
  });

  it("cancelled → 保留(同步未真正完成)", () => {
    expect(dotClearedByOutcome({ status: "cancelled" })).toBe(false);
  });

  it("error → 保留(同步未真正完成)", () => {
    const o: SyncOutcome = { status: "error", message: "离线" };
    expect(dotClearedByOutcome(o)).toBe(false);
  });

  it("未跑过(null)→ 不清除", () => {
    expect(dotClearedByOutcome(null)).toBe(false);
  });
});
