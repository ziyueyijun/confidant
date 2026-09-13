// 同步中断语义单测(票 06;决议 64)——纯逻辑,注入桩。

import { describe, expect, it, vi } from "vitest";
import type { DeleteGuardPrompt } from "../../packages/sync";
import {
  buildDeleteGuardMessage,
  buildSyncInterruptMessage,
  cancelSyncForWorkspaceSwitch,
  handleCloseInterrupt,
} from "./sync-interrupt";

describe("buildSyncInterruptMessage(决议 64 原话)", () => {
  it("说出已完成 / 总数与「进度会保存」", () => {
    const { message, detail } = buildSyncInterruptMessage(123, 540);
    expect(message).toBe("同步尚未完成(已完成 123 / 540),关闭将中断。");
    expect(detail).toBe("已完成的进度会保存。");
  });
});

describe("handleCloseInterrupt", () => {
  it("无同步在跑 → 不弹窗、不取消、直接允许关窗", async () => {
    const confirm = vi.fn(async () => true);
    const cancel = vi.fn();
    const proceed = await handleCloseInterrupt({
      isSyncRunning: () => false,
      progress: () => ({ done: 0, total: 0 }),
      confirm,
      cancel,
    });
    expect(proceed).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("同步中 + 确认 → 取消同步(已完成进度落盘)并允许关窗", async () => {
    const confirm = vi.fn<(message: string, detail: string) => Promise<boolean>>(async () => true);
    const cancel = vi.fn();
    const proceed = await handleCloseInterrupt({
      isSyncRunning: () => true,
      progress: () => ({ done: 123, total: 540 }),
      confirm,
      cancel,
    });
    expect(proceed).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain("已完成 123 / 540");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("同步中 + 否认 → 不取消、不关窗(返回 false)", async () => {
    const confirm = vi.fn(async () => false);
    const cancel = vi.fn();
    const proceed = await handleCloseInterrupt({
      isSyncRunning: () => true,
      progress: () => ({ done: 1, total: 2 }),
      confirm,
      cancel,
    });
    expect(proceed).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("cancelSyncForWorkspaceSwitch(决议 64)", () => {
  it("同步中 → 取消一次", () => {
    const cancel = vi.fn();
    expect(cancelSyncForWorkspaceSwitch({ isSyncRunning: () => true, cancel })).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("无同步 → 不调用", () => {
    const cancel = vi.fn();
    expect(cancelSyncForWorkspaceSwitch({ isSyncRunning: () => false, cancel })).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("buildDeleteGuardMessage(决议 27)", () => {
  const prompt: DeleteGuardPrompt = {
    count: 25,
    localDeletes: 25,
    remoteDeletes: 0,
    localTotal: 100,
    remoteTotal: 90,
    maxFiles: 20,
    ratioLimit: 0.2,
    triggeredByMax: true,
    triggeredByRatio: true,
    relPaths: ["a.md", "b.md"],
  };

  it("说出数量、分侧计数、触发原因与路径,默认按钮为「取消」", () => {
    const { message, detail, buttons } = buildDeleteGuardMessage(prompt);
    expect(message).toContain("删除 25 个文件");
    expect(message).toContain("本地 25 个 / 远端 0 个");
    expect(detail).toContain("超过 20 个");
    expect(detail).toContain("20%");
    expect(detail).toContain("a.md");
    expect(detail).toContain("远端删除不可恢复");
    expect(buttons[0]).toContain("取消");
    expect(buttons[1]).toBe("继续删除");
  });
});
