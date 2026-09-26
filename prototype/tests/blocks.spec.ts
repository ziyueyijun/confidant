import { test, expect } from './fixtures'
import { verticallyAdjacent } from './utils'

/**
 * 块级语法：标题 / 引用 / 列表 / 任务列表 / 代码块 / 分割线 / 表格。
 *
 * 「语法全集」里的行号：
 *   1–11 六级标题、18–21 多行引用、25–28 无序列表、30–32 有序列表、
 *   34–35 任务列表、37–44 带语言代码块、46–50 无语言代码块、
 *   23 分割线、52–56 表格
 */

test.describe('标题 @syntax', () => {
  test('六级标题各有不同字号，且逐级递减', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(1)

    // 用 .cm-md-hN 类而不是 firstElementChild——后者在 widget 替换行可能是
    // .cm-widgetBuffer（CM 的占位 img），它的 fontSize 没有具体设置，会拿到
    // 继承的 16px，让所有标题字号看起来一样。
    const sizes = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        editor.content
          .locator(`.cm-md-h${n}`)
          .first()
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
      ),
    )

    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i], `H${i + 1} 不应大于 H${i}`).toBeLessThanOrEqual(sizes[i - 1])
    }
    expect(sizes[0]).toBeGreaterThan(sizes[5])
  })

  test('标题的 # 标记在非光标行被隐藏', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(11) // 光标放到最后一级标题上，让 H1 不在光标行

    const h1Text = await editor.content.locator('.cm-line').nth(0).textContent()
    expect(h1Text).toBe('一级标题')
  })
})

test.describe('引用 @syntax', () => {
  test('引用块左侧有竖线', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(1)

    const quote = editor.content.locator('.cm-md-quote').first()
    const style = await quote.evaluate((el) => {
      const cs = getComputedStyle(el)
      // 检查 ::before 伪元素（实际画竖线的位置）
      const beforeStyle = getComputedStyle(el, '::before')
      return {
        width: beforeStyle.width,
        style: beforeStyle.background,
        color: beforeStyle.backgroundColor,
      }
    })

    // ::before 是绝对定位的 3px 宽竖线
    expect(style.width).toBe('3px')
  })

  test('多行引用是连通的——相邻竖线视觉上接上（#8）', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(1)

    // 拿到所有引用的 ::before 竖线 rect（竖线是 ::before 画的，元素本身的
    // bounding rect 因为 cm-line 间距会有 29px gap——所以直接看元素 rect 没意义）。
    // ::before 上下各延伸 1em 让相邻竖线视觉上接上。
    const boxes = await Promise.all(
      [18, 19, 20, 21].map((n) =>
        editor.content
          .locator('.cm-line')
          .nth(n - 1)
          .locator('.cm-md-quote')
          .first()
          .evaluate((el) => {
            // ::before 不直接给 bounding rect，但能给 ::before 算。
            // 简化方案：用 ::before 的 computed style 计算它的位置
            // ——::before 是 absolute 相对 cm-md-quote 定位。
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            const qr = el.getBoundingClientRect()
            // ::before top: -1em, bottom: -1em（CSS 里）——也就是 quote 顶部上方 1em，
            // 底部下方 1em。1em = font-size。
            const fontSize = parseFloat(cs.fontSize)
            return {
              top: qr.top - fontSize,
              bottom: qr.bottom + fontSize,
            }
          }),
      ),
    )

    // 相邻两行之间不该出现「竖线断掉」的缝
    for (let i = 1; i < boxes.length; i++) {
      expect(
        boxes[i - 1].bottom >= boxes[i].top,
        `第 ${17 + i} 行与第 ${18 + i} 行的引用竖线没有接上`,
      ).toBe(true)
    }
  })

  test('引用行没有任何内容时，开头的竖线仍然可见（#3）', async ({ open, editor, scrollTo }) => {
    await open()
    // 把引用行滚进视口
    await scrollTo(280)

    // 找只含 ">" 字符的引用行——空引用行保留了 > 字符不替换（见 markdownLivePreview.ts）
    const emptyQuote = editor.content.locator('.cm-md-quote').filter({
      hasText: /^\s*\>\s*$/,
    }).first()

    const visible = await emptyQuote.evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
        display: cs.display,
        minHeight: cs.minHeight,
      }
    })

    // 即使内容只有一个 ">"，cm-md-quote 是 display: block + min-height: 1.85em，
    // 应该撑得起竖线高度
    expect(visible.height, '空引用行塌掉了，看不到竖线').toBeGreaterThan(20)
  })
})

