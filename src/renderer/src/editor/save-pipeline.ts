// 保存管线(规格 §9.3):编辑停顿防抖自动写盘 + Ctrl+S 立即写盘 +
// IME 组合期不触发 + 写失败保留脏态。写盘本身(原子写)由调用方注入的 io 提供。

export interface SaveState {
  /** 有尚未落盘的编辑。 */
  dirty: boolean;
  /** 有写盘正在进行。 */
  saving: boolean;
  /** 最近一次成功写盘时间(ms epoch;从未成功为 null)。 */
  savedAt: number | null;
  /** 最近一次写盘失败信息(成功或尚无失败为 null)。 */
  error: { code: string; message: string } | null;
}

export interface SavePipelineOptions {
  /** 编辑停顿后触发自动写盘的防抖窗口。默认 1000ms(规格「约 1 秒」)。 */
  debounceMs?: number;
  /** 组合结束后的补写延迟(短)。 */
  composeSettleMs?: number;
  onState?: (state: SaveState) => void;
}

export interface SavePipeline {
  /** 编辑发生(引擎 update;装载/重建不算)。 */
  notifyEdit(): void;
  /** IME 组合状态(组合期间不触发自动写盘;结束补写)。 */
  setComposing(composing: boolean): void;
  /** 手动保存(Ctrl+S/按钮):取消待写计时并立即写盘;无脏不写。 */
  flush(): Promise<void>;
  /** 换文件/清空会话:清脏、取消计时。 */
  resetClean(): void;
  dispose(): void;
}

export function createSavePipeline(
  io: { write(): Promise<void> },
  options: SavePipelineOptions = {},
): SavePipeline {
  const debounceMs = options.debounceMs ?? 1000;
  const composeSettleMs = options.composeSettleMs ?? 60;
  const onState = options.onState;

  let dirty = false;
  let saving = false;
  let composing = false;
  let savedAt: number | null = null;
  let error: { code: string; message: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  /** 组合期间产生了「应写而未写」的编辑(组合结束后补一次)。 */
  let pendingDuringCompose = false;
  /** 写盘在途时又收到编辑(该次防抖计时被 saving 闸门吞掉,写完后补写一次)。 */
  let editsDuringWrite = false;

  function emit(): void {
    onState?.({ dirty, saving, savedAt, error });
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(delay: number): void {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void runFlush();
    }, delay);
  }

  async function runFlush(): Promise<void> {
    if (disposed) return;
    if (saving) return; // 已有写盘在途;结束后若仍脏,由下轮编辑或手动补
    if (composing) {
      // 组合进行中不写盘(规格 §9.1);结束时的补写路径(setComposing(false))兜底
      pendingDuringCompose = true;
      return;
    }
    if (!dirty) return;
    saving = true;
    error = null;
    emit();
    try {
      await io.write();
      savedAt = Date.now();
      if (editsDuringWrite) {
        // 写盘在途时产生了新编辑:本次写盘可能未含其内容,保持脏并补写一次
        editsDuringWrite = false;
        schedule(debounceMs);
      } else {
        dirty = false;
      }
    } catch (err) {
      const e = err as { code?: string; message?: string };
      error = { code: e?.code ?? "UNKNOWN", message: e?.message ?? String(err) };
      // dirty 保持 true:失败不静默,下次编辑/手动保存重试
    } finally {
      saving = false;
      emit();
    }
  }

  return {
    notifyEdit() {
      if (disposed) return;
      dirty = true;
      if (error) error = null;
      emit();
      if (saving) {
        // 写盘在途:本次防抖计时会被 runFlush 的 saving 闸门吞掉,记下写完后补写
        editsDuringWrite = true;
        return;
      }
      schedule(debounceMs);
    },

    setComposing(next: boolean) {
      if (disposed) return;
      if (next === composing) return;
      composing = next;
      if (next) {
        // 组合开始:取消待写计时,交由结束路径决定补写
        if (timer !== null) {
          clearTimer();
          pendingDuringCompose = true;
        }
      } else {
        // 组合结束:组合期内积累的编辑补写一次(短延迟,让 PM 提交收尾)
        if (pendingDuringCompose) {
          pendingDuringCompose = false;
          if (dirty) schedule(composeSettleMs);
        }
      }
    },

    async flush() {
      if (disposed) return;
      clearTimer();
      await runFlush();
    },

    resetClean() {
      clearTimer();
      dirty = false;
      saving = false;
      pendingDuringCompose = false;
      editsDuringWrite = false;
      savedAt = null;
      error = null;
      emit();
    },

    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
