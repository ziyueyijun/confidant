import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH_OPTIONS,
  MAX_MATCHES_PER_FILE,
  buildSearchRegex,
  escapeRegExp,
  findLineMatches,
  groupAndTruncate,
  searchFileContent,
  type FileSearchResult,
  type SearchOptions
} from './search'

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c')
    expect(escapeRegExp('(foo)')).toBe('\\(foo\\)')
    expect(escapeRegExp('a+b?c^d$e{f}g|h[i]j\\k')).toBe(
      'a\\+b\\?c\\^d\\$e\\{f\\}g\\|h\\[i\\]j\\\\k'
    )
  })

  it('leaves plain text and CJK characters untouched', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
    expect(escapeRegExp('中文子串')).toBe('中文子串')
  })
})

describe('buildSearchRegex', () => {
  it('returns null regex/error for an empty query', () => {
    const result = buildSearchRegex('', DEFAULT_SEARCH_OPTIONS)
    expect(result.regex).toBeNull()
    expect(result.error).toBeNull()
  })

  describe('plain substring mode (useRegex: false)', () => {
    it('escapes regex metacharacters in the literal query', () => {
      const { regex } = buildSearchRegex('a.b', DEFAULT_SEARCH_OPTIONS)
      expect(regex!.test('a.b')).toBe(true)
      expect(regex!.test('aXb')).toBe(false) // "." must not act as a wildcard
    })

    it('matches CJK substrings without word-splitting', () => {
      const { regex } = buildSearchRegex('中文', DEFAULT_SEARCH_OPTIONS)
      expect(regex!.test('这是中文测试')).toBe(true)
    })

    it('is case-insensitive by default', () => {
      // Two independent builds (not two `.test()` calls on the same `g`
      // regex, which would advance `lastIndex` and give a false negative
      // on the second call regardless of case-sensitivity).
      expect(buildSearchRegex('Hello', DEFAULT_SEARCH_OPTIONS).regex!.test('hello world')).toBe(true)
      expect(buildSearchRegex('Hello', DEFAULT_SEARCH_OPTIONS).regex!.test('HELLO WORLD')).toBe(true)
    })

    it('is case-sensitive when caseSensitive: true', () => {
      const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true }
      expect(buildSearchRegex('Hello', options).regex!.test('Hello world')).toBe(true)
      expect(buildSearchRegex('Hello', options).regex!.test('hello world')).toBe(false)
    })
  })

  describe('whole-word mode', () => {
    it('adds \\b boundaries and rejects partial-word matches', () => {
      const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true }
      // Fresh regex per assertion: `g`-flag regexes are stateful
      // (`lastIndex`), so reusing one object across `.test()` calls would
      // make the second call's result depend on the first's match
      // position rather than on the input string being tested.
      expect(buildSearchRegex('cat', options).regex!.test('a cat sat')).toBe(true)
      expect(buildSearchRegex('cat', options).regex!.test('concatenate')).toBe(false)
    })

    it('escapes metacharacters before adding boundaries when not in regex mode', () => {
      const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true }
      const built = buildSearchRegex('a.b', options)
      expect(built.error).toBeNull()
      expect(buildSearchRegex('a.b', options).regex!.test('a.b')).toBe(true)
      expect(buildSearchRegex('a.b', options).regex!.test('axb')).toBe(false)
    })
  })

  describe('regex mode', () => {
    it('compiles the user pattern as-is', () => {
      const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, useRegex: true }
      const { regex, error } = buildSearchRegex('a.b', options)
      expect(error).toBeNull()
      expect(regex!.test('axb')).toBe(true) // "." is a real wildcard here
    })

    it('reports an error instead of throwing for an invalid pattern', () => {
      const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, useRegex: true }
      expect(() => buildSearchRegex('a(b', options)).not.toThrow()
      const { regex, error } = buildSearchRegex('a(b', options)
      expect(regex).toBeNull()
      expect(error).not.toBeNull()
    })

    it('combines regex mode with wholeWord', () => {
      const options: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, useRegex: true, wholeWord: true }
      const built = buildSearchRegex('c.t', options)
      expect(built.error).toBeNull()
      expect(buildSearchRegex('c.t', options).regex!.test('a cat sat')).toBe(true)
      expect(buildSearchRegex('c.t', options).regex!.test('concatenate')).toBe(false)
    })
  })
})

