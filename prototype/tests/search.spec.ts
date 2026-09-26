import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * 全局搜索。
 *
 * 这一组盯的是**交互**，不是索引的性能——真机上走 FTS5 逐字索引 + refine
 * （spec §5），原型里是内存里的子串匹配。所以这里断言的每一条都是 spec 里
 * 写下的行为约定：
 *
 * - 边打边搜（§5.5），不需要按回车
 * - 排序：标题命中 > 正文命中（§5.5）
 * - 高亮在**原文**上算（§5.2）
 * - 操作符：`title:` / `path:` / `-path:`（§5.5）
 * - **认不出的操作符按字面搜索，不报错**（§5.5）
 * - 不做模糊匹配（§5.6）
 *
 * **界面上有三个搜索，各搜各的**：文件树那条工具条的「搜索全部笔记」（就是
 * 这一组，打开浮层面板，搜整个工作空间）、大纲那条工具条的「搜索标题」
 * （就地筛大纲，见最后一节）、编辑器工具栏的「搜索」（在本文中查找，
 * 见 `find.spec.ts`）。
 */

const 输入框 = (page: Page) => page.getByPlaceholder('搜索当前工作空间的全部笔记')
/** 结果行。`data-search-row` 是组件里留的稳定钩子 */
const 结果行 = (page: Page) => page.locator('[data-search-row]')

async function 打开搜索(page: Page) {
  await page.getByRole('button', { name: '搜索全部笔记' }).click()
  await expect(输入框(page)).toBeVisible()
}

/** 打字。边打边搜，所以打完等一下防抖（100ms）再过一拍渲染 */
async function 搜(page: Page, q: string) {
  await 输入框(page).fill(q)
  await page.waitForTimeout(200)
}

/** 每条结果的标题（行里的第一个 span）。**逐行取**——`locator('span').first()`
    取的是"所有行里的第一个 span"，只会得到一条。 */
const 标题们 = (page: Page) =>
  page
    .locator('[data-search-row]')
    .evaluateAll((rows) => rows.map((r) => r.querySelector('span')?.textContent ?? ''))

/** 每条结果的完整文字（用来找徽章） */
const 各行文字 = (page: Page) => 结果行(page).allTextContents()

test.describe('入口 @search', () => {
  test('文件树工具条的「搜索全部笔记」按钮打开面板，输入框自动就位', async ({ open, page }) => {
    await open()
    await 打开搜索(page)

    // 自动聚焦：打开就能打字，不用再点一下输入框
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused, '打开搜索后面板没有拿到焦点').toBe('INPUT')
  })

  test('Ctrl+K 也能唤出来，而且在编辑器里打字时也管用', async ({ open, page, editor }) => {
    await open()
    // 焦点在正文里——这时候按快捷键，最容易被"输入框里不拦截"的规则漏掉
    await editor.content.click()
    await page.keyboard.press('Control+k')

    await expect(输入框(page), 'Ctrl+K 没唤出搜索').toBeVisible()
  })

  test('Esc 关掉', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await page.keyboard.press('Escape')
    await expect(输入框(page)).toHaveCount(0)
  })

  test('空查询时把操作符摆出来——藏起来的语法等于没有', async ({ open, page }) => {
    await open()
    await 打开搜索(page)

    const text = await page.locator('.fixed.inset-0').textContent()
    for (const op of ['title:', 'path:', '-path:']) {
      expect(text, `空态里没提 ${op}`).toContain(op)
    }
  })
})

test.describe('搜到什么 @search', () => {
  test('边打边搜：不用按回车就出结果', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, '逐字索引')

    expect(await 结果行(page).count(), '打了字却没出结果').toBeGreaterThan(0)
  })

  test('标题命中排在正文命中前面', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    // 「索引」：两篇标题里有（为什么是逐字索引、索引体积实测），
    // 「架构草案」只是正文提到（主进程管文件与索引）
    await 搜(page, '索引')

    const 行 = await 各行文字(page)
    const 标题命中数 = 行.filter((t) => t.includes('标题命中')).length
    expect(标题命中数, '该有两篇是标题命中').toBe(2)

    // 标题命中的两行都在最前面
    for (let i = 0; i < 标题命中数; i++) {
      expect(行[i], `第 ${i + 1} 行不是标题命中`).toContain('标题命中')
    }
    // 正文命中的那篇排在后面
    const 正文那条 = 行.findIndex((t) => t.includes('架构草案'))
    expect(正文那条, '正文命中的那篇没出现').toBeGreaterThanOrEqual(标题命中数)
    expect(行[正文那条], '正文命中却挂了标题的徽章').not.toContain('标题命中')
  })

  test('命中处在原文里高亮，不是把整行涂上', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, '逐字索引')

    const marks = await 结果行(page).first().locator('mark').allTextContents()
    expect(marks.length, '一条高亮都没有').toBeGreaterThan(0)
    for (const m of marks) expect(m).toBe('逐字索引')
  })

  test('一篇笔记只出一行——列表是拿来找「哪一篇」的', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    // 「索引」在「为什么是逐字索引」正文里出现很多次
    await 搜(page, '索引')

    const paths = await 结果行(page).locator('span').last().allTextContents()
    expect(new Set(paths).size, '同一篇笔记出现了不止一行').toBe(paths.length)
  })

  test('搜不到时说清楚，并且明说不做模糊匹配', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, '这几个字哪儿都没有')

    expect(await 结果行(page).count()).toBe(0)
    await expect(page.getByText('没有找到「这几个字哪儿都没有」')).toBeVisible()
    await expect(page.getByText(/不做模糊匹配/)).toBeVisible()
  })
})

