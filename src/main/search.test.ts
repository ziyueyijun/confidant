import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runLibrarySearch } from './search'
import { DEFAULT_SEARCH_OPTIONS, type GroupedFileResult, type SearchOptions } from '../shared/search'

describe('runLibrarySearch', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-search-test-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  async function collect(
    query: string,
    options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
    signal: AbortSignal = new AbortController().signal
  ): Promise<{ results: GroupedFileResult[]; error: Awaited<ReturnType<typeof runLibrarySearch>>['error'] }> {
    const results: GroupedFileResult[] = []
    const { error } = await runLibrarySearch(dir, { text: query, options }, signal, (r) =>
      results.push(r)
    )
    return { results, error }
  }

  it('returns no results for an empty library', async () => {
    const { results, error } = await collect('needle')
    expect(results).toEqual([])
    expect(error).toBeNull()
  })

  it('finds a match in a single file', async () => {
    await fs.writeFile(join(dir, 'note.md'), '# Title\n\nThis line has a needle in it.\n', 'utf-8')

    const { results } = await collect('needle')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('note.md')
    expect(results[0].totalMatches).toBe(1)
    expect(results[0].displayedMatches[0].lineText).toContain('needle')
  })

  it('excludes frontmatter from the search (acceptance criterion #2)', async () => {
    await fs.writeFile(
      join(dir, 'note.md'),
      '---\ntitle: needle in frontmatter\n---\n\nNo relevant text in the body.\n',
      'utf-8'
    )

    const { results } = await collect('needle')

    expect(results).toEqual([])
  })

  it('reports a filename match even with no body hits', async () => {
    await fs.writeFile(join(dir, 'needle-notes.md'), 'irrelevant content', 'utf-8')

    const { results } = await collect('needle')

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('needle-notes.md')
    expect(results[0].totalMatches).toBe(0)
  })

  it('recurses into subdirectories', async () => {
    await fs.mkdir(join(dir, 'sub'))
    await fs.writeFile(join(dir, 'sub', 'deep.md'), 'contains needle here', 'utf-8')

    const { results } = await collect('needle')

    expect(results).toHaveLength(1)
    expect(results[0].path).toBe(join(dir, 'sub', 'deep.md'))
  })

  it('skips non-markdown files and hidden files/folders', async () => {
    await fs.writeFile(join(dir, 'note.txt'), 'contains needle', 'utf-8')
    await fs.writeFile(join(dir, '.hidden.md'), 'contains needle', 'utf-8')
    await fs.mkdir(join(dir, '.git'))
    await fs.writeFile(join(dir, '.git', 'config.md'), 'contains needle', 'utf-8')
    await fs.writeFile(join(dir, 'real.md'), 'contains needle', 'utf-8')

    const { results } = await collect('needle')

    expect(results.map((r) => r.name)).toEqual(['real.md'])
  })

  it('does not report files with zero hits', async () => {
    await fs.writeFile(join(dir, 'a.md'), 'no match here', 'utf-8')
    await fs.writeFile(join(dir, 'b.md'), 'has a needle', 'utf-8')

    const { results } = await collect('needle')

    expect(results.map((r) => r.name)).toEqual(['b.md'])
  })

  it('streams a batch per matching file via the callback, not one final array', async () => {
    await fs.writeFile(join(dir, 'a.md'), 'needle one', 'utf-8')
    await fs.writeFile(join(dir, 'b.md'), 'needle two', 'utf-8')

    const seenAtCallTime: number[] = []
    const signal = new AbortController().signal
    await runLibrarySearch(dir, { text: 'needle', options: DEFAULT_SEARCH_OPTIONS }, signal, () => {
      seenAtCallTime.push(seenAtCallTime.length + 1) // one call per matching file
    })

    expect(seenAtCallTime).toEqual([1, 2])
  })

  it('respects caseSensitive/wholeWord/useRegex options end to end', async () => {
    await fs.writeFile(join(dir, 'note.md'), 'Cat and Category are different words.', 'utf-8')

    const caseSensitive = await collect('cat', { ...DEFAULT_SEARCH_OPTIONS, caseSensitive: true })
    expect(caseSensitive.results).toEqual([]) // "Cat" has capital C, query is lowercase

    const wholeWord = await collect('Cat', { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true })
    expect(wholeWord.results).toHaveLength(1)
    expect(wholeWord.results[0].totalMatches).toBe(1) // matches "Cat" only, not "Category"

    const regexMode = await collect('Cat.*ory', { ...DEFAULT_SEARCH_OPTIONS, useRegex: true })
    expect(regexMode.results).toHaveLength(1)
  })

  it('returns an invalid-regex error instead of throwing for a bad pattern', async () => {
    await fs.writeFile(join(dir, 'note.md'), 'some text', 'utf-8')

    const { results, error } = await collect('a(b', { ...DEFAULT_SEARCH_OPTIONS, useRegex: true })

    expect(results).toEqual([])
    expect(error).not.toBeNull()
    expect(error?.type).toBe('invalid-regex')
  })

  it('matches Chinese substrings without word segmentation', async () => {
    await fs.writeFile(join(dir, 'note.md'), '这是一篇关于中文全文搜索的笔记。\n', 'utf-8')

    const { results } = await collect('中文全文搜索')

    expect(results).toHaveLength(1)
  })

  it('stops scanning once the signal is aborted (cancellation)', async () => {
    for (let i = 0; i < 20; i++) {
      await fs.writeFile(join(dir, `file-${i}.md`), 'contains needle', 'utf-8')
    }

    const controller = new AbortController()
    let callCount = 0
    const resultPromise = runLibrarySearch(
      dir,
      { text: 'needle', options: DEFAULT_SEARCH_OPTIONS },
      controller.signal,
      () => {
        callCount += 1
        if (callCount === 3) controller.abort()
      }
    )

    await resultPromise

    // Aborted after the 3rd match; the walk must not have processed all 20.
    expect(callCount).toBeLessThan(20)
    expect(callCount).toBeGreaterThanOrEqual(3)
  })

  it('an already-aborted signal produces zero results', async () => {
    await fs.writeFile(join(dir, 'note.md'), 'contains needle', 'utf-8')

    const controller = new AbortController()
    controller.abort()

    const results: GroupedFileResult[] = []
    await runLibrarySearch(
      dir,
      { text: 'needle', options: DEFAULT_SEARCH_OPTIONS },
      controller.signal,
      (r) => results.push(r)
    )

    expect(results).toEqual([])
  })

  it('treats an empty query as no-op (no results, no error)', async () => {
    await fs.writeFile(join(dir, 'note.md'), 'contains needle', 'utf-8')

    const { results, error } = await collect('')

    expect(results).toEqual([])
    expect(error).toBeNull()
  })
})

