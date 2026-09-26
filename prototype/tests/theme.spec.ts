import { test, expect } from './fixtures'
import { contrastRatio, hexToRgb, parseRgb, relativeLuminance } from './utils'

/**
 * 主题与可读性。
 *
 * 关键事实（探针实测）：`drawSelection()` 画的光标是 `.cm-cursor`，
 * 它用的是 CodeMirror 基础主题里写死的 `borderLeft: 1.2px solid black`，
 * 而项目切主题靠的是 `<html class="dark">`，**不是** CM 的 `&dark` 主题扩展——
 * 所以深色模式下光标仍是一根黑线，落在 #151414 的底上等于隐形（#2）。
 */

test.describe('光标可见性 @theme', () => {
  test('浅色模式下光标与背景对比度足够', async ({ open, editor, page }) => {
    await open()
    await editor.content.click()

    const { cursor, bg } = await readCursor(page)
    expect(cursor).not.toBeNull()
    expect(contrastRatio(cursor!.color, bg)).toBeGreaterThanOrEqual(3)
  })

  test('深色模式下光标仍然看得见（#2）', async ({ open, editor, page, theme }) => {
    await open()
    await theme('dark')
    await editor.content.click()

    const { cursor, bg, caretColor } = await readCursor(page)
    expect(cursor, '深色模式下没有渲染出光标').not.toBeNull()

    // 光标可以是 border 画的，也可以是原生 caret 画的——两条路都算
    const viaBorder = contrastRatio(cursor!.color, bg)
    const viaCaret = caretColor !== 'rgba(0, 0, 0, 0)' ? contrastRatio(caretColor, bg) : 0
    const best = Math.max(viaBorder, viaCaret)

    expect(
      best,
      `深色模式下光标与背景对比度只有 ${best.toFixed(2)}:1（光标 ${cursor!.color}，背景 ${bg}）——看不见`,
    ).toBeGreaterThanOrEqual(3)
  })

  test('切主题后光标立刻跟随，不需要重新聚焦', async ({ open, editor, page, theme }) => {
    await open()
    await editor.content.click()
    await theme('dark')

    const { cursor, bg } = await readCursor(page)
    expect(contrastRatio(cursor!.color, bg)).toBeGreaterThanOrEqual(3)
  })
})