test.describe('操作符 @search', () => {
  test('title: 只搜标题', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, 'title:架构')

    expect(await 标题们(page)).toEqual(['架构草案'])
  })

  test('path: 限定路径——只给路径不给词，就是「列出这一路径下的全部笔记」', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, 'path:待整理')

    const 标题 = await 标题们(page)
    // 用集合比：顺序由路径决定，这里要验的是"就这两篇"
    expect(new Set(标题), 'path:待整理 下不是这两篇').toEqual(new Set(['正则备忘', '工具箱']))
    // 这不是标题命中，不该挂那个徽章
    expect(await 结果行(page).first().textContent()).not.toContain('标题命中')
  })

  test('-path: 排除路径', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, '索引 -path:技术')

    const 标题 = await 标题们(page)
    expect(标题, '被排除的那几篇还在').not.toContain('为什么是逐字索引')
    expect(标题, '被排除的那几篇还在').not.toContain('索引体积实测')
    expect(标题).toContain('架构草案')
  })

  test('空格 = 两个词都要有', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    // 「工具箱」与「架构」分别只在两篇里，没有一篇同时提到
    await 搜(page, '工具箱 架构')

    expect(await 结果行(page).count(), '两个词并不在同一篇里，不该有结果').toBe(0)
  })
})

/**
 * 这一条用组件自己的模块来测，不走界面。
 *
 * 「认不出的操作符按字面搜」是一条**行为约定**（spec §5.5），要验的是
 * 「`tag:读书` 被当成那几个字符」，而这需要一篇**正文里真的写着 `tag:读书`**
 * 的笔记才看得出区别——原型的数据里没有，也不该为了测试硬塞一篇。
 */
test('认不出的操作符按字面搜索，不报错', async ({ page }) => {
  await page.goto('/?reveal=never')

  const got = await page.evaluate(async () => {
    const { search } = await import('/src/search/query.ts')
    const notes = [
      { path: 'a.md', title: '读书笔记', body: '今天写了 tag:读书 这个写法，还有 -title:读书 这个怪东西' },
      { path: 'b.md', title: '别的', body: '无关内容' },
    ]
    return {
      tag: search(notes, 'tag:读书').map((h: { path: string }) => h.path),
      // 若被当成"排除标题命中"的操作符，结果会是 b.md；按字面搜则一个字都匹配不上
      负title: search(notes, '-title:读书').map((h: { path: string }) => h.path),
      真排除: search(notes, '无关 -path:a').map((h: { path: string }) => h.path),
    }
  })

  expect(got.tag, 'tag: 不是操作符，该按字面搜到那一篇').toEqual(['a.md'])
  // 若被当成"排除标题命中"的操作符，a.md 会被排掉、只剩 b.md；
  // 按字面搜则刚好相反：只有 a.md 的正文里真的写着这几个字符
  expect(got.负title, '-title: 不是操作符，该按字面搜').toEqual(['a.md'])
  expect(got.真排除, '-path: 是真操作符，该把 a.md 排掉').toEqual(['b.md'])
})

