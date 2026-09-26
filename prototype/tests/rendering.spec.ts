import { test, expect } from './fixtures'

/**
 * 第二轮用户反馈的 6 个渲染问题。
 *
 * 每个测试对着用户描述的症状断言，**不看实现**——它们是这轮修复的回归锁。
 *
 * 共同根因之一：CodeMirror 的 `defaultHighlightStyle` 会给 Markdown 语法节点
 * 注入内层 `<span class="ͼN">`，带自己的颜色和下划线。我们的 `.cm-md-*` 类在
 * 外层，被内层覆盖——所以断言必须**连内层一起查**，只看外层会假绿。
 */

/** 把一个元素及其所有后代的某个计算样式收集起来 */
async function styleTree(
  locator: ReturnType<typeof test> extends never ? never : any,
  prop: 'textDecorationLine' | 'color',
): Promise<{ cls: string; value: string }[]> {
  return locator.evaluate(
    (el: HTMLElement, p: string) => {
      const all = [el, ...Array.from(el.querySelectorAll('*'))] as HTMLElement[]
      return all.map((e) => ({ cls: e.className || e.tagName, value: getComputedStyle(e)[p as any] }))
    },
    prop,
  )
}

/** 判断一个 rgb() 颜色是不是「橙色系」——R 明显大于 B */
function isOrange(css: string): boolean {
  const m = css.match(/\d+/g)
  if (!m) return false
  const [r, , b] = m.map(Number)
  return r - b > 60
}

/**
 * 把某个元素滚到视口**中间**再操作。
 *
 * 光用 scrollTo 固定像素值不够：滚到底部时元素会落在底部状态栏下面，
 * 鼠标事件被状态栏截走，拖拽就"选不中"了。
 */
async function centerInViewport(page: any, locator: any) {
  const box = await locator.boundingBox()
  if (!box) return
  await page.evaluate((delta) => {
    const s = document.querySelector('.cm-scroller') as HTMLElement | null
    if (s) s.scrollTop += delta
  }, box.y - 240)
  await page.waitForTimeout(200)
}

