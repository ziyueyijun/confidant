import { promises as fs } from 'fs'
import { basename } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import {
  coalesceEvents,
  computeEtag,
  DEFAULT_DEBOUNCE_MS,
  isExternalChange,
  isTempFileName,
  type CoalescedEvent,
  type RawChokidarEventType,
  type RawWatchEvent
} from '../shared/externalWatch'

/**
 * Ticket #20: watches the currently open library folder with chokidar and
 * pushes coalesced, own-write-filtered change events to the renderer.
 *
 * chokidar version choice: v4.0.3, pinned exact. v4 dropped glob-pattern
 * support in favor of plain path/directory watching (we only ever watch
 * one root directory recursively and do our own filename filtering in
 * `shared/externalWatch.ts`'s `isTempFileName`, so we never needed glob
 * matching) and cut the dependency tree from seven packages (v3.6.0:
 * braces, is-glob, anymatch, readdirp, glob-parent, is-binary-path,
 * normalize-path) down to one (readdirp@4). Fewer transitive deps means
 * less supply-chain surface and a smaller `node_modules` for an Electron
 * app that already ships its own copy. v4 has been the stable/recommended
 * release for over a year (v3 only receives security fixes); v5 (also on
 * npm) is too new to have earned the same confidence for a desktop app
 * that runs unattended on users' machines.
 *
 * Own-write suppression (acceptance criterion #3): every read/write of a
 * file through `fileSystem.ts` should update this module's notion of
 * that path's "known etag" *before* chokidar's filesystem event for that
 * write arrives, so the debounced handler below can compare the fresh
 * on-disk etag against the known one and skip firing an external-change
 * event for a change the app caused itself. See `noteOwnWrite` /
 * `noteKnownState`, wired from `main/index.ts`.
 */

export interface ExternalWatchOptions {
  /** Debounce window in ms. Defaults to 100 (criterion #1); pass 300 for known cloud-sync folders. */
  debounceMs?: number
  /** Called once per coalesced logical event, after own-write filtering. */
  onExternalChange: (event: CoalescedEvent) => void
}

export interface ExternalWatchHandle {
  /** Records that `path`'s current on-disk stat should be treated as "known" (not external) - call after every successful read. */
  noteKnownState(path: string): Promise<void>
  /** Records the etag for `path` right after this app wrote it, so the resulting chokidar event is recognized as our own write. */
  noteOwnWrite(path: string, etag: string): void
  /** Stops watching and releases chokidar's handles. */
  close(): Promise<void>
}

/**
 * Starts watching `libraryRoot` recursively. Only one library is ever
 * open at a time (per the app's current single-window/single-library
 * model - ticket #17), so callers should `close()` any previous handle
 * before opening a new one.
 */
export function watchLibrary(libraryRoot: string, options: ExternalWatchOptions): ExternalWatchHandle {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const knownEtags = new Map<string, string>()
  const pendingByPath = new Map<string, RawWatchEvent[]>()
  const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const watcher: FSWatcher = chokidar.watch(libraryRoot, {
    ignoreInitial: true,
    persistent: true,
    // Windows (and some cloud-sync clients) can report duplicate/rapid
    // native events for a single logical write; chokidar's built-in
    // awaitWriteFinish for `add`/`change` smooths over the "file is
    // still being written" case, but rename-split (unlink+add) is still
    // handled by our own coalescing below since it fires as two
    // distinct chokidar event types.
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 }
  })

  function scheduleFlush(path: string): void {
    const existing = flushTimers.get(path)
    if (existing) clearTimeout(existing)
    flushTimers.set(
      path,
      setTimeout(() => {
        flushTimers.delete(path)
        flushPath(path)
      }, debounceMs)
    )
  }

  function recordEvent(type: RawChokidarEventType, path: string): void {
    if (isTempFileName(basename(path))) return
    const list = pendingByPath.get(path) ?? []
    list.push({ type, path, timestamp: Date.now() })
    pendingByPath.set(path, list)
    scheduleFlush(path)
  }

  function flushPath(path: string): void {
    const events = pendingByPath.get(path)
    pendingByPath.delete(path)
    if (!events || events.length === 0) return

    const [coalesced] = coalesceEvents(events, debounceMs)
    if (!coalesced) return

    if (coalesced.type === 'deleted') {
      knownEtags.delete(path)
      options.onExternalChange(coalesced)
      return
    }

    // 'updated': compare against the known etag to filter out the app's
    // own writeFileAtomic (ticket #15) producing this exact event.
    void resolveAndMaybeEmit(coalesced)
  }

  async function resolveAndMaybeEmit(coalesced: CoalescedEvent): Promise<void> {
    let stat: import('fs').Stats
    try {
      stat = await fs.stat(coalesced.path)
    } catch {
      // File vanished between the event firing and us stat-ing it
      // (e.g. a very fast create+delete, or it was actually a delete
      // that raced with our coalescing) - treat as deleted.
      knownEtags.delete(coalesced.path)
      options.onExternalChange({ type: 'deleted', path: coalesced.path })
      return
    }

    const diskEtag = computeEtag(stat)
    const knownEtag = knownEtags.get(coalesced.path) ?? null

    if (!isExternalChange(knownEtag, diskEtag)) {
      // Matches what we already knew (our own write, or a redundant
      // duplicate event) - nothing to tell the renderer.
      return
    }

    knownEtags.set(coalesced.path, diskEtag)
    options.onExternalChange(coalesced)
  }

  watcher.on('add', (path) => recordEvent('add', path))
  watcher.on('change', (path) => recordEvent('change', path))
  watcher.on('unlink', (path) => recordEvent('unlink', path))

  return {
    async noteKnownState(path: string): Promise<void> {
      try {
        const stat = await fs.stat(path)
        knownEtags.set(path, computeEtag(stat))
      } catch {
        // Best-effort: if the file can't be stat'd (e.g. it was already
        // removed), leave any prior known etag alone.
      }
    },

    noteOwnWrite(path: string, etag: string): void {
      knownEtags.set(path, etag)
    },

    async close(): Promise<void> {
      for (const timer of flushTimers.values()) clearTimeout(timer)
      flushTimers.clear()
      pendingByPath.clear()
      await watcher.close()
    }
  }
}

/** Re-exported so callers (main/index.ts, fileSystem.ts) can compute an etag right after a read/write without importing `shared/externalWatch` directly. */
export { computeEtag }