test.describe('选中与跳转 @search', () => {
  test('上下键换选中，第一条默认选中', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, '索引')

    const 选中 = page.locator('[data-search-row][data-active="true"]')
    await expect(选中).toHaveCount(1)
    const 第一 = await 选中.textContent()

    await page.keyboard.press('ArrowDown')
    await expect(选中).toHaveCount(1)
    expect(await 选中.textContent(), '按了 ↓ 选中没动').not.toBe(第一)

    await page.keyboard.press('ArrowUp')
    expect(await 选中.textContent()).toBe(第一)
  })

  test('Enter 打开那篇笔记，并滚到命中的那一行', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    // 「备份脚本」只在「工具箱」的正文里出现
    await 搜(page, '备份脚本')
    await page.keyboard.press('Enter')

    // 面板关掉、文件开出来
    await expect(输入框(page)).toHaveCount(0)
    await expect(page.locator('.cm-tab-bar div[title]').last()).toHaveAttribute(
      'title',
      '技术/待整理/工具箱.md',
    )

    // 光标落在命中的那一行上——跳转的落点就是"能看见那句话"
    const 落点 = await page.evaluate(() => {
      const v = (window as any).__cmDebug.view
      const head = v.state.selection.main.head
      return v.state.doc.lineAt(head).text
    })
    expect(落点, '跳过去没落在命中的那一行').toContain('备份脚本')
  })

  test('点一条结果同样打开它', async ({ open, page }) => {
    await open()
    await 打开搜索(page)
    await 搜(page, '正则')
    await 结果行(page).first().click()

    await expect(输入框(page)).toHaveCount(0)
    await expect(page.locator('.cm-tab-bar div[title]').last()).toHaveAttribute(
      'title',
      '技术/待整理/正则备忘.md',
    )
  })
})

/**
 * 大纲里的搜索。
 *
 * 它搜的是**当前这篇笔记的标题**（不是全文，也不是别的笔记），而且是
 * **就地筛**——不弹面板，因为要筛的东西就摆在那一列里。
 */
test.describe('大纲搜索 @search', () => {
  const 大纲 = (page: Page) => page.locator('aside').last()
  const 标题输入框 = (page: Page) => page.getByPlaceholder('搜索标题')
  /** 大纲里列出来的标题（按显示顺序） */
  const 标题们 = (page: Page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('aside:last-of-type nav li button[title]'))
        .map((b) => b.getAttribute('title'))
        .filter((t) => t && t !== '展开' && t !== '折叠'),
    )

  const 打开 = async (page: Page) => {
    await page.getByRole('button', { name: '搜索标题' }).click()
    await expect(标题输入框(page)).toBeVisible()
  }

  test('点「搜索标题」出输入框，打一个字就筛出含它的标题', async ({ open, page }) => {
    await open()
    await 打开(page)

    await 标题输入框(page).fill('三级')
    await page.waitForTimeout(150)

    expect(await 标题们(page), '筛出来的不只是「三级标题」').toEqual(['三级标题'])
  })

  test('命中的那几个字在标题里高亮', async ({ open, page }) => {
    await open()
    await 打开(page)
    await 标题输入框(page).fill('三级')
    await page.waitForTimeout(150)

    const marks = await 大纲(page).locator('mark').allTextContents()
    expect(marks).toEqual(['三级'])
  })

  test('搜的时候不看折叠状态——收起来的父标题下面的命中也要列出来', async ({ open, page }) => {
    await open()

    // 先把所有标题收起来：「六级标题」这时是看不见的
    await page.locator('[aria-label="隐藏大纲"]').locator('..').getByRole('button', { name: '全部折叠' }).click()
    await expect(page.getByRole('button', { name: '六级标题' })).toHaveCount(0)

    await 打开(page)
    await 标题输入框(page).fill('六级')
    await page.waitForTimeout(150)

    // 命中了却看不见，比不搜还糟——所以搜索期间折叠不作数
    expect(await 标题们(page), '命中被折叠挡住了').toEqual(['六级标题'])
  })

  test('没有标题含这个词时说清楚，而不是留一片空白', async ({ open, page }) => {
    await open()
    await 打开(page)
    await 标题输入框(page).fill('这几个字哪儿都没有')
    await page.waitForTimeout(150)

    await expect(大纲(page).getByText('没有标题含「这几个字哪儿都没有」')).toBeVisible()
  })

  test('点一条命中跳到正文那一行，搜索留着不走', async ({ open, page, editor }) => {
    await open()
    await 打开(page)
    await 标题输入框(page).fill('三级')
    await page.waitForTimeout(150)

    await 大纲(page).getByRole('button', { name: '三级标题' }).click()

    const 行 = await editor.cursorLine()
    const 那一行 = await editor.lineText(行)
    expect(那一行, '跳过去没落在三级标题那一行').toContain('三级标题')
    // 搜索还开着：多半还要接着看下一个
    await expect(标题输入框(page)).toBeVisible()
  })

  test('Esc 关掉搜索，整个大纲原样回来', async ({ open, page }) => {
    await open()
    await 打开(page)
    await 标题输入框(page).fill('三级')
    await page.waitForTimeout(150)

    await page.keyboard.press('Escape')

    await expect(标题输入框(page)).toHaveCount(0)
    const 全部 = await 标题们(page)
    expect(全部, '关掉搜索后大纲没有恢复').toContain('一级标题')
    expect(全部.length, '关掉搜索后还是筛过的样子').toBeGreaterThan(1)
  })
})
