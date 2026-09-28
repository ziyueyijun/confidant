/**
 * Ticket #17 scope: pure logic for the "recently opened libraries" list,
 * persisted the same way #18 persists theme config (a small JSON file in
 * `app.getPath('userData')`) - see `src/main/libraryStore.ts` for the
 * disk I/O. Kept dependency-free so the "add to recents, cap at 5,
 * de-dupe, most-recent-first" behavior is unit testable without touching
 * the filesystem.
 */

export const MAX_RECENT_LIBRARIES = 5

/** Shape persisted to disk (library.json in the userData dir). */
export interface LibraryConfig {
  /** Absolute folder paths, most-recently-opened first. Max length 5. */
  recentLibraryPaths: string[]
}

export const DEFAULT_LIBRARY_CONFIG: LibraryConfig = {
  recentLibraryPaths: []
}

/**
 * Normalizes a path for de-duplication comparisons only (Windows paths
 * are case-insensitive and may use either slash direction). The
 * caller-facing list still stores the original, unmodified path string.
 */
function normalizeForComparison(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * Returns a new recents list with `libraryPath` moved to the front,
 * removing any existing occurrence (case-insensitive, slash-insensitive)
 * and truncating to `MAX_RECENT_LIBRARIES`. Does not mutate the input.
 */
export function addRecentLibrary(recents: string[], libraryPath: string): string[] {
  const normalizedTarget = normalizeForComparison(libraryPath)
  const withoutExisting = recents.filter((p) => normalizeForComparison(p) !== normalizedTarget)
  return [libraryPath, ...withoutExisting].slice(0, MAX_RECENT_LIBRARIES)
}

/**
 * Serializes a library config to a JSON string for disk persistence.
 * Pretty-printed so the file is human-editable/diffable, matching
 * `theme.ts`'s `serializeThemeConfig`.
 */
export function serializeLibraryConfig(config: LibraryConfig): string {
  return JSON.stringify(config, null, 2)
}

/**
 * Parses a library config from disk, tolerating missing/corrupt data by
 * falling back to defaults. Never throws.
 */
export function parseLibraryConfig(raw: string): LibraryConfig {
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof LibraryConfig, unknown>>
    const paths = parsed.recentLibraryPaths
    if (Array.isArray(paths) && paths.every((p) => typeof p === 'string')) {
      return { recentLibraryPaths: paths.slice(0, MAX_RECENT_LIBRARIES) }
    }
    return { ...DEFAULT_LIBRARY_CONFIG }
  } catch {
    return { ...DEFAULT_LIBRARY_CONFIG }
  }
}
