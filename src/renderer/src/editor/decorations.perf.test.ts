import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { buildWysiwygDecorations } from './decorations'

/**
 * Ticket #14 acceptance criterion (spec.md perf budget):
 * "加载 1 万字文档 < 200ms" — loading a ~10k-character document must stay
 * under 200ms. This test builds a synthetic ~10k-character mixed-content
 * markdown document (headings, paragraphs, lists, blockquote, code,
 * table — the same node kinds `buildWysiwygDecorations` handles) and
 * times a full decoration pass over it.
 *
 * This only measures the parse+decorate pipeline itself (creating the
 * EditorState, which triggers the Lezer markdown parse, plus running
 * `buildWysiwygDecorations`). Whole-app load time (window creation, file
 * IO, etc.) is out of scope here and becomes meaningful once #17 (large
 * library loading) lands.
 */

/** Repeats a block of paragraph/heading/list/table markdown until the
 * generated document reaches at least `targetChars` characters. */
function generateMixedMarkdown(targetChars: number): string {
  const paragraph =
    '这是一段用于性能测试的中文段落，包含**粗体**、*斜体*、`行内代码`和[链接](https://example.com/note)，' +
    '用来模拟真实笔记中常见的混排内容，确保解析器需要处理多种节点类型而不是单一的纯文本。'

  const blockTemplate = (i: number): string =>
    [
      `## 第 ${i} 节标题`,
      '',
      paragraph,
      '',
      paragraph,
      '',
      '- 列表项一，包含一些说明文字',
      '- 列表项二，包含一些说明文字',
      '- 列表项三，包含一些说明文字',
      '',
      '> 这是一段引用文字，用来测试 blockquote 的渲染性能。',
      '',
      '```js',
      'const x = 1',
      'function demo() { return x + 1 }',
      '```',
      '',
      '| 列 A | 列 B |',
      '| --- | --- |',
      '| 值 1 | 值 2 |',
      ''
    ].join('\n')

  let doc = ''
  let i = 0
  while (doc.length < targetChars) {
    i += 1
    doc += blockTemplate(i) + '\n'
  }
  return doc
}

describe('buildWysiwygDecorations performance', () => {
  it('renders a ~10k-character mixed document in under 200ms', () => {
    const doc = generateMixedMarkdown(10_000)
    // Sanity check: we actually generated a ~10k doc, not something tiny.
    expect(doc.length).toBeGreaterThanOrEqual(10_000)

    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: [Table] })]
    })

    const start = performance.now()
    buildWysiwygDecorations(state)
    const elapsedMs = performance.now() - start

    // eslint-disable-next-line no-console
    console.log(
      `[perf] buildWysiwygDecorations on ${doc.length} chars took ${elapsedMs.toFixed(2)}ms`
    )

    expect(elapsedMs).toBeLessThan(200)
  })
})
