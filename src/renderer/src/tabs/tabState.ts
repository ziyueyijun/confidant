/**
 * Ticket #17 scope: pure tab bookkeeping (no DOM, no CodeMirror). Each
 * tab is identified by its absolute file path - opening a path that's
 * already open focuses the existing tab instead of duplicating it
 * (acceptance criterion #3). Closing a tab picks a sensible neighbor to
 * focus next (acceptance criterion #4's tab-switching behavior).
 *
 * This module only tracks *which* paths are open and which is active;
 * it deliberately knows nothing about editor instances or autosaving -
 * `src/renderer/src/main.ts` owns the side effects (creating/destroying
 * `MarkdownEditorHandle`s, calling `flushSave()`) and drives them off
 * the results this module returns.
 */

export interface TabState {
  /** Open tabs, in the order they should be displayed (oldest-opened first). */
  tabs: string[]
  /** The currently focused tab's path, or null if no tabs are open. */
  activePath: string | null
}

export const EMPTY_TAB_STATE: TabState = { tabs: [], activePath: null }

export interface OpenTabResult {
  state: TabState
  /** True if this call opened a brand-new tab (false if it just focused an existing one). */
  didOpen: boolean
}

/**
 * Opens `path` as a new tab, or focuses it if already open (acceptance
 * criterion #3: "已打开的文件再次点击切到对应标签页而非重复打开"). Does
 * not mutate `state`.
 */
export function openTab(state: TabState, path: string): OpenTabResult {
  if (state.tabs.includes(path)) {
    return { state: { tabs: state.tabs, activePath: path }, didOpen: false }
  }
  return { state: { tabs: [...state.tabs, path], activePath: path }, didOpen: true }
}

/** Switches the active tab to `path`. No-op (returns the same shape) if `path` isn't open. */
export function focusTab(state: TabState, path: string): TabState {
  if (!state.tabs.includes(path)) return state
  return { tabs: state.tabs, activePath: path }
}

/**
 * Closes `path`'s tab. If it was the active tab, focuses the neighbor
 * that was to its left, or the new first tab if it was leftmost, or null
 * if it was the last tab open. Does not mutate `state`.
 */
export function closeTab(state: TabState, path: string): TabState {
  const index = state.tabs.indexOf(path)
  if (index === -1) return state

  const remaining = state.tabs.filter((p) => p !== path)

  if (state.activePath !== path) {
    return { tabs: remaining, activePath: state.activePath }
  }

  if (remaining.length === 0) {
    return { tabs: remaining, activePath: null }
  }

  const nextActiveIndex = Math.max(index - 1, 0)
  return { tabs: remaining, activePath: remaining[nextActiveIndex] }
}

export function isTabOpen(state: TabState, path: string): boolean {
  return state.tabs.includes(path)
}

/**
 * Renames `oldPath`'s tab to `newPath` in place (same position in the
 * tab order; stays active if it was active). Does not mutate `state`.
 * No-op if `oldPath` isn't open, or if `newPath` is already open under a
 * different slot (shouldn't happen in practice since renameEntry
 * refuses to rename onto an existing file).
 *
 * Two call sites rely on this: ticket #19 acceptance criterion #2 (a
 * file renamed on disk via the file tree) and ticket #20's "Save As"
 * flow (re-targeting an already-open tab - e.g. one marked deleted, or
 * the conflict dialog's "save a copy" choice - to a new file path
 * without closing/reopening it).
 */
export function renameTabPath(state: TabState, oldPath: string, newPath: string): TabState {
  const index = state.tabs.indexOf(oldPath)
  if (index === -1) return state

  const tabs = [...state.tabs]
  tabs[index] = newPath
  const activePath = state.activePath === oldPath ? newPath : state.activePath
  return { tabs, activePath }
}
