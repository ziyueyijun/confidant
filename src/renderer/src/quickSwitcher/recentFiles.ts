/**
 * Ticket #21 scope: tracks "recently opened files within the current
 * library", for the Ctrl+P quick switcher's default (no-query) view.
 *
 * Deliberately distinct from #17's "recently opened libraries"
 * (`src/shared/library.ts`, persisted to disk) - this is a different
 * concept (files, not libraries) and isn't persisted: it's rebuilt from
 * scratch each time the app starts (or a library is opened), which is
 * acceptable per the ticket - there's no strong need to remember "which
 * file was open two sessions ago" across restarts, and skipping
 * persistence avoids another disk-write path to keep in sync.
 *
 * Pure data structure (no DOM) so the dedup/truncation logic is directly
 * unit-testable.
 */

export interface RecentFilesState {
  /** Paths, most-recently-opened first. Capped at MAX_RECENT_FILES. */
  paths: string[]
}

export const EMPTY_RECENT_FILES_STATE: RecentFilesState = { paths: [] }

/** How many recent files the quick switcher's default view shows (acceptance criterion #2). */
export const MAX_RECENT_FILES = 3

/**
 * Records `path` as just-opened: moves it to the front if already
 * present (dedup - reopening a file bumps it to most-recent rather than
 * creating a duplicate entry), otherwise inserts it at the front. Caps
 * the list at `MAX_RECENT_FILES` entries. Does not mutate `state`.
 */
export function recordFileOpened(state: RecentFilesState, path: string): RecentFilesState {
  const withoutPath = state.paths.filter((p) => p !== path)
  const paths = [path, ...withoutPath].slice(0, MAX_RECENT_FILES)
  return { paths }
}
