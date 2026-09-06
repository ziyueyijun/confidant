// Tests exercise the package through its entry point only — same seam as
// callers. Deep imports (e.g. "../lib/impl") are lint errors.

import { describe, expect, it } from "vitest";
import { greet } from "../index";

describe("example 包冒烟(新包布局照抄起点)", () => {
  it("经入口点调用", () => {
    expect(greet("world")).toBe("Hello, world!");
  });
});