describe('findLineMatches', () => {
  it('finds a single match with 1-line-before/after context', () => {
    const body = 'line one\nline two has needle\nline three'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const matches = findLineMatches(body, regex!)

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      lineNumber: 2,
      lineText: 'line two has needle',
      contextBefore: 'line one',
      contextAfter: 'line three'
    })
    expect(matches[0].matchStart).toBe(13)
    expect(matches[0].matchEnd).toBe(19)
  })

  it('has null context before the first line and after the last line', () => {
    const body = 'needle at start\nmiddle\nneedle at end'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const matches = findLineMatches(body, regex!)

    expect(matches).toHaveLength(2)
    expect(matches[0].contextBefore).toBeNull()
    expect(matches[0].contextAfter).toBe('middle')
    expect(matches[1].contextBefore).toBe('middle')
    expect(matches[1].contextAfter).toBeNull()
  })

  it('returns one match per matching line even if resetting lastIndex across lines', () => {
    const body = 'needle\nnothing\nneedle\nneedle'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const matches = findLineMatches(body, regex!)

    expect(matches.map((m) => m.lineNumber)).toEqual([1, 3, 4])
  })

  it('returns no matches when the query is not found', () => {
    const body = 'nothing here\nor here'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    expect(findLineMatches(body, regex!)).toEqual([])
  })

  it('matches CJK substrings across multiple lines', () => {
    const body = '第一行普通文字\n第二行包含中文关键词在这里\n第三行'
    const { regex } = buildSearchRegex('中文关键词', DEFAULT_SEARCH_OPTIONS)

    const matches = findLineMatches(body, regex!)

    expect(matches).toHaveLength(1)
    expect(matches[0].lineNumber).toBe(2)
  })
})

describe('groupAndTruncate', () => {
  function makeMatch(lineNumber: number): FileSearchResult['matches'][number] {
    return {
      lineNumber,
      lineText: `line ${lineNumber}`,
      matchStart: 0,
      matchEnd: 4,
      contextBefore: null,
      contextAfter: null
    }
  }

  it('keeps totalMatches accurate while truncating displayedMatches to the first 5', () => {
    const result: FileSearchResult = {
      path: '/lib/many.md',
      name: 'many.md',
      nameMatched: false,
      matches: Array.from({ length: 8 }, (_, i) => makeMatch(i + 1))
    }

    const grouped = groupAndTruncate(result)

    expect(grouped.totalMatches).toBe(8)
    expect(grouped.displayedMatches).toHaveLength(MAX_MATCHES_PER_FILE)
    expect(grouped.displayedMatches.map((m) => m.lineNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it('passes through fewer than 5 matches unchanged', () => {
    const result: FileSearchResult = {
      path: '/lib/few.md',
      name: 'few.md',
      nameMatched: true,
      matches: [makeMatch(1), makeMatch(2)]
    }

    const grouped = groupAndTruncate(result)

    expect(grouped.totalMatches).toBe(2)
    expect(grouped.displayedMatches).toHaveLength(2)
    expect(grouped.nameMatched).toBe(true)
  })

  it('handles a file with zero matches (filename-only match)', () => {
    const result: FileSearchResult = {
      path: '/lib/needle.md',
      name: 'needle.md',
      nameMatched: true,
      matches: []
    }

    const grouped = groupAndTruncate(result)

    expect(grouped.totalMatches).toBe(0)
    expect(grouped.displayedMatches).toEqual([])
  })
})

describe('searchFileContent (frontmatter exclusion + filename matching)', () => {
  it('does not match text that only appears inside the frontmatter block', () => {
    const content = '---\ntitle: needle in title\ntags: [x]\n---\n\nBody has nothing relevant.\n'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const result = searchFileContent('/lib/note.md', 'note.md', content, regex!)

    expect(result.matches).toEqual([])
    expect(result.nameMatched).toBe(false)
  })

  it('matches text in the body after the frontmatter block', () => {
    const content = '---\ntitle: hello\n---\n\nThe needle is in this line.\n'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const result = searchFileContent('/lib/note.md', 'note.md', content, regex!)

    expect(result.matches).toHaveLength(1)
    // Line numbers count from the body, not the original file - the
    // frontmatter is excluded entirely rather than replaced with blank
    // lines, per the ticket's "不搜 frontmatter" requirement (this only
    // promises matches are found in the body; UI line-number display
    // uses this body-relative numbering consistently).
    expect(result.matches[0].lineText).toContain('needle')
  })

  it('reports no false match when the query string appears in frontmatter but not body', () => {
    const content = '---\nkeyword: secret\n---\n\nNothing relevant here.\n'
    const { regex } = buildSearchRegex('secret', DEFAULT_SEARCH_OPTIONS)

    const result = searchFileContent('/lib/note.md', 'note.md', content, regex!)

    expect(result.matches).toEqual([])
  })

  it('sets nameMatched when the query matches the file name', () => {
    const content = 'irrelevant body text'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const result = searchFileContent('/lib/needle-notes.md', 'needle-notes.md', content, regex!)

    expect(result.nameMatched).toBe(true)
    expect(result.matches).toEqual([])
  })

  it('a document with no frontmatter searches its entire content', () => {
    const content = 'Just a plain document.\nContains needle on this line.\n'
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const result = searchFileContent('/lib/plain.md', 'plain.md', content, regex!)

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].lineNumber).toBe(2)
  })

  it('reuses the same regex instance safely across multiple files (no lastIndex leakage)', () => {
    const { regex } = buildSearchRegex('needle', DEFAULT_SEARCH_OPTIONS)

    const first = searchFileContent('/lib/a.md', 'a.md', 'a needle here', regex!)
    const second = searchFileContent('/lib/b.md', 'b.md', 'no match in this one', regex!)
    const third = searchFileContent('/lib/c.md', 'c.md', 'another needle here', regex!)

    expect(first.matches).toHaveLength(1)
    expect(second.matches).toHaveLength(0)
    expect(third.matches).toHaveLength(1)
  })
})
