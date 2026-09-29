/**
 * Ticket #20 scope: pure logic for detecting/handling external changes to
 * files in an open library (edits made outside the app, e.g. in Typora or
 * VS Code, while the app is also open). Kept dependency-free (no
 * `chokidar`, no `fs`, no DOM) so the etag/coalescing/conflict-routing
 * rules are unit testable without a real filesystem or a real 100ms
 * debounce wait - see `src/main/externalWatch.ts` for the chokidar glue
 * that drives this, and `src/renderer/src/watch/` for the IPC consumer.
 *
 * Etag format and rationale (issue #10 research, cross-referencing VS
 * Code's own file-change-detection code): `mtime.toString(29) +
 * size.toString(31)`. Base-29/31 are arbitrary-but-fixed radixes chosen
 * upstream only to keep the resulting string short; the only property we
 * rely on is that two different (mtimeMs, size) pairs almost never
 * produce the same string, which is all an equality-based "did this file
 * change on disk" check needs (this is explicitly not a cryptographic or
 * collision-proof hash).
 */

/** Etag inputs read directly off `fs.Stats` (mtimeMs, not `mtime` the Date, avoids a redundant Date->number->Date round trip). */
export interface StatLike {
  mtimeMs: number
  size: number
}

/**
 * Computes a short etag string from a file's mtime+size, per VS Code's
 * implementation referenced in issue #10. Same (mtimeMs, size) pair
 * always yields the same etag; that's the only property callers need.
 */
export function computeEtag(stat: StatLike): string {
  return stat.mtimeMs.toString(29) + stat.size.toString(31)
}

/**
 * True if `diskEtag` (freshly computed from a stat/chokidar event)
 * differs from `knownEtag` (the etag recorded the last time this app
 * read or wrote the file). A mismatch means the file changed on disk
 * since the app last touched it - either externally, or `knownEtag` is
 * `null`/stale for some other reason. Equal etags mean "nothing to do":
 * either no real change happened, or the change is the app's own write
 * finishing (see `src/main/fileSystem.ts` `writeFileAtomic`, whose
 * rename-over-existing-file produces a new mtime that the caller is
 * expected to have already recorded as the new `knownEtag` before
 * chokidar's event arrives - see externalWatch.ts for that sequencing).
 */
export function isExternalChange(knownEtag: string | null, diskEtag: string): boolean {
  return knownEtag !== diskEtag
}

// --- Temporary-file filtering (acceptance criterion #2) ---

/**
 * Patterns for editor/sync-tool scratch files that must never trigger a
 * reload/conflict flow: Word/Office lock files (`~$foo.docx`), generic
 * `.tmp` files (including our own `writeFileAtomic` sibling temp file,
 * ticket #15), and LibreOffice/OpenOffice lock files (`.~lock.foo#`).
 * Matched against the basename only, not the full path.
 */
const TEMP_FILE_PATTERNS: RegExp[] = [
  /^~\$/, // ~$foo.docx (Office lock files)
  /\.tmp$/i, // foo.md.tmp (our own atomic-write temp file, and generic .tmp scratch files)
  /^\.~lock\..*#?$/ // .~lock.foo.md# (LibreOffice/OpenOffice lock files)
]

/** True if `basename` (just the filename, no directory) matches a known temp/lock-file pattern that should be ignored entirely. */
export function isTempFileName(basename: string): boolean {
  return TEMP_FILE_PATTERNS.some((pattern) => pattern.test(basename))
}

// --- Event coalescing / rename-split merging (acceptance criteria #1, #7) ---

export const DEFAULT_DEBOUNCE_MS = 100
/** Suggested wider debounce for cloud-sync-backed library folders (Dropbox/OneDrive/iCloud), per acceptance criterion #1. */
export const CLOUD_SYNC_DEBOUNCE_MS = 300

export type RawChokidarEventType = 'add' | 'change' | 'unlink'

export interface RawWatchEvent {
  type: RawChokidarEventType
  path: string
  /** Injectable clock value (ms since epoch, or any monotonic counter) so tests don't need real sleeps. */
  timestamp: number
}

export type CoalescedEventType = 'updated' | 'deleted'

export interface CoalescedEvent {
  type: CoalescedEventType
  path: string
}

