import { describe, expect, it } from 'vitest'
import {
  extractAcronym,
  fuzzyMatchFiles,
  matchFile,
  QUICK_SWITCHER_MAX_RESULTS,
  type QuickSwitcherFile
} from './quickSwitcher'

function file(path: string): QuickSwitcherFile {
  return { path, name: path.slice(path.lastIndexOf('/') + 1) }
}

describe('extractAcronym', () => {
  it('extracts uppercase letters from a PascalCase name', () => {
    expect(extractAcronym('ProjectPlan.md')).toBe('PP')
  })

  it('extracts first letters of hyphen/underscore/space-separated words', () => {
    expect(extractAcronym('project-plan.md')).toBe('pp')
    expect(extractAcronym('my_todo_list.txt')).toBe('mtl')
    expect(extractAcronym('meeting notes.md')).toBe('mn')
  })

  it('always includes the first character even without a separator before it', () => {
    expect(extractAcronym('notes.md')).toBe('n')
  })

  it('ignores the extension', () => {
    // Every letter in "Readme" is a separate hump only if uppercase;
    // "Readme.markdown" has a single leading capital, so the acronym is
    // just "R" - the extension itself must not contribute letters.
    expect(extractAcronym('Readme.markdown')).toBe('R')
  })

  it('treats a dotfile-style name (leading dot) as having no extension to strip', () => {
    // lastIndexOf('.') === 0 here, which the `dot > 0` guard treats as
    // "no extension" (consistent with fileTree.ts's dotfile handling),
    // so the whole string becomes the stem.
    expect(extractAcronym('.md')).toBe('.m')
  })
})

describe('matchFile (substring + camel-hump/acronym subsequence)', () => {
  it('matches a case-insensitive substring of the basename', () => {
    const f = file('/lib/ProjectPlan.md')
    expect(matchFile(f, 'plan')?.kind).toBe('substring')
    expect(matchFile(f, 'PLAN')?.kind).toBe('substring')
    expect(matchFile(f, 'projectplan')?.kind).toBe('substring')
  })

  it('matches the ticket\'s worked example: "ppl" finds "ProjectPlan.md"', () => {
    const f = file('/lib/ProjectPlan.md')
    const match = matchFile(f, 'ppl')
    expect(match).not.toBeNull()
    expect(match?.kind).toBe('acronym')
  })

  it('matches a strict camelCase acronym like "pp" for ProjectPlan.md', () => {
    const f = file('/lib/ProjectPlan.md')
    expect(matchFile(f, 'pp')?.kind).toBe('acronym')
  })

  it('prefers substring over subsequence when both would match', () => {
    const f = file('/lib/plan.md')
    // "plan" is a literal substring, so it must win even though it would
    // also trivially be a subsequence.
    expect(matchFile(f, 'plan')?.kind).toBe('substring')
  })

  it('returns null when the query characters are out of order', () => {
    // "lp" reversed relative to how "plan" appears in the name - not a
    // valid subsequence, so this must NOT match.
    const f = file('/lib/plan.md')
    expect(matchFile(f, 'lp')).toBeNull()
  })

  it('returns null when neither strategy matches', () => {
    const f = file('/lib/ProjectPlan.md')
    expect(matchFile(f, 'xyz')).toBeNull()
  })

  it('returns null for an empty query', () => {
    const f = file('/lib/ProjectPlan.md')
    expect(matchFile(f, '')).toBeNull()
  })
})

describe('fuzzyMatchFiles', () => {
  it('returns an empty array for an empty or whitespace-only query', () => {
    const files = [file('/a.md'), file('/b.md')]
    expect(fuzzyMatchFiles(files, '')).toEqual([])
    expect(fuzzyMatchFiles(files, '   ')).toEqual([])
  })

  it('finds substring matches case-insensitively', () => {
    const files = [file('/lib/ProjectPlan.md'), file('/lib/notes.md')]
    const results = fuzzyMatchFiles(files, 'plan')
    expect(results.map((f) => f.name)).toEqual(['ProjectPlan.md'])
  })

  it('finds camel-hump acronym matches', () => {
    const files = [file('/lib/ProjectPlan.md'), file('/lib/notes.md')]
    const results = fuzzyMatchFiles(files, 'pp')
    expect(results.map((f) => f.name)).toEqual(['ProjectPlan.md'])
  })

  it('finds the ticket\'s "ppl" example among unrelated files', () => {
    const files = [file('/lib/ProjectPlan.md'), file('/lib/notes.md'), file('/lib/todo.md')]
    const results = fuzzyMatchFiles(files, 'ppl')
    expect(results.map((f) => f.name)).toEqual(['ProjectPlan.md'])
  })

  it('ranks substring matches above subsequence/acronym matches', () => {
    const substringFile = file('/lib/plan-details.md') // substring hit on "plan"
    const acronymOnlyFile = file('/lib/People Landing.md') // subsequence hit, not a substring
    const results = fuzzyMatchFiles([acronymOnlyFile, substringFile], 'plan')
    expect(results.map((f) => f.name)).toEqual(['plan-details.md', 'People Landing.md'])
  })

  it('caps results at the max result count', () => {
    const files = Array.from({ length: 25 }, (_, i) => file(`/lib/plan-${i}.md`))
    const results = fuzzyMatchFiles(files, 'plan')
    expect(results).toHaveLength(QUICK_SWITCHER_MAX_RESULTS)
  })

  it('sorts same-strategy matches by shorter name first, then alphabetically', () => {
    const files = [file('/lib/plan-longer-name.md'), file('/lib/plan.md'), file('/lib/aplan.md')]
    const results = fuzzyMatchFiles(files, 'plan')
    expect(results.map((f) => f.name)).toEqual(['plan.md', 'aplan.md', 'plan-longer-name.md'])
  })

  it('does not match files with no relation to the query', () => {
    const files = [file('/lib/notes.md'), file('/lib/todo.md')]
    expect(fuzzyMatchFiles(files, 'xyz')).toEqual([])
  })

  it('does not match when query characters exist but out of order', () => {
    const files = [file('/lib/plan.md')]
    expect(fuzzyMatchFiles(files, 'lp')).toEqual([])
  })
})
