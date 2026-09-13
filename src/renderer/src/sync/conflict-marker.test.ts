// 冲突副本树标记的纯逻辑单测(决议 55)。标记由文件名派生,故这一层是纯函数。

import { describe, expect, it } from "vitest";
import {
  CONFLICT_COPY_BADGE,
  CONFLICT_COPY_TITLE,
  isConflictCopyName,
} from "./conflict-marker";

describe("isConflictCopyName(树标记依据)", () => {
  it("识别本引擎生成的冲突副本名(.md 与非 .md,含防撞后缀)", () => {
    expect(isConflictCopyName("笔记 (冲突 来自远端 2026-09-14 15-30-12).md")).toBe(true);
    expect(isConflictCopyName("图片 (冲突 来自远端 2026-09-14 15-30-12).png")).toBe(true);
    expect(isConflictCopyName("README (冲突 来自远端 2026-09-14 15-30-12)")).toBe(true);
    expect(isConflictCopyName("a (冲突 来自远端 2026-09-14 15-30-12) (2).md")).toBe(true);
  });

  it("普通文件与用户自起的相似名不误报", () => {
    expect(isConflictCopyName("a.md")).toBe(false);
    expect(isConflictCopyName("a (2).md")).toBe(false);
    expect(isConflictCopyName("关于「冲突 来自远端」的笔记.md")).toBe(false); // 缺时间戳
    expect(isConflictCopyName("a (冲突 来自远端 不是时间).md")).toBe(false);
  });

  it("徽标文案只陈述「这个文件是副本」,不暗示原笔记有冲突", () => {
    expect(CONFLICT_COPY_BADGE).toBe("冲突副本");
    expect(CONFLICT_COPY_TITLE).toContain("原笔记未处于冲突状态");
  });
});
