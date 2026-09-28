import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createAutosaveController } from './autosave'

describe('createAutosaveController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not save if the document was never marked dirty', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    controller.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)

    expect(save).not.toHaveBeenCalled()
  })

  it('saves 500ms after the last scheduleSave call (debounce)', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'v1' })

    controller.markDirty()
    controller.scheduleSave()

    await vi.advanceTimersByTimeAsync(499)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('v1')
  })

  it('resets the debounce timer on every keystroke, only saving once after typing stops', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'final' })

    controller.markDirty()
    controller.scheduleSave()
    await vi.advanceTimersByTimeAsync(300)
    controller.scheduleSave() // simulates another keystroke before the timer fired
    await vi.advanceTimersByTimeAsync(300)
    controller.scheduleSave()
    await vi.advanceTimersByTimeAsync(499)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('final')
  })

  it('flush() saves immediately without waiting for the debounce timer (blur/tab-switch/close)', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'blurred content' })

    controller.markDirty()
    controller.scheduleSave()
    await controller.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('blurred content')
  })

  it('flush() is a no-op when the document is not dirty', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    await controller.flush()

    expect(save).not.toHaveBeenCalled()
  })

  it('flush() cancels the pending debounce timer so no duplicate save fires later', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    controller.markDirty()
    controller.scheduleSave()
    await controller.flush()
    expect(save).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('marks the document clean after a successful save, so flush() again is a no-op', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    controller.markDirty()
    await controller.flush()
    expect(controller.isDirty()).toBe(false)

    await controller.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('coalesces overlapping save requests instead of firing concurrent writes', async () => {
    let resolveFirstSave: (() => void) | undefined
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstSave = resolve
        })
    )
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    controller.markDirty()
    const firstFlush = controller.flush()
    // A second edit arrives while the first save is still in flight.
    controller.markDirty()
    const secondFlush = controller.flush()

    expect(save).toHaveBeenCalledTimes(1) // second flush must not start a concurrent write

    resolveFirstSave?.()
    await firstFlush
    await secondFlush

    expect(save).toHaveBeenCalledTimes(2) // the coalesced follow-up run happens after the first finishes
  })

  it('keeps the document dirty and reports the error if save() rejects', async () => {
    const err = new Error('disk full')
    const save = vi.fn().mockRejectedValue(err)
    const onError = vi.fn()
    const controller = createAutosaveController({ save, getContent: () => 'content', onError })

    controller.markDirty()
    await controller.flush()

    expect(onError).toHaveBeenCalledWith(err)
    expect(controller.isDirty()).toBe(true)
  })

  it('dispose() cancels the pending timer without saving', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    controller.markDirty()
    controller.scheduleSave()
    controller.dispose()

    await vi.advanceTimersByTimeAsync(1000)
    expect(save).not.toHaveBeenCalled()
  })

  it('clearDirty() clears the dirty flag and cancels the pending debounce timer without saving (ticket #20 "use external version")', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'content' })

    controller.markDirty()
    controller.scheduleSave()
    controller.clearDirty()

    expect(controller.isDirty()).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).not.toHaveBeenCalled()
  })

  it('supports a custom delayMs (for tests/tuning), still debouncing correctly', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const controller = createAutosaveController({ save, getContent: () => 'x', delayMs: 100 })

    controller.markDirty()
    controller.scheduleSave()
    await vi.advanceTimersByTimeAsync(99)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
