// 同步结果文案单测(纯逻辑)。决议 54/62:计数精确,跳过的绝不并入成功。

import { describe, expect, it } from "vitest";
import type { SyncReport } from "../../../../packages/sync";
import type { SyncOutcome } from "@shared/sync";
import { formatSyncOutcome, isRetryable, summarizeIssues } from "./sync-summary";

function report(over: Partial<SyncReport> = {}): SyncReport {
  return {
    uploaded: 0,
    downloaded: 0,
    conflicts: 0,
    deletedRemote: 0,
    deletedLocal: 0,
    skipped: [],
    failed: [],
    remainingLocalChanges: 0,
    ...over,
  };
}

describe("formatSyncOutcome", () => {
  it("无结果 → null", () => {
    expect(formatSyncOutcome(null)).toBeNull();
  });

  it("ok 无变化", () => {
    expect(formatSyncOutcome({ status: "ok", report: report() })).toBe("已同步(无变化)");
  });

  it("ok 计数:成功 / 分母,冲突/跳过/失败分列", () => {
    const o: SyncOutcome = {
      status: "ok",
      report: report({
        uploaded: 3,
        downloaded: 2,
        conflicts: 1,
        skipped: [{ relPath: "a", reason: "x" }],
        failed: [{ relPath: "b", reason: "y" }],
      }),
    };
    // 成功 5(3+2);分母 8 = 5 + 冲突 1 + 跳过 1 + 失败 1
    expect(formatSyncOutcome(o)).toBe("已同步 5 / 8，冲突 1，1 个跳过(x)，1 个失败(y)");
  });

  it("票面口径:498 / 500 已同步,2 个跳过(原因)", () => {
    const o: SyncOutcome = {
      status: "ok",
      report: report({
        uploaded: 400,
        downloaded: 98,
        skipped: [
          { relPath: "a:b.md", reason: "文件名含 Windows 非法字符,已跳过" },
          { relPath: "c?d.md", reason: "文件名含 Windows 非法字符,已跳过" },
        ],
      }),
    };
    const text = formatSyncOutcome(o)!;
    expect(text).toContain("已同步 498 / 500");
    expect(text).toContain("2 个跳过(文件名含 Windows 非法字符,已跳过)");
  });

  it("跳过的绝不并入成功:成功数为 0,跳过只进分母", () => {
    const o: SyncOutcome = {
      status: "ok",
      report: report({
        skipped: [
          { relPath: "a", reason: "符号链接(不跟随),已跳过" },
          { relPath: "b", reason: "超过单文件上限(1 字节),已跳过" },
        ],
      }),
    };
    const text = formatSyncOutcome(o)!;
    expect(text).toBe("已同步 0 / 2，2 个跳过(符号链接(不跟随),已跳过、超过单文件上限(1 字节),已跳过)");
    expect(text).not.toContain("已同步 2 /");
  });

  it("取消:已完成部分保留并显示", () => {
    const o: SyncOutcome = { status: "cancelled", report: report({ uploaded: 5, downloaded: 1 }) };
    expect(formatSyncOutcome(o)).toBe("已取消 6 / 6");
  });

  it("失败:显示错误摘要", () => {
    expect(formatSyncOutcome({ status: "error", message: "用户名或密码错误。" })).toBe(
      "同步失败:用户名或密码错误。",
    );
  });

  it("收尾比对有未同步改动:追加「还有 N 个文件的改动未同步」", () => {
    const o: SyncOutcome = {
      status: "ok",
      report: report({ uploaded: 3, downloaded: 2, remainingLocalChanges: 2 }),
    };
    expect(formatSyncOutcome(o)).toBe("已同步 5 / 5，还有 2 个文件的改动未同步");
  });

  it("只有未同步改动时不算「无变化」", () => {
    const o: SyncOutcome = { status: "ok", report: report({ remainingLocalChanges: 1 }) };
    const text = formatSyncOutcome(o)!;
    expect(text).toContain("还有 1 个文件的改动未同步");
    expect(text).not.toBe("已同步(无变化)");
  });
});

describe("isRetryable(决议 60)", () => {
  it("整体失败 → 可重试", () => {
    expect(isRetryable({ status: "error", message: "连不上" })).toBe(true);
  });
  it("部分失败 → 可重试", () => {
    expect(isRetryable({ status: "ok", report: report({ failed: [{ relPath: "a", reason: "x" }] }) })).toBe(true);
  });
  it("全成功 → 不可重试", () => {
    expect(isRetryable({ status: "ok", report: report({ uploaded: 1 }) })).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});

describe("summarizeIssues", () => {
  it("逐条列出跳过与失败的原因", () => {
    const text = summarizeIssues(
      report({
        skipped: [{ relPath: "a", reason: "符号链接" }],
        failed: [{ relPath: "b", reason: "超时" }],
      }),
    );
    expect(text).toBe("跳过 a:符号链接\n失败 b:超时");
  });
});
