import { describe, expect, it, vi } from 'vitest'
import { handleExternalChangeEvent, type ExternalChangeHooks } from './externalChangeHandler'
import * as conflictDialogModule from './conflictDialog'

/**
 * Ticket #20: exercises `handleExternalChangeEvent`'s routing logic
 * (silent reload / mark deleted / conflict dialog) against fake hooks -
 * no real IPC, DOM, or CodeMirror involved, so this is a pure behavioral
 * test of the decision + dispatch wiring on top of the already-tested
 * `decideExternalChangeAction` pure function (see
 * `src/shared/externalWatch.test.ts`).
 */

function makeHooks(overrides: Partial<ExternalChangeHooks> = {}): ExternalChangeHooks {
  return {
    isOpen: vi.fn().mockReturnValue(true),
    isDirty: vi.fn().mockReturnValue(false),
    silentReload: vi.fn().mockResolvedValue(undefined),
    markDeleted: vi.fn(),
    keepMine: vi.fn().mockResolvedValue(undefined),
    useExternal: vi.fn().mockResolvedValue(undefined),
    saveAs: vi.fn().mockResolvedValue(undefined),
    labelFor: vi.fn().mockReturnValue('notes.md'),
    ...overrides
  }
}

describe('handleExternalChangeEvent', () => {
  it('does nothing for a path that has no open document', async () => {
    const hooks = makeHooks({ isOpen: vi.fn().mockReturnValue(false) })
    await handleExternalChangeEvent({ type: 'updated', path: '/lib/notes.md' }, hooks)
    expect(hooks.silentReload).not.toHaveBeenCalled()
    expect(hooks.markDeleted).not.toHaveBeenCalled()
  })

  it('silently reloads an open, non-dirty document on an external update', async () => {
    const hooks = makeHooks({ isDirty: vi.fn().mockReturnValue(false) })
    await handleExternalChangeEvent({ type: 'updated', path: '/lib/notes.md' }, hooks)
    expect(hooks.silentReload).toHaveBeenCalledWith('/lib/notes.md')
    expect(hooks.markDeleted).not.toHaveBeenCalled()
  })

  it('marks the tab deleted on an external delete, regardless of dirty state', async () => {
    const hooksClean = makeHooks({ isDirty: vi.fn().mockReturnValue(false) })
    await handleExternalChangeEvent({ type: 'deleted', path: '/lib/notes.md' }, hooksClean)
    expect(hooksClean.markDeleted).toHaveBeenCalledWith('/lib/notes.md')

    const hooksDirty = makeHooks({ isDirty: vi.fn().mockReturnValue(true) })
    await handleExternalChangeEvent({ type: 'deleted', path: '/lib/notes.md' }, hooksDirty)
    expect(hooksDirty.markDeleted).toHaveBeenCalledWith('/lib/notes.md')
  })

  it('opens the conflict dialog on an external update when the document is dirty, and applies "keep mine"', async () => {
    const spy = vi.spyOn(conflictDialogModule, 'showConflictDialog').mockResolvedValue('keep-mine')
    const hooks = makeHooks({ isDirty: vi.fn().mockReturnValue(true) })

    await handleExternalChangeEvent({ type: 'updated', path: '/lib/notes.md' }, hooks)

    expect(spy).toHaveBeenCalledWith({ fileLabel: 'notes.md' })
    expect(hooks.keepMine).toHaveBeenCalledWith('/lib/notes.md')
    expect(hooks.useExternal).not.toHaveBeenCalled()
    expect(hooks.saveAs).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('applies "use external" when the conflict dialog resolves with use-external', async () => {
    const spy = vi.spyOn(conflictDialogModule, 'showConflictDialog').mockResolvedValue('use-external')
    const hooks = makeHooks({ isDirty: vi.fn().mockReturnValue(true) })

    await handleExternalChangeEvent({ type: 'updated', path: '/lib/notes.md' }, hooks)

    expect(hooks.useExternal).toHaveBeenCalledWith('/lib/notes.md')
    expect(hooks.keepMine).not.toHaveBeenCalled()
    expect(hooks.saveAs).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('applies "save as" when the conflict dialog resolves with save-as', async () => {
    const spy = vi.spyOn(conflictDialogModule, 'showConflictDialog').mockResolvedValue('save-as')
    const hooks = makeHooks({ isDirty: vi.fn().mockReturnValue(true) })

    await handleExternalChangeEvent({ type: 'updated', path: '/lib/notes.md' }, hooks)

    expect(hooks.saveAs).toHaveBeenCalledWith('/lib/notes.md')
    expect(hooks.keepMine).not.toHaveBeenCalled()
    expect(hooks.useExternal).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
