/**
 * Ticket #15 acceptance criterion #3: autosave 500ms after typing stops,
 * plus on blur/tab-switch/tab-close. This ticket only wires up a single
 * document, but the controller itself is deliberately document-agnostic
 * (it just takes a `save` callback) so ticket #17 (tabs) can create one
 * `AutosaveController` per open tab and call `flush()` from its
 * tab-switch/tab-close handlers without any changes here.
 *
 * Design notes:
 * - `scheduleSave()` is the debounced path: call it on every edit. Each
 *   call resets a 500ms timer; only the last call in a burst actually
 *   triggers a save.
 * - `flush()` is the immediate path: call it whenever the document is
 *   about to leave view (blur, tab switch, tab close, window close) so
 *   unsaved edits within the last 500ms aren't lost.
 * - Both paths funnel through the same `runSave` so there is exactly one
 *   in-flight-save invariant: if a save is already running when another
 *   is requested, the new request waits for the current one to finish
 *   and then runs once more (coalesced), rather than firing overlapping
 *   writes at the same file.
 */

export interface AutosaveController {
  /** Debounced save: (re)starts a 500ms timer. Call on every edit. */
  scheduleSave(): void
  /**
   * Cancels any pending debounce timer and saves immediately if the
   * document is dirty. Returns a promise that resolves once the save
   * (if any) completes. Safe to call multiple times.
   */
  flush(): Promise<void>
  /** Marks the document as having unsaved changes (called by the editor's change listener). */
  markDirty(): void
  /** True if there are edits not yet persisted to disk. */
  isDirty(): boolean
  /**
   * Clears the dirty flag and cancels any pending debounce timer without
   * saving (ticket #20: after discarding local edits in favor of an
   * externally-changed version, there is nothing left to autosave - the
   * in-memory content now matches disk exactly).
   */
  clearDirty(): void
  /** Cancels pending timers without saving. Call on teardown. */
  dispose(): void
}

export interface AutosaveOptions {
  /** Persists the given content. Rejections are swallowed after being reported via `onError`. */
  save: (content: string) => Promise<void>
  /** Returns the current document content to persist. */
  getContent: () => string
  /** Debounce delay in ms. Defaults to 500 per spec. */
  delayMs?: number
  /** Called if a save rejects, so the caller can surface it (e.g. a toast in a later ticket). */
  onError?: (err: unknown) => void
}

export function createAutosaveController(options: AutosaveOptions): AutosaveController {
  const { save, getContent, onError } = options
  const delayMs = options.delayMs ?? 500

  let timer: ReturnType<typeof setTimeout> | null = null
  let dirty = false
  let saveInFlight: Promise<void> | null = null
  let rerunRequested = false
  let disposed = false

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function runSave(): Promise<void> {
    if (saveInFlight) {
      // A save is already running; ask it to run once more after it
      // finishes instead of starting a second overlapping write.
      rerunRequested = true
      return saveInFlight
    }

    if (!dirty) return

    dirty = false
    const content = getContent()
    saveInFlight = save(content)
      .catch((err) => {
        // Saving failed: put the dirty flag back so a later save/flush
        // retries, and report the error.
        dirty = true
        onError?.(err)
      })
      .finally(() => {
        saveInFlight = null
        if (rerunRequested) {
          rerunRequested = false
          // Fire-and-forget: callers awaiting the original flush()/
          // runSave() already got their promise; this follow-up run
          // picks up any edits that arrived while the first save was
          // in flight.
          void runSave()
        }
      })

    return saveInFlight
  }

  return {
    markDirty() {
      dirty = true
    },

    isDirty() {
      return dirty
    },

    clearDirty() {
      clearTimer()
      dirty = false
    },

    scheduleSave() {
      if (disposed) return
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        void runSave()
      }, delayMs)
    },

    async flush() {
      clearTimer()
      await runSave()
    },

    dispose() {
      disposed = true
      clearTimer()
    }
  }
}
