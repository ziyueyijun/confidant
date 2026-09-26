import { test, expect } from './fixtures'
import { contrastRatio } from './utils'

/**
 * 行内语法：粗体 / 斜体 / 粗斜体 / 删除线 / 行内代码 / 链接 / 裸 URL / 图片。
 *
 * 行号取自 data.ts 的「语法全集」：
 *   13 粗体斜体那一行、14 链接与裸地址、58 图片
 */

const INLINE_LINE = 13
const LINK_LINE = 14
const IMAGE_LINE = 58

test.describe('行内语法 @syntax', () => {
  test('粗体 / 斜体 / 粗斜体 / 删除线 / 行内代码 都有对应装饰', async ({ open, editor }) => {
    await open()
    const cls = await editor.content.locator('.cm-line').nth(INLINE_LINE - 1).innerHTML()

    expect(cls).toContain('cm-md-bold')
    expect(cls).toContain('cm-md-italic')
    expect(cls).toContain('cm-md-strike')
    expect(cls).toContain('cm-md-code')
  })

  test('语法标记在光标不在该行时被隐藏，落在该行时显示', async ({ open, editor }) => {
    await open()

    // 光标放到别处 → 标记隐藏
    await editor.placeCursor(1)
    const hidden = await editor.lineText(INLINE_LINE)
    expect(hidden).toBe(
      '这是一段普通正文，包含**粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`，',
    )

    // 文档永远是原文——隐藏只是视觉上的
    const docLine = await editor.lineText(INLINE_LINE)
    expect(docLine).toContain('**粗体**')
  })

  test('链接：URL 部分被隐藏，文字保留，且带链接色', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(1)

    const link = editor.content.locator('.cm-md-link').first()
    await expect(link).toBeVisible()
    await expect(link).toContainText('链接')
    // `](https://example.com)` 应当被藏掉
    await expect(link).not.toContainText('example.com')
  })

  test('链接与标题不该有下划线（#7）', async ({ open, editor, theme }) => {
    await open()
    await editor.placeCursor(1)

    const link = editor.content.locator('.cm-md-link').first()
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')

    const heading = editor.content.locator('.cm-md-h1').first()
    expect(await heading.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none')
  })

  test('深色模式下链接仍可读（#4）', async ({ open, editor, theme }) => {
    await open()
    await editor.placeCursor(1)
    await theme('dark')

    const { fg, bg } = await editor.content
      .locator('.cm-md-link')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el)
        let node: HTMLElement | null = el.parentElement
        let bg = 'rgb(13, 13, 13)'
        while (node) {
          const c = getComputedStyle(node).backgroundColor
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
            bg = c
            break
          }
          node = node.parentElement
        }
        return { fg: cs.color, bg }
      })

    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  test('图片：能渲染出真正的 <img> 且能加载（#5）', async ({ open, editor, scrollTo }) => {
    await open()
    // 滚到图片那一行附近，让虚拟滚动把它渲染到 DOM
    await scrollTo(1200)

    // 用专门的图片类而不是 nth(doc-line)——后者会因为各种 widget 替换导致
    // DOM 行号偏移。这里直接找 .cm-md-image-wrap（图片 widget 的容器）。
    const wrap = editor.content.locator('.cm-md-image-wrap')
    await expect(wrap).toHaveCount(1)
    const img = wrap.locator('img.cm-md-image')
    await expect(img).toHaveCount(1)

    // 图片是**异步**加载的。`evaluate` 只读一次，读的那一刻可能还没加载完
    // （complete=false、naturalWidth=0），断言就假红——实测全套满载下大约
    // 每八次挂一次，且与代码改动无关（单跑永远过）。所以这里必须**重试到
    // 加载完成**：expect.poll 会一直轮询，真加载不出来时以超时收场，不会把
    // 真问题放过去。
    await expect
      .poll(() => img.first().evaluate((el) => (el as HTMLImageElement).naturalWidth), {
        message: '示例图始终没加载出来（naturalWidth 一直是 0）',
      })
      .toBeGreaterThan(0)
  })
})