test.describe('第二轮反馈 @render', () => {
  test('H1–H6 及其内层都不带下划线（问题 1）', async ({ open, editor, theme }) => {
    await open()
    await editor.placeCursor(1)

    for (const t of ['light', 'dark'] as const) {
      await theme(t)
      for (let n = 1; n <= 6; n++) {
        const styles = await styleTree(editor.content.locator(`.cm-md-h${n}`).first(), 'textDecorationLine')
        expect(styles.length, `H${n} 没渲染出来`).toBeGreaterThan(0)
        for (const { cls, value } of styles) {
          expect(value, `${t} 模式 H${n} 的 <${cls}> 带下划线`).not.toContain('underline')
        }
      }
    }
  })

  test('深色模式下链接与裸 URL 都是橙色（问题 2）', async ({ open, editor, theme }) => {
    await open()
    await editor.placeCursor(1)
    await theme('dark')

    const links = editor.content.locator('.cm-md-link')
    await expect(links.first()).toBeVisible()

    // 链接标记、链接文字、裸 URL 都要是橙色——只要有一个不是，就是被 CM
    // 的内层高亮类盖住了
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const styles = await styleTree(links.nth(i), 'color')
      for (const { cls, value } of styles) {
        expect(isOrange(value), `深色模式链接 <${cls}> 颜色 ${value} 不是橙色`).toBe(true)
      }
    }
  })

  test('引用块不显示 > 标记，点击也不进入源码模式（问题 3）', async ({ open, editor, page, scrollTo }) => {
    await open()
    await scrollTo(280)

    // ① 非光标行的空引用行：`>` 必须不可见
    const emptyQuote = editor.content.locator('.cm-md-quote-empty').first()
    await expect(emptyQuote).toHaveCount(1)
    const emptyColor = await emptyQuote.evaluate((el) => getComputedStyle(el).color)
    expect(emptyColor, '空引用行把 > 显示出来了').toBe('rgba(0, 0, 0, 0)')

    // ② 点击引用块（光标进到引用行）后，`>` 仍然不能露出来
    const quote = editor.content.locator('.cm-md-quote').first()
    await quote.click()
    await page.waitForTimeout(150)

    const visibleMarkers = await page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-content .cm-line'))
      return lines
        .filter((l) => l.querySelector('.cm-md-quote'))
        .map((l) => ({
          text: (l.textContent ?? '').slice(0, 30),
          // 该行里可见（非透明）的 `>` 数量
          visibleGt: Array.from(l.querySelectorAll('*')).filter((e) => {
            const el = e as HTMLElement
            return el.textContent === '>' && getComputedStyle(el).color !== 'rgba(0, 0, 0, 0)'
          }).length,
        }))
    })
    for (const line of visibleMarkers) {
      expect(line.visibleGt, `引用行「${line.text}」露出了 ${line.visibleGt} 个 > 标记`).toBe(0)
    }
  })

  test('代码块文字可以拖拽选中复制（问题 4）', async ({ open, editor, page, scrollTo }) => {
    await open()
    await scrollTo(700)

    const line = editor.content.locator('.cm-codeblock-line').first()
    await expect(line).toBeVisible()
    // 挪到视口中间，别让它落在底部状态栏下面（那样鼠标事件被状态栏截走）
    await centerInViewport(page, line)

    // ① 样式上不能禁用选择
    const userSelect = await line.evaluate((el) => getComputedStyle(el).userSelect)
    expect(userSelect, '代码块禁用了文字选择').not.toBe('none')

    // ② 真的拖一遍。CM 6 用虚拟选择，所以要查 **CM 的 state**，
    //    不能只看 window.getSelection()（后者在 CM 里通常是空的）
    const box = (await line.boundingBox())!
    await page.mouse.move(box.x + 10, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()

    const result = await page.evaluate(() => {
      const view = (window as any).__cmDebug?.view
      const sel = view.state.selection.main
      const selBg = document.querySelector('.cm-selectionBackground') as HTMLElement | null
      const codeLine = document.querySelector('.cm-codeblock-line') as HTMLElement | null
      return {
        cmSelected: view.state.sliceDoc(sel.from, sel.to),
        nativeSelected: window.getSelection()?.toString() ?? '',
        selBgColor: selBg ? getComputedStyle(selBg).backgroundColor : null,
        codeLineBg: codeLine ? getComputedStyle(codeLine).backgroundColor : null,
      }
    })

    const picked = (result.cmSelected || result.nativeSelected).trim()
    expect(picked.length, `拖拽没有选中代码文字（CM 选中：${JSON.stringify(result.cmSelected)}）`).toBeGreaterThan(0)

    // ③ 选中高亮必须在代码块底色上看得出来——否则用户以为没选中（这就是
    //    用户报"不能拖拽复制"的真实原因：选中了但看不见）
    expect(result.selBgColor, '选择层没渲染').not.toBeNull()
    expect(result.selBgColor, '选择高亮是透明的').not.toBe('rgba(0, 0, 0, 0)')
    expect(
      result.selBgColor === result.codeLineBg,
      `选择色 ${result.selBgColor} 与代码块底色 ${result.codeLineBg} 相同，看不出来`,
    ).toBe(false)
  })

  test('代码块头栏与代码正文左右对齐（问题 5）', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(700)

    const bar = (await editor.content.locator('.cm-codeblock-bar').first().boundingBox())!
    const code = (await editor.content.locator('.cm-codeblock-line').first().boundingBox())!

    expect(Math.abs(bar.x - code.x), `头栏左边 ${bar.x} 与正文左边 ${code.x} 没对齐`).toBeLessThan(2)
    expect(
      Math.abs(bar.x + bar.width - (code.x + code.width)),
      `头栏右边 ${bar.x + bar.width} 与正文右边 ${code.x + code.width} 没对齐`,
    ).toBeLessThan(2)
  })

  test('列表符号与文字之间留有空隙，有序无序一致（问题 6）', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(450)

    const gaps = await editor.content.locator('.cm-md-bullet').evaluateAll((els) =>
      els.map((el) => {
        const parent = el.closest('.cm-line')!
        // bullet 之后到行尾的文字范围
        const range = document.createRange()
        range.setStartAfter(el)
        range.setEnd(parent, parent.childNodes.length)
        const textRect = range.getBoundingClientRect()
        return {
          marker: el.textContent ?? '',
          bulletRight: el.getBoundingClientRect().right,
          textLeft: textRect.left,
          gap: textRect.left - el.getBoundingClientRect().right,
        }
      }),
    )

    expect(gaps.length, '没有渲染出列表符号').toBeGreaterThan(0)
    for (const g of gaps) {
      expect(g.gap, `列表符号「${g.marker}」紧贴文字（间距 ${g.gap.toFixed(1)}px）`).toBeGreaterThan(3)
    }
  })

  test('引用块每行只占一个行高，不出现多余空白行（问题 7）', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(280)

    const info = await editor.content.locator('.cm-md-quote').evaluateAll((els) =>
      els.map((el) => {
        const lineEl = el.closest('.cm-line') as HTMLElement
        return {
          text: (el.textContent ?? '').slice(0, 14),
          lineH: lineEl.getBoundingClientRect().height,
          quoteH: el.getBoundingClientRect().height,
          // 行里有哪些 inline 占位（widgetBuffer / 空 widget）
          inlineKids: Array.from(lineEl.children)
            .filter((c) => getComputedStyle(c).display !== 'block')
            .map((c) => `${c.tagName}.${(c.className as string) || 'x'}`),
        }
      }),
    )

    expect(info.length, '没有渲染出引用块').toBeGreaterThan(1)

    for (const q of info) {
      // cm-line 不该比引用内容高出一大截——多出来的就是那条由空 widget +
      // cm-widgetBuffer 撑出的 line box，用户看到的是「引用块里多出空白行」
      const extra = q.lineH - q.quoteH
      expect(
        extra,
        `引用行「${q.text}」的 cm-line 高 ${q.lineH.toFixed(0)}px，引用内容只有 ${q.quoteH.toFixed(0)}px，多出 ${extra.toFixed(0)}px 空白（行内占位：${q.inlineKids.join(', ')}）`,
      ).toBeLessThan(8)
    }
  })

  test('引用块的竖线不溢出到块外（问题 7 续）', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(280)

    // 竖线是 `::before` 画的，它上下各延伸 1em 来跨过 cm-line 之间的缝。
    // 首行不该向上延伸（会戳进上面那段）、末行不该向下延伸（会戳进下面那段）。
    const geom = await editor.content.locator('.cm-md-quote').evaluateAll((els) =>
      els.map((el) => {
        const qr = el.getBoundingClientRect()
        const lr = (el.closest('.cm-line') as HTMLElement).getBoundingClientRect()
        const before = getComputedStyle(el, '::before')
        const topPx = Number.parseFloat(before.top) || 0
        const bottomPx = Number.parseFloat(before.bottom) || 0
        return {
          text: (el.textContent ?? '').slice(0, 12),
          lineTop: lr.top,
          lineBottom: lr.bottom,
          barTop: qr.top + topPx,
          barBottom: qr.bottom - bottomPx,
        }
      }),
    )

    expect(geom.length, '没有渲染出引用块').toBeGreaterThan(1)

    const first = geom[0]
    expect(
      first.barTop,
      `引用块首行「${first.text}」的竖线向上溢出 ${(first.lineTop - first.barTop).toFixed(1)}px`,
    ).toBeGreaterThanOrEqual(first.lineTop - 1)

    const last = geom[geom.length - 1]
    expect(
      last.barBottom,
      `引用块末行「${last.text}」的竖线向下溢出 ${(last.barBottom - last.lineBottom).toFixed(1)}px`,
    ).toBeLessThanOrEqual(last.lineBottom + 1)
  })
})