test.describe('正文可读性 @theme', () => {
  test('浅色与深色下正文对比度都达到 4.5:1', async ({ open, editor, page, theme }) => {
    await open()
    await editor.placeCursor(1)

    for (const t of ['light', 'dark'] as const) {
      await theme(t)
      const { fg, bg } = await page.evaluate(() => {
        const line = document.querySelector('.cm-line') as HTMLElement
        const editorEl = document.querySelector('.cm-editor') as HTMLElement
        return {
          fg: getComputedStyle(line).color,
          bg: getComputedStyle(editorEl).backgroundColor,
        }
      })
      expect(contrastRatio(fg, bg), `${t} 模式正文对比度不足`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('标题在两种主题下都够醒目', async ({ open, editor, theme }) => {
    await open()
    await editor.placeCursor(11)

    for (const t of ['light', 'dark'] as const) {
      await theme(t)
      const { fg, bg } = await editor.content.locator('.cm-md-h1').first().evaluate((el) => {
        let node: HTMLElement | null = el.parentElement
        let bg = 'rgb(255, 255, 255)'
        while (node) {
          const c = getComputedStyle(node).backgroundColor
          if (c && c !== 'rgba(0, 0, 0, 0)') {
            bg = c
            break
          }
          node = node.parentElement
        }
        return { fg: getComputedStyle(el).color, bg }
      })
      expect(contrastRatio(fg, bg), `${t} 模式 H1 对比度不足`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('行内代码在两种主题下都读得清', async ({ open, editor, theme }) => {
    await open()
    await editor.placeCursor(1)

    for (const t of ['light', 'dark'] as const) {
      await theme(t)
      const { fg, bg } = await editor.content.locator('.cm-md-code').first().evaluate((el) => ({
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(el).backgroundColor,
      }))
      expect(contrastRatio(fg, bg), `${t} 模式行内代码对比度不足`).toBeGreaterThanOrEqual(3)
    }
  })
})

/**
 * 面的上下关系。
 *
 * 用户定的规矩：**不允许"挖洞"**。原来深色下弹窗用的是 #0D0D0D，比侧栏深
 * 10 级——打开任何一个弹窗都像在界面上挖了个洞。
 *
 * 2026-09 改版把这条规矩**从一个魔数改成了一套关系**。原来的写法是
 * 「没有比 #151414 更深的面色」，而 #151414 是当时的**内容面**——那时内容面
 * 是最深的一块，别的面色都从它往上抬。现在**框**（侧栏、标签栏、底部栏）
 * 才是地板，纸坐在它上面，弹窗再往上；**浅色和深色用的是同一个上下关系**，
 * 两个模式读起来才是同一个东西的两种光线，而不是两个产品。
 *
 * 所以这里盯的是关系本身，不是某个 hex：框 < 纸 < 浮，两个主题都要成立。
 * 以后谁再把某一层改回往深处走，这里会直接红。
 */
test.describe('面的上下关系 @theme', () => {
  /** 三层平面，从下到上 */
  const 平面 = [
    ['--surface-secondary', '框'],
    ['--surface-center', '纸'],
    ['--surface-primary', '浮'],
  ] as const

  for (const t of ['light', 'dark'] as const) {
    test(`${t}：框 < 纸 < 浮，没有哪一层往深处挖`, async ({ open, page, theme }) => {
      await open()
      await theme(t)

      const 面色 = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement)
        return Object.fromEntries(
          ['--surface-secondary', '--surface-center', '--surface-primary', '--surface-tertiary'].map(
            (n) => [n, cs.getPropertyValue(n).trim()],
          ),
        ) as Record<string, string>
      })

      const 亮度 = (name: string) => {
        const hex = 面色[name]
        expect(hex, `${name} 没读到值`).toMatch(/^#[0-9a-f]{6}$/i)
        return relativeLuminance(hexToRgb(hex))
      }

      for (let i = 1; i < 平面.length; i++) {
        const [下名, 下称] = 平面[i - 1]
        const [上名, 上称] = 平面[i]
        expect(
          亮度(上名),
          `${上称}（${面色[上名]}）不比${下称}（${面色[下名]}）亮——` +
            (上称 === '浮' ? '又变成挖洞了' : '框该退到纸后面'),
        ).toBeGreaterThan(亮度(下名))
      }

      // 嵌在纸里的面（代码块、表头、行内代码）**不能比地板还深**——
      // 它跟框同值是有意的，但绝不能变成一个洞。
      expect(
        亮度('--surface-tertiary'),
        `凹面（${面色['--surface-tertiary']}）比地板还深——嵌进去的东西不该是洞`,
      ).toBeGreaterThanOrEqual(亮度('--surface-secondary'))
    })
  }

  for (const t of ['light', 'dark'] as const) {
    test(`${t}：弹窗比正文亮一档，不再往深处挖`, async ({ open, page, theme }) => {
      await open()
      await theme(t)
      await page.getByRole('button', { name: '设置' }).click()

      const { 弹窗, 正文 } = await page.evaluate(() => {
        const dlg = document.querySelector('.fixed.inset-0 > div') as HTMLElement
        const editor = document.querySelector('.cm-editor') as HTMLElement
        return {
          弹窗: getComputedStyle(dlg).backgroundColor,
          正文: getComputedStyle(editor).backgroundColor,
        }
      })

      expect(
        relativeLuminance(parseRgb(弹窗)),
        `弹窗 ${弹窗} 不比正文 ${正文} 亮——又变成挖洞了`,
      ).toBeGreaterThan(relativeLuminance(parseRgb(正文)))

      // 差得出来才算"一档"。差 1 级等于没差，弹窗会融进背景里。
      expect(contrastRatio(弹窗, 正文), '弹窗与正文差得太少，看不出边界').toBeGreaterThanOrEqual(1.06)
    })
  }
})

/** 读当前光标（`.cm-cursor`）的颜色与它背后的底色。 */
async function readCursor(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const cur = document.querySelector('.cm-cursor') as HTMLElement | null
    const content = document.querySelector('.cm-content') as HTMLElement

    let node: HTMLElement | null = content
    let bg = 'rgb(255, 255, 255)'
    while (node) {
      const c = getComputedStyle(node).backgroundColor
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
        bg = c
        break
      }
      node = node.parentElement
    }

    return {
      cursor: cur
        ? {
            color: getComputedStyle(cur).borderLeftColor,
            width: getComputedStyle(cur).borderLeftWidth,
            display: getComputedStyle(cur).display,
          }
        : null,
      bg,
      caretColor: getComputedStyle(content).caretColor,
    }
  })
}
