// 同步日志轮转步骤单测(纯逻辑;决议 43)。

import { describe, expect, it } from "vitest";
import { rotationSteps } from "./log-rotate";

describe("rotationSteps", () => {
  it("keep=3:先把旧备份往后挪,最后把当前文件挪成 .1", () => {
    expect(rotationSteps("/logs/sync.log", 3)).toEqual([
      { from: "/logs/sync.log.2", to: "/logs/sync.log.3" },
      { from: "/logs/sync.log.1", to: "/logs/sync.log.2" },
      { from: "/logs/sync.log", to: "/logs/sync.log.1" },
    ]);
  });

  it("从最大序号往小做(否则当前文件会覆盖还没挪走的 .1)", () => {
    const steps = rotationSteps("x", 5);
    const current = steps.findIndex((s) => s.from === "x");
    expect(current).toBe(steps.length - 1);
    // 目标序号单调上升,源序号单调下降
    const nums = steps.slice(0, -1).map((s) => Number(s.from.split(".").pop()));
    expect(nums).toEqual([4, 3, 2, 1]);
  });

  it("keep=1:只把当前文件挪到 .1", () => {
    expect(rotationSteps("f", 1)).toEqual([{ from: "f", to: "f.1" }]);
  });
});