test.describe('链接 @link', () => {
  test('所见即所得下链接只显示文字，不露出方括号（问题 8）', async ({ open, editor }) => {
    await open()
    // 光标放到别处，让链接行不在"光标行"（那样会显示语法）
    await editor.placeCursor(1)

    // `[链接](https://example.com)` 应当只渲染出「链接」两个字。
    // 当前实现只藏了 `](url)` 那半截，开头的 `[` 还露着——用户看到的
    // 就是「[链接」这种不对称的样子。
    const link = editor.content.locator('.cm-md-link').first()
    await expect(link).toBeVisible()
    const text = await link.textContent()
    expect(text, '链接露出了方括号').toBe('链接')
  })

  test('Ctrl+左键点击链接会在新窗口打开它（问题 9）', async ({ open, editor, page }) => {
    await open()
    await editor.placeCursor(1)

    // 拦下 window.open——不能真去访问 example.com
    await page.evaluate(() => {
      ;(window as any).__openedUrls = []
      ;(window as any).open = (url: string) => {
        ;(window as any).__openedUrls.push(url)
        return null
      }
    })

    const link = editor.content.locator('.cm-md-link').first()
    await link.click({ modifiers: ['Control'] })
    await page.waitForTimeout(200)

    const opened: string[] = await page.evaluate(() => (window as any).__openedUrls ?? [])
    expect(opened, 'Ctrl+点击没有打开链接').toContain('https://example.com')
  })

  test('Ctrl+左键点击裸 URL 也能打开（问题 9 续）', async ({ open, editor, page }) => {
    await open()
    await editor.placeCursor(1)

    await page.evaluate(() => {
      ;(window as any).__openedUrls = []
      ;(window as any).open = (url: string) => {
        ;(window as any).__openedUrls.push(url)
        return null
      }
    })

    // 裸地址 https://example.org 也是链接
    const bare = editor.content.locator('.cm-md-link').filter({ hasText: 'example.org' }).first()
    await bare.click({ modifiers: ['Control'] })
    await page.waitForTimeout(200)

    const opened: string[] = await page.evaluate(() => (window as any).__openedUrls ?? [])
    expect(opened.some((u) => u.includes('example.org')), `Ctrl+点击裸 URL 没打开（打开的是 ${opened.join(', ')}）`).toBe(true)
  })
})