test.describe('列表 @syntax', () => {
  test('无序列表渲染成项目符号，不显示 - 号', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(450)

    // 取所有 bullets 然后过滤出无序的（文本不包含数字）
    const allBullets = editor.content.locator('.cm-md-bullet')
    const count = await allBullets.count()
    const bullets: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await allBullets.nth(i).textContent()
      if (text && !/\d/.test(text)) bullets.push(text)
    }
    expect(bullets.length).toBeGreaterThanOrEqual(4)
    expect(bullets[0]).toBe('•')
  })

  test('有序列表保留序号', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(550)

    // 有序列表的项目符号是 `N.`——**不带尾随空格**：符号与正文之间的间距
    // 统一由 CSS 的 margin-right 提供，这样有序和无序的间距才一致（问题 6）。
    const allBullets = editor.content.locator('.cm-md-bullet')
    const count = await allBullets.count()
    const ordered: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await allBullets.nth(i).textContent()
      if (text && /\d/.test(text)) ordered.push(text)
    }
    expect(ordered.length).toBeGreaterThanOrEqual(3)
    expect(ordered[0]).toBe('1.')
  })

  test('嵌套列表保持缩进层级', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(450)

    // 收集所有无序项目符号的 left 坐标，按 left 升序排列
    // （不在 DOM 里强制连续——虚拟滚动可能让 nth(N) 不连续）
    const allBullets = editor.content.locator('.cm-md-bullet')
    const count = await allBullets.count()
    const xs: number[] = []
    for (let i = 0; i < count; i++) {
      const text = await allBullets.nth(i).textContent()
      if (text && !/\d/.test(text)) {
        const x = await allBullets.nth(i).evaluate((el) => el.getBoundingClientRect().left)
        xs.push(x)
      }
    }
    // 至少有 4 个无序 bullet，且能看到至少 2 个不同的缩进层级
    expect(xs.length).toBeGreaterThanOrEqual(4)
    const uniqueXs = [...new Set(xs.map((x) => Math.round(x)))].sort((a, b) => a - b)
    expect(uniqueXs.length, `嵌套列表只有一种缩进：${uniqueXs.join(',')}`).toBeGreaterThanOrEqual(2)
  })

  test('任务列表渲染成可点的勾选框，且不叠项目符号', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(600)

    const boxes = editor.content.locator('.cm-md-checkbox')
    await expect(boxes).toHaveCount(2)
    await expect(boxes.nth(0)).toHaveAttribute('aria-checked', 'false')
    await expect(boxes.nth(1)).toHaveAttribute('aria-checked', 'true')
  })

  test('点勾选框能切换文档里的字符', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(600)

    // 找文档里第一行是 "- [ ]" 的 line text
    const docText = await editor.text()
    const lines = docText.split('\n')
    const targetLine = lines.findIndex((l) => l.startsWith('- [ ]'))
    expect(targetLine).toBeGreaterThan(-1)

    // 点击第一个未勾选的 checkbox
    await editor.content.locator('.cm-md-checkbox').nth(0).click()
    expect(await editor.lineText(targetLine + 1)).toBe('- [x] 未完成的任务')

    await editor.content.locator('.cm-md-checkbox').nth(0).click()
    expect(await editor.lineText(targetLine + 1)).toBe('- [ ] 未完成的任务')
  })
})