describe('runLibrarySearch performance (acceptance criterion #7: 1000 files < 2s)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'confidant-search-perf-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('searches 1000 markdown files in under 2 seconds', async () => {
    const fileCount = 1000
    const paragraph =
      '这是一段用于性能测试的中文段落，包含一些随机内容，模拟真实笔记库中的一篇普通文档，' +
      'This paragraph also has some English text mixed in for realism.'

    const writes: Promise<void>[] = []
    for (let i = 0; i < fileCount; i++) {
      const content = Array.from({ length: 20 }, (_, j) => `${paragraph} (line ${j})`).join('\n')
      // Every 100th file actually contains the needle, so the search does
      // real matching work rather than just failing fast on every file.
      const withNeedle = i % 100 === 0 ? content + '\nThis file has the needle keyword.\n' : content
      writes.push(fs.writeFile(join(dir, `note-${i}.md`), withNeedle, 'utf-8'))
    }
    await Promise.all(writes)

    const results: GroupedFileResult[] = []
    const controller = new AbortController()

    const start = performance.now()
    await runLibrarySearch(
      dir,
      { text: 'needle', options: DEFAULT_SEARCH_OPTIONS },
      controller.signal,
      (r) => results.push(r)
    )
    const elapsedMs = performance.now() - start

    // eslint-disable-next-line no-console
    console.log(`[perf] runLibrarySearch over ${fileCount} files took ${elapsedMs.toFixed(2)}ms`)

    expect(results).toHaveLength(10) // one hit every 100 files
    expect(elapsedMs).toBeLessThan(2000)
  }, 10_000)
})