/**
 * Merges a burst of raw chokidar events (same path, or a delete+create
 * pair from a Windows rename split) into the minimal set of logical
 * events the rest of the app should act on.
 *
 * Two things happen here, both within the same `debounceMs` window:
 *
 * 1. Multiple `change`/`add` events for the same path collapse into one
 *    `updated`.
 * 2. Windows commonly reports a rename as `unlink` immediately followed
 *    by `add` for the *same path* (chokidar's own event stream, not a
 *    different path - editors/OS rename-in-place by deleting the old
 *    inode and creating a new one at the same name) within a few ms of
 *    each other. If an `add` for a path arrives within `debounceMs` of
 *    that path's `unlink`, treat the pair as a single `updated` rather
 *    than a real delete (acceptance criterion #7). If no matching `add`
 *    shows up in time, the `unlink` is a real delete and is emitted as
 *    `deleted` once the window closes.
 *
 * `events` must be sorted by `timestamp` ascending (chokidar delivers
 * events in emission order, so callers driving this off the live watcher
 * don't need to sort). This function is pure and takes no wall-clock
 * time itself - the caller (a real debounce timer in production, a fake
 * clock in tests) decides when a window has "closed".
 */
export function coalesceEvents(events: RawWatchEvent[], debounceMs: number = DEFAULT_DEBOUNCE_MS): CoalescedEvent[] {
  const byPath = new Map<string, RawWatchEvent[]>()
  for (const event of events) {
    const list = byPath.get(event.path) ?? []
    list.push(event)
    byPath.set(event.path, list)
  }

  const results: CoalescedEvent[] = []

  for (const [path, pathEvents] of byPath) {
    // Sort defensively - callers are expected to hand us timestamp-ascending
    // input, but per-path re-sorting makes this function robust regardless.
    const sorted = [...pathEvents].sort((a, b) => a.timestamp - b.timestamp)

    let sawDelete = false
    let deleteTimestamp = -Infinity
    let sawAddOrChangeAfterDelete = false
    let sawAnyAddOrChange = false

    for (const event of sorted) {
      if (event.type === 'unlink') {
        // A later unlink after a resurrect restarts the "is this a real
        // delete" window.
        sawDelete = true
        deleteTimestamp = event.timestamp
        sawAddOrChangeAfterDelete = false
      } else {
        sawAnyAddOrChange = true
        if (sawDelete && event.timestamp - deleteTimestamp <= debounceMs) {
          sawAddOrChangeAfterDelete = true
        }
      }
    }

    if (sawDelete && !sawAddOrChangeAfterDelete) {
      results.push({ type: 'deleted', path })
    } else if (sawAnyAddOrChange) {
      results.push({ type: 'updated', path })
    }
    // else: sawDelete && sawAddOrChangeAfterDelete handled by the
    // `sawAnyAddOrChange` branch above (the add/change after the delete
    // counts as "any add or change"), producing a single 'updated'.
  }

  return results
}

// --- Conflict routing (acceptance criteria #4, #5, #6) ---

export type ExternalChangeAction =
  | { kind: 'silent-reload' }
  | { kind: 'mark-deleted' }
  | { kind: 'conflict-dialog' }
  | { kind: 'ignore' }

/**
 * Given the state of one open document when an external filesystem event
 * arrives for its path, decides which of the four flows to run. Pure
 * decision table, no I/O - `src/renderer/src/watch/` calls this with the
 * live `AutosaveController.isDirty()` result and the coalesced event
 * type, then performs the actual reload/UI update/dialog.
 *
 * - External delete + no local unsaved changes: still "mark-deleted"
 *   (acceptance criterion #5 draws no distinction on dirty state for
 *   deletes - the file is gone either way, so there's nothing to
 *   silently reload from).
 * - External update + no local unsaved changes: "silent-reload"
 *   (acceptance criterion #4).
 * - External update + local unsaved changes: "conflict-dialog"
 *   (acceptance criterion #6, true conflict).
 * - External delete + local unsaved changes: also "mark-deleted" - the
 *   tab-red/"deleted" treatment already communicates "your only path
 *   forward is Save As", which subsumes the conflict prompt (there's no
 *   "external version" to offer as a dialog choice once the file is
 *   gone).
 */
export function decideExternalChangeAction(
  isLocalDirty: boolean,
  externalEventType: CoalescedEventType
): ExternalChangeAction {
  if (externalEventType === 'deleted') {
    return { kind: 'mark-deleted' }
  }
  // externalEventType === 'updated'
  return isLocalDirty ? { kind: 'conflict-dialog' } : { kind: 'silent-reload' }
}