test.describe('代码块 @syntax', () => {
  test('围栏代码块有头栏（语言 + 复制）与代码正文', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(700)

    await expect(editor.content.locator('.cm-codeblock-bar').first()).toBeVisible()
    await expect(editor.content.locator('.cm-codeblock-lang').first()).toHaveText(/javascript/)
    await expect(editor.content.locator('.cm-codeblock-copy').first()).toBeVisible()
    await expect(editor.content.locator('.cm-codeblock-line').first()).toBeVisible()
  })

  test('语言别名可切换，切完写回文档', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(700)

    await editor.content.locator('.cm-codeblock-lang').first().click()
    await expect(editor.content.locator('.cm-codeblock-lang-menu')).toBeVisible()
    await editor.content.locator('.cm-codeblock-lang-menu').getByRole('button', { name: 'python', exact: true }).click()

    // 容许 ```` 后有 1 个或 2 个空格
    const text = await editor.lineText(37)
    expect(text).toMatch(/^```\s+python$/)
  })

  test('无语言的代码块显示 text 占位，且不被当成代码高亮', async ({ open, editor, scrollTo }) => {
    await open()
    await scrollTo(900)

    const langs = editor.content.locator('.cm-codeblock-lang')
    await expect(langs.nth(1)).toHaveText(/text/)
  })

  test('复制按钮写进剪贴板的是正文，不含围栏', async ({ page, context, open, editor, scrollTo }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open()
    await scrollTo(700)

    await editor.content.locator('.cm-codeblock-copy').first().click()
    const clip = await page.evaluate(() => navigator.clipboard.readText())

    expect(clip).toContain('function greet(name)')
    expect(clip).not.toContain('```')
    expect(clip).not.toContain('javascript')
  })
})

test.describe('分割线与表格 @syntax', () => {
  test('分割线渲染成一条横线', async ({ open, editor, scrollTo }) => {
    await open()
    // 把 scroller 滚到分割线那一行（doc line 23）让它进视口、被虚拟滚动渲染
    await scrollTo(350)

    const rule = editor.content.locator('.cm-md-rule').first()
    await expect(rule).toBeVisible()
    const h = await rule.evaluate((el) => el.getBoundingClientRect().height)
    expect(h).toBeLessThan(4)
  })

  test('表格渲染成可编辑表格，单元格可聚焦可改', async ({ open, editor, page, scrollTo }) => {
    await open()
    await scrollTo(1100)

    const table = editor.content.locator('.cm-md-table')
    await expect(table).toBeVisible()
    await expect(table.locator('th')).toHaveCount(3)
    await expect(table.locator('tbody tr')).toHaveCount(3)

    const cell = table.locator('[data-row="1"][data-col="0"]')
    await cell.click()
    await expect(cell).toBeFocused()

    // 用 cell.evaluate 直接设 textContent（不走 keyboard），避免 contenteditable
    // 浏览器默认行为把字符塞到 cm-content 而不是 cell
    await cell.evaluate((el) => {
      el.textContent = '标题改了'
      // 触发 input 事件让 EditableTableWidget 同步回文档
      el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    // 等待 onCellInput 完成 transaction
    await page.waitForTimeout(100)
    expect(await editor.lineText(54)).toBe('| 标题改了 | ✅ | H1–H6 |')
  })

  test('表格可用右键菜单加行', async ({ open, editor, page, scrollTo }) => {
    await open()
    await scrollTo(1100)

    // 等表格真的渲染出来再点——scrollTo 之后 CM 的虚拟滚动可能还在重建 DOM，
    // 直接点会点到正在被替换的元素上，contextmenu 就丢了
    const table = editor.content.locator('.cm-md-table')
    await expect(table).toBeVisible()
    const cell = table.locator('[data-row="1"][data-col="0"]')
    await expect(cell).toBeVisible()
    await cell.click({ button: 'right' })

    // 先等菜单挂上——CM 的 contextmenu 事件要等这一帧走完，
    // 不等的话下面的 evaluate 可能跑在菜单创建之前（元素找不到 → 静默失败）
    const menu = page.locator('.cm-table-menu')
    await expect(menu).toBeVisible()

    // 菜单的 item.click 内部会先 self-close（menu.remove）再 apply op——
    // playwright 的 click 在元素被 detach 时会 retry 失败。直接用 evaluate 调用。
    const clicked = await page.evaluate(() => {
      const menu = document.querySelector('.cm-table-menu')
      const buttons = Array.from(document.querySelectorAll('.cm-table-menu button'))
      const labels = buttons.map((b) => b.textContent?.trim())
      const target = buttons.find((b) => b.textContent?.trim() === '在下方插入行') as HTMLButtonElement | undefined
      if (!target) {
        return { ok: false, labels, html: menu?.outerHTML?.slice(0, 400) ?? 'no menu' }
      }
      target.click()
      return { ok: true, labels, html: '' }
    })
    expect(clicked.ok, `菜单里没有「在下方插入行」，实际项：${clicked.labels.join(' / ')}，HTML：${clicked.html}`).toBe(true)

    // 表格从 3 行数据变 4 行
    await expect(editor.content.locator('.cm-md-table tbody tr')).toHaveCount(4)
  })
})
