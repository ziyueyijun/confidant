import { describe, expect, it } from 'vitest'
import { parseMarkdown, splitFrontmatter } from './markdown'

describe('splitFrontmatter', () => {
  it('extracts a leading YAML frontmatter block', () => {
    const source = '---\ntitle: Hello\ndate: 2026-09-28\n---\n\n# Body\n'
    const result = splitFrontmatter(source)

    expect(result.frontmatter).toBe('---\ntitle: Hello\ndate: 2026-09-28\n---')
    expect(result.body).toBe('\n\n# Body\n')
    expect(result.bodyOffset).toBe(result.frontmatter!.length)
  })

  it('returns no frontmatter when the document does not start with ---', () => {
    const source = '# Just a heading\n'
    const result = splitFrontmatter(source)

    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe(source)
    expect(result.bodyOffset).toBe(0)
  })

  it('does not treat an unterminated --- block as frontmatter', () => {
    const source = '---\ntitle: Hello\n\n# Body without closing fence\n'
    const result = splitFrontmatter(source)

    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe(source)
  })

  it('ignores a --- that is not at the very start of the file', () => {
    const source = '\n---\ntitle: Hello\n---\n'
    const result = splitFrontmatter(source)

    expect(result.frontmatter).toBeNull()
    expect(result.body).toBe(source)
  })
})

describe('parseMarkdown', () => {
  it('produces block tokens for headings, paragraphs and lists', () => {
    const tokens = parseMarkdown('# Title\n\nSome *text* here.\n\n- one\n- two\n')
    const types = tokens.map((t) => t.type)

    expect(types).toContain('heading_open')
    expect(types).toContain('paragraph_open')
    expect(types).toContain('bullet_list_open')
  })

  it('round-trips CommonMark source through markdown-it without throwing', () => {
    const source = '# Title\n\n**bold** and _em_ and `code`.\n\n> quote\n\n```js\nconst x = 1\n```\n'
    expect(() => parseMarkdown(source)).not.toThrow()
  })

  it('supports GFM tables (spec scope: CommonMark + tables + task lists)', () => {
    const withTable = parseMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(withTable.some((t) => t.type === 'table_open')).toBe(true)
  })

  it('parses task list items as list items without dropping the [ ]/[x] text', () => {
    const tokens = parseMarkdown('- [ ] todo\n- [x] done\n')
    const inlineText = tokens
      .filter((t) => t.type === 'inline')
      .map((t) => t.content)
      .join('\n')

    expect(inlineText).toContain('[ ] todo')
    expect(inlineText).toContain('[x] done')
  })
})
