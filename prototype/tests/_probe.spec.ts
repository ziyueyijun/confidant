import { test } from './fixtures'

/** 临时探针：把真实 DOM 结构打出来，好让正式测试对着真实选择器写。 */

test('dump 文档与行 DOM', async ({ open, page }) => {
  await open()
  const dump = await page.evaluate(() => {
    const view = (window as any).__cmDebug.view
    const doc = view.state.doc
    const lines: string[] = []
    for (let n = 1; n <= doc.lines; n++) lines.push(`${n}|${doc.line(n).text}`)

    const content = document.querySelector('.cm-content') as HTMLElement
    const dom = Array.from(content.querySelectorAll('.cm-line')).map((l, i) => {
      const el = l as HTMLElement
      return `${i} cls=${el.className} | ${(el.textContent || '').slice(0, 50)}`
    })

    const quote = content.querySelector('.cm-md-quote') as HTMLElement | null
    const link = content.querySelector('.cm-md-link') as HTMLElement | null
    const img = content.querySelector('img')

    // 额外 dump：引用行 l17-21 的 HTML，看 `>` 那行是 quote 还是 widget 替换
    const linesEls = content.querySelectorAll('.cm-line')
    const refHTML: string[] = []
    for (let i = 17; i <= 22; i++) {
      const el = linesEls[i] as HTMLElement | undefined
      refHTML.push(`idx=${i}|${el ? el.outerHTML.slice(0, 200) : 'missing'}`)
    }

    // dump 引用行 cm-line 与 cm-md-quote 的 rect
    const rects: any[] = []
    for (let i = 17; i <= 22; i++) {
      const el = linesEls[i] as HTMLElement | undefined
      if (!el) continue
      const lr = el.getBoundingClientRect()
      const q = el.querySelector('.cm-md-quote') as HTMLElement | null
      const qr = q ? q.getBoundingClientRect() : null
      const cs = getComputedStyle(el)
      rects.push({
        i,
        lineTop: Math.round(lr.top),
        lineBottom: Math.round(lr.bottom),
        lineH: Math.round(lr.height),
        lineHeight: cs.lineHeight,
        height: cs.height,
        minHeight: cs.minHeight,
        padding: cs.padding,
        quoteTop: qr ? Math.round(qr.top) : null,
        quoteBottom: qr ? Math.round(qr.bottom) : null,
        quoteH: qr ? Math.round(qr.height) : null,
      })
    }

    // dump widgetBuffer + 第一个 cm-line 的样式
    const wb = content.querySelector('.cm-widgetBuffer') as HTMLElement | null
    const wbStyle = wb ? getComputedStyle(wb) : null
    const firstLine = linesEls[0] as HTMLElement | null
    const flStyle = firstLine ? getComputedStyle(firstLine) : null
    const flChildren = firstLine ? Array.from(firstLine.children).map((c) => {
      const cs = getComputedStyle(c as HTMLElement)
      return {
        tag: c.tagName,
        cls: (c as HTMLElement).className,
        display: cs.display,
        height: cs.height,
        verticalAlign: cs.verticalAlign,
      }
    }) : null

    return {
      lines,
      dom,
      quote: quote
        ? {
            html: quote.outerHTML.slice(0, 300),
            borderLeft: getComputedStyle(quote).borderLeft,
            paddingLeft: getComputedStyle(quote).paddingLeft,
          }
        : null,
      link: link
        ? {
            html: link.outerHTML.slice(0, 200),
            decoration: getComputedStyle(link).textDecorationLine,
            color: getComputedStyle(link).color,
          }
        : null,
      hasImg: !!img,
      imgHtml: img ? img.outerHTML.slice(0, 200) : null,
      refHTML,
      rects,
      wbStyle: wbStyle ? {
        display: wbStyle.display,
        height: wbStyle.height,
        width: wbStyle.width,
        verticalAlign: wbStyle.verticalAlign,
      } : null,
      flStyle: flStyle ? {
        lineHeight: flStyle.lineHeight,
        minHeight: flStyle.minHeight,
        height: flStyle.height,
        display: flStyle.display,
        padding: flStyle.padding,
        margin: flStyle.margin,
      } : null,
      flChildren,
    }
  })
  console.log('=== DOC ===\n' + dump.lines.join('\n'))
  console.log('=== DOM ===\n' + dump.dom.join('\n'))
  console.log('=== QUOTE ===\n' + JSON.stringify(dump.quote, null, 1))
  console.log('=== LINK ===\n' + JSON.stringify(dump.link, null, 1))
  console.log('=== IMG ===\n' + JSON.stringify({ hasImg: dump.hasImg, imgHtml: dump.imgHtml }, null, 1))
  console.log('=== REF HTML ===\n' + dump.refHTML.join('\n'))
  console.log('=== RECTS ===\n' + JSON.stringify(dump.rects, null, 1))
  console.log('=== WB STYLE ===\n' + JSON.stringify(dump.wbStyle, null, 1))
  console.log('=== FIRST LINE STYLE ===\n' + JSON.stringify(dump.flStyle, null, 1))
  console.log('=== FIRST LINE CHILDREN ===\n' + JSON.stringify(dump.flChildren, null, 1))
})

test('dump 深色光标', async ({ open, page, theme }) => {
  await open()
  await theme('dark')
  await page.locator('.cm-content').click()
  const info = await page.evaluate(() => {
    const cur = document.querySelector('.cm-cursor') as HTMLElement | null
    const content = document.querySelector('.cm-content') as HTMLElement
    const cs = cur ? getComputedStyle(cur) : null
    return {
      htmlClass: document.documentElement.className,
      contentCaretColor: getComputedStyle(content).caretColor,
      cursor: cs
        ? {
            borderLeftColor: cs.borderLeftColor,
            borderLeftWidth: cs.borderLeftWidth,
            display: cs.display,
            height: cs.height,
          }
        : null,
      bg: getComputedStyle(document.querySelector('.cm-editor') as HTMLElement).backgroundColor,
    }
  })
  console.log('=== DARK CURSOR ===\n' + JSON.stringify(info, null, 1))
})

test('dump 代码块向上方向键', async ({ open, editor, page }) => {
  await open()
  await editor.placeCursor(38, 0)
  const trail: number[] = []
  for (let i = 0; i < 16; i++) {
    trail.push(await editor.cursorLine())
    await page.keyboard.press('ArrowUp')
  }
  console.log('=== ARROW UP FROM CODE BLOCK (line 38) ===\n' + trail.join(' -> '))
})
