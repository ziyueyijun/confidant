// 同步结果文案单测(纯逻辑)。

import { describe, expect, it } from "vitest";
import type { SyncReport } from "../../../../packages/sync";
import type { SyncOutcome } from "@shared/sync";
import { formatSyncOutcome } from "./sync-summary";

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

  it("ok 计数:上传/下载/冲突/跳过/失败分别列出", () => {
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
    expect(formatSyncOutcome(o)).toBe("已同步 · 上传 3 / 下载 2 / 冲突 1 / 跳过 1 / 失败 1");
  });

  it("跳过的绝不并入成功(计数单列)", () => {
    const o: SyncOutcome = { status: "ok", report: report({ skipped: [{ relPath: "a", reason: "符号链接" }] }) };
    const text = formatSyncOutcome(o)!;
    expect(text).toContain("跳过 1");
    expect(text).toContain("上传 0 / 下载 0");
  });

  it("取消:已完成部分保留并显示", () => {
    const o: SyncOutcome = { status: "cancelled", report: report({ uploaded: 5, downloaded: 1 }) };
    expect(formatSyncOutcome(o)).toBe("已取消 · 上传 5 / 下载 1");
  });

  it("失败:显示错误摘要", () => {
    expect(formatSyncOutcome({ status: "error", message: "用户名或密码错误。" })).toBe(
      "同步失败:用户名或密码错误。",
    );
  });
});
