import { promises as fs } from 'fs'
import { join } from 'path'
import { isHiddenName } from '../shared/fileTree'
import {
  buildSearchRegex,
  groupAndTruncate,
  searchFileContent,
  type GroupedFileResult,
  type SearchOptions
} from '../shared/search'

/**
 * Ticket #22: full-text search across the library, run live (no index)
 * every time the user types. This module owns the filesystem walk +
 * streaming + cancellation; the actual query-building/matching/grouping
 * logic lives in `src/shared/search.ts` so it's unit-testable without
 * `fs`.
 */

/**
 * Recursively collects every `.md`/`.markdown` file path under `rootPath`.
 *
 * Deliberately a separate, leaner walk than `fileSystem.ts`'s
 * `listDirectoryTree` (#17): that one builds a full tree with all visible
 * file kinds (images, PDFs, txt) for the sidebar, sorted for display.
 * Search only cares about markdown files as a flat list to scan, in
 * whatever order `readdir` gives - grouping/sorting happens per-result in
 * the renderer instead. Hidden files/folders (dotfiles, `.git`, etc.) are
 * skipped, consistent with the sidebar's own filtering.
 */
async function collectMarkdownFiles(rootPath: string): Promise<string[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true })
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    if (isHiddenName(entry.name)) continue

    const entryPath = join(rootPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)))
    } else if (entry.isFile() && isMarkdownExtension(entry.name)) {
      files.push(entryPath)
    }
  }
  return files
}

function isMarkdownExtension(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return ext === '.md' || ext === '.markdown'
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? path : normalized.slice(lastSlash + 1)
}

export interface SearchQuery {
  text: string
  options: SearchOptions
}

export interface SearchError {
  type: 'invalid-regex'
  message: string
}

/**
 * Runs a full-text search over every markdown file in `libraryPath`,
 * calling `onBatch` once per file that has at least one hit (filename
 * match or body match) as soon as it's found - this is the "stream
 * results, don't wait for the whole scan" requirement (acceptance
 * criterion #2/key constraint). Files with zero hits are never reported.
 *
 * Cancellation: `signal` is checked before starting each file, so a
 * caller that aborts mid-scan stops the walk promptly without needing to
 * interrupt an in-flight `fs.readFile` (Node's `fs.promises.readFile`
 * doesn't take an `AbortSignal` in a way that would meaningfully speed up
 * cancellation of a single small file read anyway - files are read one at
 * a time, sequentially, so the check between files is what actually
 * matters for responsiveness).
 *
 * Returns `{ error }` immediately (calling `onBatch` zero times) if the
 * query is regex-mode and fails to compile - this is checked once up
 * front rather than per-file so a bad pattern can't produce partial
 * results before failing.
 */
export async function runLibrarySearch(
  libraryPath: string,
  query: SearchQuery,
  signal: AbortSignal,
  onBatch: (result: GroupedFileResult) => void
): Promise<{ error: SearchError | null }> {
  if (query.text.length === 0) return { error: null }

  const { regex, error } = buildSearchRegex(query.text, query.options)
  if (error || !regex) {
    return { error: { type: 'invalid-regex', message: error ?? 'Invalid pattern' } }
  }

  const files = await collectMarkdownFiles(libraryPath)

  for (const filePath of files) {
    if (signal.aborted) break

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf-8')
    } catch {
      continue // unreadable file (permissions, race with deletion, etc.) - skip, don't abort the whole search
    }

    if (signal.aborted) break

    const result = searchFileContent(filePath, basename(filePath), content, regex)
    if (result.matches.length > 0 || result.nameMatched) {
      onBatch(groupAndTruncate(result))
    }
  }

  return { error: null }
}
