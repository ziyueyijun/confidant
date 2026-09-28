/**
 * Ticket #21 scope: pure fuzzy-matching + ranking logic for the Ctrl+P
 * quick switcher. Kept dependency-free (no DOM, no electron) so it can be
 * unit tested in isolation and shared between the flattening step (main
 * process's `FileTreeNode[]` -> flat file list) and the renderer's
 * keystroke-driven filtering.
 *
 * Two match strategies, tried in order per candidate:
 *  1. Substring match (case-insensitive) against the file's basename.
 *     This is the common case: typing "plan" finds "ProjectPlan.md".
 *  2. Camel-hump / abbreviation match: the query's characters must
 *     appear, *in order*, somewhere in the basename (a "subsequence"
 *     match: case-insensitive, gaps allowed between matched
 *     characters). This is the same family of algorithm VS Code's
 *     "Go to File" and Sublime Text's "Goto Anything" use, and it's
 *     exactly what's needed to satisfy the ticket's own example: typing
 *     "ppl" should match "ProjectPlan.md" - "ppl" is not a substring of
 *     the strict acronym "PP", but it *is* a subsequence of
 *     "projectplan" (p-p-l at positions 0, 7, 8: the "p" of "project",
 *     then the "p" and "l" that start and continue "plan"). A stricter
 *     "only match hump-initial letters" rule was tried first and
 *     rejected for exactly this reason - it fails the ticket's own
 *     worked example.
 *
 * Substring matches are ranked above subsequence matches, since a
 * literal substring hit is a stronger, less surprising signal than an
 * abbreviation coincidence. Within each strategy, shorter names rank
 * first (a shorter match is more likely to be "the" file the user
 * means), then alphabetically for stability.
 *
 * Precision tradeoff: because subsequence matching allows gaps anywhere
 * (not just at camelCase/word boundaries), a query like "ent" could in
 * principle match a filename via non-boundary letters too, not just
 * intentional acronyms. This is deliberate and matches how every popular
 * "quick open" picker behaves - it's mitigated in practice by ranking
 * subsequence hits below substring hits, and capping results at 10, so
 * the strongest/most literal matches always surface first.
 */

export interface QuickSwitcherFile {
  /** Absolute filesystem path - used as the stable identity/return value. */
  path: string
  /** Basename, e.g. "ProjectPlan.md" - what fuzzy matching runs against. */
  name: string
}

export interface QuickSwitcherMatch {
  file: QuickSwitcherFile
  /** Which strategy matched, for ranking (substring beats subsequence/acronym). */
  kind: 'substring' | 'acronym'
}

const MAX_RESULTS = 10

/**
 * Extracts the "acronym" of a file basename for display/diagnostic
 * purposes: every uppercase letter, plus the first letter following a
 * `-`/`_`/` `/`.` separator, plus the very first character. Operates on
 * the name without its extension, since matching into ".md"/".markdown"
 * is never useful.
 *
 * Examples:
 *   "ProjectPlan.md"   -> "PP"
 *   "project-plan.md"  -> "pp"
 *   "my_todo_list.txt" -> "mtl"
 *   "notes.md"         -> "n"
 *
 * Note: this strict acronym string is *not* what `matchFile` matches the
 * query against (see module doc for why) - it's kept as an independently
 * useful/testable pure function, e.g. for a future "show the matched
 * acronym" UI affordance.
 */
export function extractAcronym(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  if (stem.length === 0) return ''

  let acronym = stem[0]
  for (let i = 1; i < stem.length; i++) {
    const ch = stem[i]
    const prev = stem[i - 1]
    if (/[A-Z]/.test(ch)) {
      acronym += ch
    } else if (/[-_ .]/.test(prev) && /[a-zA-Z0-9]/.test(ch)) {
      acronym += ch
    }
  }
  return acronym
}

/**
 * Returns true if `query` is a case-insensitive substring of `text`.
 */
function isSubstringMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

/**
 * Returns true if every character of `query` appears in `text`, in the
 * same order, case-insensitively (gaps allowed between matches). This is
 * the "camel-hump abbreviation" strategy - see module doc for why plain
 * subsequence matching (rather than strict hump-initials-only matching)
 * is used.
 */
function isSubsequenceMatch(text: string, query: string): boolean {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = false
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = true
        ti++
        break
      }
      ti++
    }
    if (!found) return false
  }
  return true
}

/**
 * Runs `query` against a single file. Returns the match strategy that
 * succeeded (substring checked first, since it's the stronger signal),
 * or `null` if neither strategy matches.
 */
export function matchFile(file: QuickSwitcherFile, query: string): QuickSwitcherMatch | null {
  if (query.length === 0) return null

  if (isSubstringMatch(file.name, query)) {
    return { file, kind: 'substring' }
  }

  if (isSubsequenceMatch(file.name, query)) {
    return { file, kind: 'acronym' }
  }

  return null
}

/**
 * Filters+ranks `files` against `query`, returning at most 10 results
 * (acceptance criterion #3). Substring matches sort before
 * subsequence/acronym matches; ties break by shorter name then
 * alphabetically, so the most plausible "that's the one" candidate lands
 * first.
 */
export function fuzzyMatchFiles(files: QuickSwitcherFile[], query: string): QuickSwitcherFile[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const matches: QuickSwitcherMatch[] = []
  for (const file of files) {
    const match = matchFile(file, trimmed)
    if (match) matches.push(match)
  }

  matches.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'substring' ? -1 : 1
    if (a.file.name.length !== b.file.name.length) return a.file.name.length - b.file.name.length
    return a.file.name.localeCompare(b.file.name, undefined, { sensitivity: 'base' })
  })

  return matches.slice(0, MAX_RESULTS).map((m) => m.file)
}

export { MAX_RESULTS as QUICK_SWITCHER_MAX_RESULTS }
