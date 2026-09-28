import { decideExternalChangeAction, type CoalescedEvent } from '@shared/externalWatch'
import { showConflictDialog } from './conflictDialog'

/**
 * Ticket #20: routes `watch:externalChange` IPC pushes (main.ts's
 * chokidar watcher, see `src/main/externalWatch.ts`) to the open
 * document they affect, and drives the reload/mark-deleted/conflict-
 * dialog flows (acceptance criteria #4/#5/#6).
 *
 * Deliberately takes narrow callback hooks rather than the whole
 * `documents` Map / `TabState` from main.ts, so this module stays
 * testable and doesn't need to know about CodeMirror, tab bar DOM, or
 * IPC wiring directly - `main.ts` supplies the glue.
 */
export interface ExternalChangeHooks {
  /** True if `path` currently has an open tab/document. */
  isOpen: (path: string) => boolean
  /** True if the open document at `path` has unsaved edits (`AutosaveController.isDirty()`). */
  isDirty: (path: string) => boolean
  /** Re-reads `path` from disk and applies it to the editor, preserving cursor/scroll (acceptance criterion #4). */
  silentReload: (path: string) => Promise<void>
  /** Marks `path`'s tab as deleted (red + "已删除" + status bar Save As, acceptance criterion #5). */
  markDeleted: (path: string) => void
  /** Overwrites the on-disk file at `path` with the document's current in-memory content ("keep my version"). */
  keepMine: (path: string) => Promise<void>
  /** Discards local edits and reloads `path` from disk ("use external version"). */
  useExternal: (path: string) => Promise<void>
  /** Opens a Save As dialog and, if the user picks a path, writes the current in-memory content there. */
  saveAs: (path: string) => Promise<void>
  /** Basename/path string to show in the conflict dialog message. */
  labelFor: (path: string) => string
}

/**
 * Creates the `watch:externalChange` listener body. Exported as a plain
 * function (not wired to `window.api` internally) so it can be unit
 * tested with fake hooks instead of a real IPC bridge/DOM.
 */
export function handleExternalChangeEvent(
  event: CoalescedEvent,
  hooks: ExternalChangeHooks
): Promise<void> | void {
  if (!hooks.isOpen(event.path)) return // not an open document - nothing to do

  const action = decideExternalChangeAction(hooks.isDirty(event.path), event.type)

  switch (action.kind) {
    case 'silent-reload':
      return hooks.silentReload(event.path)
    case 'mark-deleted':
      hooks.markDeleted(event.path)
      return
    case 'conflict-dialog':
      return runConflictDialog(event.path, hooks)
    case 'ignore':
      return
  }
}

async function runConflictDialog(path: string, hooks: ExternalChangeHooks): Promise<void> {
  const choice = await showConflictDialog({ fileLabel: hooks.labelFor(path) })
  if (choice === 'keep-mine') {
    await hooks.keepMine(path)
  } else if (choice === 'use-external') {
    await hooks.useExternal(path)
  } else {
    await hooks.saveAs(path)
  }
}
