/**
 * Ticket #22: full-text search across the open library.
 *
 * Pure (no `fs`, no `electron`, no DOM) query-building and result-shaping
 * logic, shared between the main process (which walks the filesystem and
 * runs these regexes against file contents) and the renderer (which needs
 * the same types to render streamed results). Kept dependency-free so it's
 * directly unit-testable, following the same shared-module pattern as
 * `src/shared/fileTree.ts` (#17) and `src/shared/frontmatter.ts`.
 */

import { splitFrontmatter } from './frontmatter'

export interface SearchOptions {
  /** Match case exactly. Default: false (case-insensitive). */
  caseSensitive: boolean
  /** Wrap the query in `\b` word boundaries. Default: false. */
  wholeWord: boolean
  /** Treat the query as a regular expression instead of a literal string. Default: false. */
  useRegex: boolean
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false
}

/** Escapes regex metacharacters so a literal query can be embedded in a RegExp source. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface BuildQueryRegexResult {
  regex: RegExp | null
  /** Set when `useRegex` was true and the user's pattern failed to compile. */
  error: string | null
}

/**
 * Builds the `RegExp` to run against file contents/names from the raw
 * query string and search options.
 *
 * - Plain (non-regex) mode: the query is escaped so regex metacharacters
 *   (e.g. `.` `(` `)`) are matched literally - acceptance criterion #3's
 *   "中文子串匹配不分词" falls out of this for free, since escaping +
 *   substring matching is exactly what plain substring search is.
 * - `wholeWord`: wraps the (already-escaped-if-not-regex) pattern in `\b`
 *   boundaries. Per the ticket's own guidance, `\b` between two CJK
 *   characters usually isn't a meaningful boundary in JS regex (`\b` is
 *   defined in terms of the ASCII `\w` class), so whole-word matching on
 *   Chinese text may not behave intuitively - that's accepted as-is,
 *   consistent with "不需要专门为中文做分词或特殊处理".
 * - `useRegex`: the query is compiled as-is (after optionally adding `\b`
 *   around it). Invalid patterns (e.g. unbalanced parens) are caught and
 *   reported via `error` instead of throwing, so one bad query can't crash
 *   the search.
 * - `caseSensitive`: default is OFF, i.e. the regex is case-insensitive
 *   (`i` flag) unless the option is explicitly true.
 *
 * The regex always carries the `g` flag (search needs every match, not
 * just the first) and `u` is deliberately omitted (Node's `u` flag changes
 * `\b`/character-class semantics in ways not needed here, and some
 * hand-typed user regexes with lone surrogates could throw under `u`).
 */
export function buildSearchRegex(query: string, options: SearchOptions): BuildQueryRegexResult {
  if (query.length === 0) return { regex: null, error: null }

  const body = options.useRegex ? query : escapeRegExp(query)
  const pattern = options.wholeWord ? `\\b(?:${body})\\b` : body
  const flags = options.caseSensitive ? 'g' : 'gi'

  try {
    return { regex: new RegExp(pattern, flags), error: null }
  } catch (err) {
    return { regex: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface LineMatch {
  /** 1-based line number within the file. */
  lineNumber: number
  /** The full text of the matched line. */
  lineText: string
  /** Character offset of the match within `lineText`. */
  matchStart: number
  /** Character offset (exclusive) where the match ends within `lineText`. */
  matchEnd: number
  /** The line immediately before the match, or null at the start of the file. */
  contextBefore: string | null
  /** The line immediately after the match, or null at the end of the file. */
  contextAfter: string | null
}

/**
 * Runs `regex` against `body` (the file's content with frontmatter already
 * excluded - see `excludeFrontmatter` below) line by line, returning every
 * matching line with 1-line-before/1-line-after context (acceptance
 * criterion #4).
 *
 * Matching line-by-line (rather than a single multiline regex pass over
 * the whole file) keeps line-number bookkeeping trivial and matches how a
 * human reads "hit at line N" - it also naturally caps a single match to
 * within one line, which is what the context/highlight UI expects.
 *
 * A regex with the global flag maintains `.lastIndex` across `.exec()`
 * calls, so each line resets it to 0 to search from the start of that
 * line's text independently.
 */
export function findLineMatches(body: string, regex: RegExp): LineMatch[] {
  const lines = body.split('\n')
  const results: LineMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]
    regex.lastIndex = 0
    const match = regex.exec(lineText)
    if (!match) continue

    results.push({
      lineNumber: i + 1,
      lineText,
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
      contextBefore: i > 0 ? lines[i - 1] : null,
      contextAfter: i < lines.length - 1 ? lines[i + 1] : null
    })
  }

  return results
}

export interface FileSearchResult {
  /** Absolute file path. */
  path: string
  /** Basename, for display. */
  name: string
  /** True if the file name itself matched the query (acceptance criterion #2: match filename too). */
  nameMatched: boolean
  /** Every matching line in the file's body (frontmatter excluded), not yet truncated. */
  matches: LineMatch[]
}

export const MAX_MATCHES_PER_FILE = 5

export interface GroupedFileResult {
  path: string
  name: string
  nameMatched: boolean
  /** Total match count in the file, before truncation. */
  totalMatches: number
  /** The first `MAX_MATCHES_PER_FILE` matches, for display. */
  displayedMatches: LineMatch[]
}

/**
 * Shapes a raw per-file result for display (acceptance criterion #4):
 * groups are already one-per-file by construction (`FileSearchResult`),
 * this just truncates each file's match list to the first
 * `MAX_MATCHES_PER_FILE` while keeping the true total for the "N hits"
 * label.
 */
export function groupAndTruncate(result: FileSearchResult): GroupedFileResult {
  return {
    path: result.path,
    name: result.name,
    nameMatched: result.nameMatched,
    totalMatches: result.matches.length,
    displayedMatches: result.matches.slice(0, MAX_MATCHES_PER_FILE)
  }
}

/**
 * Searches a single file's content (acceptance criterion #2: "不搜
 * frontmatter"). Excludes the frontmatter block via `splitFrontmatter`
 * (shared with the WYSIWYG editor, see src/shared/frontmatter.ts) before
 * running `findLineMatches`, and separately checks whether `fileName`
 * itself matches the same regex (acceptance criterion #2: match filename
 * too).
 *
 * `regex` must NOT have already been `.exec()`'d elsewhere with the `g`
 * flag in a way that left `lastIndex` in a nonzero state the caller cares
 * about - this function resets it via `findLineMatches`/its own
 * `.test()` call regardless, so a shared regex instance is safe to reuse
 * across many files in a loop (see src/main/search.ts).
 */
export function searchFileContent(
  path: string,
  name: string,
  fullContent: string,
  regex: RegExp
): FileSearchResult {
  const { body } = splitFrontmatter(fullContent)
  const matches = findLineMatches(body, regex)

  regex.lastIndex = 0
  const nameMatched = regex.test(name)
  regex.lastIndex = 0

  return { path, name, nameMatched, matches }
}