test('按住 Ctrl 时链接显示手型与下划线，提示可以点开（问题 9 可发现性）', async ({ open, editor, page }) => {
  await open()
  await editor.placeCursor(1)

  const link = editor.content.locator('.cm-md-link').first()
  await expect(link).toBeVisible()

  // 没按修饰键时：普通光标，没有下划线
  expect(await link.evaluate((el) => getComputedStyle(el).cursor), '未按 Ctrl 就显示手型').not.toBe('pointer')
  expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).not.toContain('underline')

  // 按住 Ctrl：变手型 + 下划线
  await page.keyboard.down('Control')
  await page.waitForTimeout(120)
  expect(await link.evaluate((el) => getComputedStyle(el).cursor), '按住 Ctrl 没有显示手型').toBe('pointer')
  expect(
    await link.evaluate((el) => getComputedStyle(el).textDecorationLine),
    '按住 Ctrl 没有显示下划线',
  ).toContain('underline')

  // 松开：恢复
  await page.keyboard.up('Control')
  await page.waitForTimeout(120)
  expect(await link.evaluate((el) => getComputedStyle(el).cursor), '松开 Ctrl 后手型没撤销').not.toBe('pointer')
})

test('Ctrl+左键点击图片也能打开它的地址（问题 9 续二）', async ({ open, editor, page, scrollTo }) => {
  await open()
  await scrollTo(1200)

  const wrap = editor.content.locator('.cm-md-image-wrap').first()
  await expect(wrap).toBeVisible()

  await page.evaluate(() => {
    ;(window as any).__openedUrls = []
    ;(window as any).open = (url: string) => {
      ;(window as any).__openedUrls.push(url)
      return null
    }
  })

  await wrap.click({ modifiers: ['Control'] })
  await page.waitForTimeout(200)

  const opened: string[] = await page.evaluate(() => (window as any).__openedUrls ?? [])
  expect(opened.some((u) => u.includes('示例.png')), `Ctrl+点击图片没打开（打开的是 ${JSON.stringify(opened)}）`).toBe(true)
})
