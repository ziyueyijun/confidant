// 保存管线测试(规格 §9.3 + 02 票):防抖自动写盘、手动 flush、IME 组合门控、
// 失败保留脏态、换文件 reset、写盘在途补写。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSavePipeline, type SaveState } from "./save-pipeline";

function makeHarness(opts?: { debounceMs?: number; write?: () => Promise<void> }) {
  const writes: string[] = [];
  const write = vi.fn(async () => {
    writes.push("w");
  });
  const states: SaveState[] = [];
  const pipeline = createSavePipeline({ write: opts?.write ?? write }, {
    debounceMs: opts?.debounceMs ?? 1000,
    onState: (s) => states.push({ ...s }),
  });
  return { pipeline, write, states, writes };
}

describe("保存管线", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("停顿 1s 后自动写盘一次;连续编辑只写一次(防抖合并)", async () => {
    const { pipeline, write } = makeHarness();
    pipeline.notifyEdit();
    await vi.advanceTimersByTimeAsync(600);
    pipeline.notifyEdit();
    await vi.advanceTimersByTimeAsync(600);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500); // 第二次编辑后满 1.1s
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("手动 flush 立即写盘且不依赖防抖;无脏不写", async () => {
    const { pipeline, write } = makeHarness();
    await pipeline.flush();
    expect(write).not.toHaveBeenCalled();
    pipeline.notifyEdit();
    await pipeline.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("写盘成功后 dirty 清除、savedAt 记录", async () => {
    const { pipeline, states } = makeHarness();
    pipeline.notifyEdit();
    await pipeline.flush();
    const last = states[states.length - 1]!;
    expect(last.dirty).toBe(false);
    expect(last.saving).toBe(false);
    expect(last.savedAt).not.toBeNull();
    expect(last.error).toBeNull();
  });

  it("IME 组合期间不触发自动写盘;组合结束补写", async () => {
    const { pipeline, write } = makeHarness();
    pipeline.setComposing(true);
    pipeline.notifyEdit();
    await vi.advanceTimersByTimeAsync(3000);
    expect(write).not.toHaveBeenCalled();
    pipeline.setComposing(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("组合前已挂起的计时在组合开始时取消,不提前写盘", async () => {
    const { pipeline, write } = makeHarness();
    pipeline.notifyEdit();
    await vi.advanceTimersByTimeAsync(900);
    pipeline.setComposing(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).not.toHaveBeenCalled();
    pipeline.setComposing(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("写盘失败:保留脏态、状态带错误;下次编辑/手动保存重试成功", async () => {
    const { pipeline, states } = makeHarness({
      write: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("disk full"), { code: "ENOSPC" }))
        .mockResolvedValueOnce(undefined),
    });
    pipeline.notifyEdit();
    await pipeline.flush();
    let last = states[states.length - 1]!;
    expect(last.dirty).toBe(true);
    expect(last.error?.code).toBe("ENOSPC");
    pipeline.notifyEdit(); // 用户继续编辑 → 再自动重试
    await vi.advanceTimersByTimeAsync(1100);
    last = states[states.length - 1]!;
    expect(last.dirty).toBe(false);
    expect(last.error).toBeNull();
  });

  it("写盘在途时的新编辑:写完后自动补写一次(不吞编辑)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const write = vi.fn(async () => {
      if (write.mock.calls.length === 1) await gate; // 第一次写盘挂起
    });
    const { pipeline } = makeHarness({ write: write as () => Promise<void> });
    pipeline.notifyEdit();
    const flushing = pipeline.flush();
    await vi.advanceTimersByTimeAsync(0);
    pipeline.notifyEdit(); // 写盘在途时键入
    release();
    await flushing;
    await vi.advanceTimersByTimeAsync(1100); // 补写计时
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("resetClean(换文件):清脏且不写盘", async () => {
    const { pipeline, write } = makeHarness();
    pipeline.notifyEdit();
    pipeline.resetClean();
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).not.toHaveBeenCalled();
  });

  it("dispose 后不再调度", async () => {
    const { pipeline, write } = makeHarness();
    pipeline.dispose();
    pipeline.notifyEdit();
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).not.toHaveBeenCalled();
  });
});
