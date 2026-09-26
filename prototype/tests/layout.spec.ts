import { test, expect } from './fixtures'
import { contrastRatio, hexToRgb } from './utils'

/**
 * 顶栏与工具栏的布局约定。
 *
 * 三条横栏（左上「知己笔记」/ 中间标签栏 / 右上「大纲」）下边缘必须齐平。
 *
 * **两条侧栏的工具条在顶栏下面**（不是底部），而且**和编辑器工具栏同一行**：
 * 三列的第二行因此也是一条线。工具条里的按钮顺序左右对称——折叠永远在最外侧，
 * 搜索永远挨着它要搜的那一列的内容。
 *
 * 侧栏收起时**整条侧栏（含顶栏）缩成窄栏**，顶栏那行字换成单字缩写
 * （知 / 纲），但**字体、字号、颜色与展开时完全一致**——读起来是同一个
 * 标识的缩写，而不是另一个东西。右侧「大纲」与左上「知己笔记」也要一致。
 *
 * 工具栏是次级操作区，要比标签栏矮一档。
 */

/**
 * 取三条横栏（左上「知己笔记」/ 中间标签栏 / 右上「大纲」）的下边缘。
 *
 * 三条各自住在自己的列里（侧栏的顶栏 + pane 的标签栏），所以按列取第一个子元素。
 */
async function topBarBottoms(page: any) {
  return page.evaluate(() => {
    const bottomOf = (el: Element | null | undefined) =>
      el ? Math.round((el as HTMLElement).getBoundingClientRect().bottom) : null

    const asides = Array.from(document.querySelectorAll('aside'))
    const leftAside = asides[0]
    const rightAside = asides[asides.length - 1]
    const tabBar = document.querySelector('.cm-tab-bar')

    return {
      left: bottomOf(leftAside?.firstElementChild),
      mid: bottomOf(tabBar),
      right: bottomOf(rightAside?.firstElementChild),
    }
  })
}

/** 取某一列顶栏里那行字的样式——用来验证展开时的标识是不是同一套字体 */
async function headerTextStyle(page: any, side: 'left' | 'right') {
  return page.evaluate((s: string) => {
    const asides = Array.from(document.querySelectorAll('aside'))
    const aside = s === 'left' ? asides[0] : asides[asides.length - 1]
    const span = aside?.firstElementChild?.querySelector('span')
    if (!span) return null
    const cs = getComputedStyle(span)
    return {
      text: span.textContent,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.color,
    }
  }, side)
}

/**
 * 取某一列顶栏里那枚**印**的样式。
 *
 * 收起之后标识不再是文字，是一个朱砂方块（见 Seal.tsx）——所以这里盯的
 * 是底色、字色、方角，而不是字号字重。
 */
async function headerSealStyle(page: any, side: 'left' | 'right') {
  return page.evaluate((s: string) => {
    const asides = Array.from(document.querySelectorAll('aside'))
    const aside = s === 'left' ? asides[0] : asides[asides.length - 1]
    const el = aside?.firstElementChild?.querySelector('span[aria-hidden="true"]') as HTMLElement | null
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      text: el.textContent,
      background: cs.backgroundColor,
      color: cs.color,
      borderRadius: cs.borderRadius,
      期望底色: getComputedStyle(document.documentElement).getPropertyValue('--seal-bg').trim(),
    }
  }, side)
}

test.describe('布局 @layout', () => {
  test('左上文件树头、中间标签栏、右上大纲头三条横栏下边缘齐平', async ({ open, page }) => {
    await open()

    const b = await topBarBottoms(page)
    expect(b.left, '没找到左上横栏').not.toBeNull()
    expect(b.mid, '没找到标签栏').not.toBeNull()
    expect(b.right, '没找到右上大纲横栏').not.toBeNull()

    expect(Math.abs(b.left! - b.mid!), `左上 ${b.left}px 与标签栏 ${b.mid}px 没对齐`).toBeLessThanOrEqual(1)
    expect(Math.abs(b.mid! - b.right!), `标签栏 ${b.mid}px 与右上 ${b.right}px 没对齐`).toBeLessThanOrEqual(1)
  })

  test('工具栏比标签栏矮一档', async ({ open, page }) => {
    await open()

    const h = await page.evaluate(() => {
      const tabBar = Array.from(document.querySelectorAll('div')).find((d) =>
        d.classList.contains('cm-tab-bar'),
      )
      const toolbar = document.querySelector('[data-editor-toolbar]')
      return {
        tabBar: tabBar ? Math.round(tabBar.getBoundingClientRect().height) : null,
        toolbar: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : null,
      }
    })

    expect(h.toolbar, '没找到工具栏').not.toBeNull()
    expect(h.tabBar, '没找到标签栏').not.toBeNull()
    expect(h.toolbar!, `工具栏 ${h.toolbar}px 不该比标签栏 ${h.tabBar}px 高`).toBeLessThan(h.tabBar!)
    // 也不能矮到按钮挤不下（按钮本身 28px）
    expect(h.toolbar!, `工具栏 ${h.toolbar}px 太矮，按钮放不下`).toBeGreaterThanOrEqual(28)
  })

  test('工具栏按钮顺序：搜索 / 标题 引用 / 列表 / 代码图表 / 行内 / 格式', async ({ open, page }) => {
    await open()

    const labels = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-editor-toolbar]')
      if (!toolbar) return null
      return Array.from(toolbar.querySelectorAll('[aria-label]')).map((el) =>
        el.getAttribute('aria-label'),
      )
    })

    expect(labels, '没找到工具栏按钮').not.toBeNull()
    expect(labels).toEqual([
      '搜索',
      '引用',
      '无序列表',
      '有序列表',
      '待办项',
      '代码块',
      '图片',
      '表格',
      '粗体',
      '斜体',
      '删除线',
      '分割线',
      '链接',
      '行内代码',
      '源码',
      '清除格式',
    ])
  })

  test('查找与格式之间隔一条竖线，标题与引用之间没有', async ({ open, page }) => {
    await open()

    /* 竖线是空 span（w-px），它左边那个按钮是分组里的最后一个。
       要验的是：搜索之后有分隔线、标题与引用之间没有——一条线会把
       「标题 引用」这一组切成两半。 */
    const 分组 = await page.evaluate(() => {
      const 栏 = document.querySelector('[data-editor-toolbar]')!
      const 名 = (el: Element) =>
        el.tagName === 'SPAN' ? '|' : el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '?'
      const 序列 = Array.from(栏.children).map(名)
      const 线 = 序列.map((k, i) => (k === '|' ? i : -1)).filter((i) => i >= 0)
      return { 序列, 线 }
    })

    const 搜索后 = 分组.序列.indexOf('搜索') + 1
    const 引用前 = 分组.序列.indexOf('引用') - 1
    expect(分组.线, `搜索与标题之间没有竖线（序列：${分组.序列.join(' ')}）`).toContain(搜索后)
    expect(分组.线, `标题与引用之间不该有竖线（序列：${分组.序列.join(' ')}）`).not.toContain(引用前)
  })

  test('两条侧栏的工具条与编辑器工具栏同一行，且都是 30px', async ({ open, page }) => {
    await open()

    const rows = await page.evaluate(() => {
      const 边 = (el: Element | null | undefined) =>
        el
          ? {
              top: Math.round(el.getBoundingClientRect().top),
              bottom: Math.round(el.getBoundingClientRect().bottom),
              h: Math.round(el.getBoundingClientRect().height),
            }
          : null
      const asides = Array.from(document.querySelectorAll('aside'))
      return {
        // aside 的第 2 个孩子就是工具条（第 1 个是顶栏）
        left: 边(asides[0]?.children[1]),
        right: 边(asides[asides.length - 1]?.children[1]),
        // 用 data-editor-toolbar 这个稳定钩子，别拿类名组合当选择器。
        // 原来写的是 `div.flex.shrink-0.items-center.gap-1.border-b`——而
        // 「框沉下去、撤掉内部横线」那一轮把 border-b 去掉了，选择器当场失效。
        // 组件里早就写明「类名组合到处都是，拿它当选择器太脆」，这里照做。
        toolbar: 边(document.querySelector('[data-editor-toolbar]')),
      }
    })

    expect(rows.left, '没找到左侧工具条').not.toBeNull()
    expect(rows.right, '没找到右侧工具条').not.toBeNull()
    expect(rows.toolbar, '没找到编辑器工具栏').not.toBeNull()

    for (const [名, r] of Object.entries({ 左: rows.left!, 右: rows.right! })) {
      expect(r.top, `${名}侧工具条的上边缘与编辑器工具栏不齐`).toBe(rows.toolbar!.top)
      expect(r.bottom, `${名}侧工具条的下边缘与编辑器工具栏不齐`).toBe(rows.toolbar!.bottom)
    }
    // 高度是定死的 30px——三条横栏一个数。
    // （原来是「30px 含 1px 下边框」；内部横线撤掉之后是 30px 整，
    //  box-sizing: border-box + min-height 让去掉边框也不改高度。）
    expect(rows.toolbar!.h, '编辑器工具栏不是 30px 高').toBe(30)
    expect(rows.left!.h, '文件树工具条不是 30px 高').toBe(30)
    expect(rows.right!.h, '大纲工具条不是 30px 高').toBe(30)
  })

  test('编辑器工具栏的按钮组在编辑区里居中', async ({ open, page }) => {
    await open()

    const g = await page.evaluate(() => {
      const 栏 = document.querySelector('[data-editor-toolbar]') as HTMLElement
      const 按钮 = Array.from(栏.querySelectorAll('button'))
      const 框 = 栏.getBoundingClientRect()
      return {
        左边距: Math.round(按钮[0].getBoundingClientRect().left - 框.left),
        右边距: Math.round(框.right - 按钮[按钮.length - 1].getBoundingClientRect().right),
        按钮数: 按钮.length,
      }
    })

    expect(g.按钮数, '工具栏里没找到按钮').toBeGreaterThan(10)
    // 居中：两边的留白一样（各含 12px 的 px-3 内边距，允许 2px 取整误差）
    expect(
      Math.abs(g.左边距 - g.右边距),
      `按钮组没居中（左留白 ${g.左边距}px，右留白 ${g.右边距}px）`,
    ).toBeLessThanOrEqual(2)
  })
})

test.describe('侧栏折叠 @sidebar', () => {
  test('文件树顶部的按钮只有图标，点击能收起、再点能展开', async ({ open, page }) => {
    await open()

    const hide = page.getByRole('button', { name: '隐藏文件树' })
    await expect(hide).toBeVisible()
    expect((await hide.textContent())?.trim(), '按钮上不该有文字，只放图标').toBe('')

    // 展开态：文件树标题栏在
    await expect(page.locator('aside').first().getByText('知己笔记')).toBeVisible()

    await hide.click()
    const show = page.getByRole('button', { name: '显示文件树' })
    await expect(show, '收起后没有出现展开按钮——用户就找不回来了').toBeVisible()
    // 顶栏换成「知」字（字体与「知己笔记」一致，见专门的测试）
    await expect(page.locator('aside').first().getByText('知', { exact: true })).toBeVisible()
    // 消失的是文件列表本身
    await expect(page.getByRole('button', { name: '架构草案' })).toHaveCount(0)

    await show.click()
    await expect(page.getByRole('button', { name: '隐藏文件树' })).toBeVisible()
    await expect(page.getByRole('button', { name: '架构草案' })).toBeVisible()
  })

  test('大纲顶部同样有折叠按钮，且能来回切换', async ({ open, page }) => {
    await open()

    const hide = page.getByRole('button', { name: '隐藏大纲' })
    await expect(hide).toBeVisible()
    expect((await hide.textContent())?.trim(), '按钮上不该有文字，只放图标').toBe('')

    await hide.click()
    const show = page.getByRole('button', { name: '显示大纲' })
    await expect(show).toBeVisible()

    await show.click()
    await expect(page.getByRole('button', { name: '隐藏大纲' })).toBeVisible()
  })

  test('两侧都收起后，三条横栏仍然对齐', async ({ open, page }) => {
    await open()
    await page.getByRole('button', { name: '隐藏文件树' }).click()
    await page.getByRole('button', { name: '隐藏大纲' }).click()
    await page.waitForTimeout(200)

    const b = await topBarBottoms(page)
    // 收起后左右只剩窄栏，但顶部占位仍与标签栏同高
    expect(b.mid, '没找到标签栏').not.toBeNull()
    if (b.left !== null) {
      expect(Math.abs(b.left - b.mid!), `收起后左上 ${b.left}px 与标签栏 ${b.mid}px 没对齐`).toBeLessThanOrEqual(1)
    }
    if (b.right !== null) {
      expect(Math.abs(b.mid! - b.right), `收起后标签栏 ${b.mid}px 与右上 ${b.right}px 没对齐`).toBeLessThanOrEqual(1)
    }
  })

  test('折叠按钮所在的工具条撑满侧栏宽度', async ({ open, page }) => {
    await open()

    const widths = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="隐藏文件树"]')
      const bar = btn?.parentElement
      const aside = bar?.closest('aside') as HTMLElement | null
      return {
        bar: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        // clientWidth 不含边框——工具条该撑满的是内容区，不是连边框一起盖住
        asideContent: aside ? aside.clientWidth : null,
      }
    })

    expect(widths.bar, '没找到工具条').not.toBeNull()
    expect(widths.asideContent, '没找到文件树').not.toBeNull()
    expect(
      widths.bar,
      `工具条 ${widths.bar}px 没撑满文件树内容区 ${widths.asideContent}px`,
    ).toBe(widths.asideContent)
  })
})

test('折叠按钮在两种主题下都看得清（收起后它是唯一入口）', async ({ open, page, theme }) => {
  await open()

  for (const t of ['light', 'dark'] as const) {
    await theme(t)
    const { fg, bg } = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="隐藏文件树"]') as HTMLElement
      let node: HTMLElement | null = btn.parentElement
      let bg = 'rgb(255, 255, 255)'
      while (node) {
        const c = getComputedStyle(node).backgroundColor
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
          bg = c
          break
        }
        node = node.parentElement
      }
      return { fg: getComputedStyle(btn).color, bg }
    })

    expect(
      contrastRatio(fg, bg),
      `${t} 模式折叠按钮对比度不足（图标 ${fg} 落在 ${bg} 上）——收起后整条窄栏只剩它`,
    ).toBeGreaterThanOrEqual(3)
  }
})

test.describe('侧栏工具条 @sidebar', () => {
  /** 取某个工具条里的按钮标签，按显示顺序 */
  const barLabels = (page: any, toggleLabel: string) =>
    page.evaluate((sel: string) => {
      const bar = document.querySelector(`[aria-label="${sel}"]`)?.parentElement
      return bar ? Array.from(bar.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label')) : null
    }, toggleLabel)

  test('文件树顶部四个按钮：折叠 / 全部展开 / 全部折叠 / 搜索', async ({ open, page }) => {
    await open()
    expect(await barLabels(page, '隐藏文件树')).toEqual(['隐藏文件树', '全部展开', '全部折叠', '搜索全部笔记'])
  })

  test('大纲顶部四个按钮：搜索 / 全部折叠 / 全部展开 / 折叠', async ({ open, page }) => {
    await open()
    expect(await barLabels(page, '隐藏大纲')).toEqual(['搜索标题', '全部折叠', '全部展开', '隐藏大纲'])
  })

  test('文件树的全部折叠能收起所有文件夹，全部展开能摊开', async ({ open, page }) => {
    await open()
    const treeBar = page.locator('[aria-label="隐藏文件树"]').locator('..')

    // 初始全展开：深层文件可见
    await expect(page.getByRole('button', { name: '架构草案' })).toBeVisible()

    await treeBar.getByRole('button', { name: '全部折叠' }).click()
    await expect(page.getByRole('button', { name: '架构草案' }), '全部折叠后深层文件还在').toHaveCount(0)
    // 顶层文件夹本身还在（只是子项收了）
    await expect(page.getByRole('button', { name: '技术' })).toBeVisible()

    await treeBar.getByRole('button', { name: '全部展开' }).click()
    await expect(page.getByRole('button', { name: '架构草案' })).toBeVisible()
  })

  test('大纲的全部折叠能收起所有标题，全部展开能摊开', async ({ open, page }) => {
    await open()
    const outlineBar = page.locator('[aria-label="隐藏大纲"]').locator('..')

    await expect(page.getByRole('button', { name: '六级标题' })).toBeVisible()

    await outlineBar.getByRole('button', { name: '全部折叠' }).click()
    await expect(page.getByRole('button', { name: '六级标题' }), '全部折叠后子标题还在').toHaveCount(0)
    await expect(page.getByRole('button', { name: '一级标题' })).toBeVisible()

    await outlineBar.getByRole('button', { name: '全部展开' }).click()
    await expect(page.getByRole('button', { name: '六级标题' })).toBeVisible()
  })

  test('折叠按钮贴屏幕边缘：文件树的靠左、大纲的靠右', async ({ open, page }) => {
    await open()

    const pos = await page.evaluate(() => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? el.getBoundingClientRect() : null
      }
      const treeBtn = rect('[aria-label="隐藏文件树"]')
      const outlineBtn = rect('[aria-label="隐藏大纲"]')
      return {
        treeBtnLeft: treeBtn ? Math.round(treeBtn.left) : null,
        // 屏幕左边缘：文件树 aside 的左边界
        treeAsideLeft: Math.round(document.querySelector('aside')!.getBoundingClientRect().left),
        outlineBtnRight: outlineBtn ? Math.round(outlineBtn.right) : null,
        screenRight: window.innerWidth,
      }
    })

    // 文件树的折叠按钮：离屏幕左边缘不超过 16px（工具条 padding + 一点余量）
    expect(pos.treeBtnLeft! - pos.treeAsideLeft, '文件树的折叠按钮没有贴左边缘').toBeLessThanOrEqual(16)
    // 大纲的折叠按钮：离屏幕右边缘不超过 16px
    expect(pos.screenRight - pos.outlineBtnRight!, '大纲的折叠按钮没有贴右边缘').toBeLessThanOrEqual(16)
  })
})

test('收起文件树后顶栏盖一枚朱砂印，展开时仍是「知己笔记」四个字', async ({ open, page }) => {
  await open()

  const expanded = await headerTextStyle(page, 'left')
  expect(expanded?.text, '展开时左侧顶栏不是「知己笔记」').toBe('知己笔记')

  await page.getByRole('button', { name: '隐藏文件树' }).click()
  await page.waitForTimeout(200)

  /* 收起后不是"标题被截断了"，而是**同一枚印**——一个字本来就是一个印。
     所以这里盯的不再是字号字重，是底色、字色、方角（见 Seal.tsx）。 */
  const 印 = await headerSealStyle(page, 'left')
  expect(印, '收起后顶栏没有出现印').not.toBeNull()
  expect(印!.text, '印上的字不是「知」').toBe('知')

  const [r, g, b] = hexToRgb(印!.期望底色)
  expect(印!.background, '印的底色不是朱砂').toBe(`rgb(${r}, ${g}, ${b})`)
  // 印泥上的字是刻掉的、露出纸色——永远是白字，不跟着主题反色
  expect(印!.color, '印上的字不是白色').toBe('rgb(255, 255, 255)')
  // 印章是方的，只收一点点角，不是圆角胶囊
  expect(parseFloat(印!.borderRadius), '印收角太多，不像印章').toBeLessThanOrEqual(6)

  // 整条侧栏收窄了，文件列表消失
  const width = await page.locator('aside').first().evaluate((el) => Math.round(el.getBoundingClientRect().width))
  expect(width, '收起后侧栏没变窄').toBeLessThan(50)
  await expect(page.getByRole('button', { name: '架构草案' })).toHaveCount(0)
})

test('「大纲」的字体 / 字号 / 颜色与「知己笔记」一致，且居中', async ({ open, page }) => {
  await open()

  const left = await headerTextStyle(page, 'left')
  const right = await headerTextStyle(page, 'right')
  expect(right?.text, '展开时右侧顶栏不是「大纲」').toBe('大纲')

  // 用户要求：右侧那行字与左上**完全一致**——两边是同一层级的标识
  expect(right!.fontSize, '「大纲」的字号与「知己笔记」不一致').toBe(left!.fontSize)
  expect(right!.fontWeight, '「大纲」的字重与「知己笔记」不一致').toBe(left!.fontWeight)
  expect(right!.color, '「大纲」的颜色与「知己笔记」不一致').toBe(left!.color)

  // 居中：文字中心与所在那一段的中心对齐
  const centered = await page.evaluate(() => {
    const asides = Array.from(document.querySelectorAll('aside'))
    const header = asides[asides.length - 1]!.firstElementChild as HTMLElement
    const span = header.querySelector('span') as HTMLElement
    const hr = header.getBoundingClientRect()
    const sr = span.getBoundingClientRect()
    return {
      headerCenter: hr.left + hr.width / 2,
      spanCenter: sr.left + sr.width / 2,
    }
  })
  expect(
    Math.abs(centered.headerCenter - centered.spanCenter),
    '「大纲」没有在顶栏里居中',
  ).toBeLessThanOrEqual(2)
})

/** 某一侧顶栏里那行字相对所在栏是不是居中。 */
async function headerCentered(page: any, side: 'left' | 'right') {
  return page.evaluate((s: string) => {
    const asides = Array.from(document.querySelectorAll('aside'))
    const header = (s === 'left' ? asides[0] : asides[asides.length - 1])!.firstElementChild as HTMLElement
    const span = header.querySelector('span') as HTMLElement
    const hr = header.getBoundingClientRect()
    const sr = span.getBoundingClientRect()
    return { headerCenter: hr.left + hr.width / 2, spanCenter: sr.left + sr.width / 2 }
  }, side)
}

test('「知己笔记」在文件树顶栏里居中（与「大纲」对称）', async ({ open, page }) => {
  await open()

  const c = await headerCentered(page, 'left')
  expect(
    Math.abs(c.headerCenter - c.spanCenter),
    '「知己笔记」没有在顶栏里居中',
  ).toBeLessThanOrEqual(2)
})

test('栏拉窄了，「知己笔记」跟着收窄而不是溢出', async ({ open, page }) => {
  await open()

  // 拖到下限附近
  const handle = page.locator('[aria-label="调整文件树宽度"]')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 2000, box.y + 200, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const fits = await page.evaluate(() => {
    const header = document.querySelector('aside')!.firstElementChild as HTMLElement
    const span = header.querySelector('span') as HTMLElement
    return span.getBoundingClientRect().width <= header.getBoundingClientRect().width
  })
  expect(fits, '「知己笔记」溢出了顶栏').toBe(true)
})

test('收起大纲后顶栏仍是「己」字，不盖印', async ({ open, page }) => {
  await open()

  const 展开 = await headerTextStyle(page, 'right')
  expect(展开?.text, '展开时右侧顶栏不是「大纲」').toBe('大纲')

  await page.getByRole('button', { name: '隐藏大纲' }).click()
  await page.waitForTimeout(200)

  const 收起 = await headerTextStyle(page, 'right')
  expect(收起?.text, '收起后顶栏没有显示「己」').toBe('己')
  // 与**它自己展开时**一致：同一个标签的缩写，不该一个粗一个细
  expect(收起!.fontSize, '「己」的字号与「大纲」不一致').toBe(展开!.fontSize)
  expect(收起!.fontWeight, '「己」的字重与「大纲」不一致').toBe(展开!.fontWeight)
  expect(收起!.color, '「己」的颜色与「大纲」不一致').toBe(展开!.color)

  /* **不盖印**：印是应用的标识，只属于文件树那一侧。
     这一侧展开时写的是「大纲」——一个面板标签，不是标识。 */
  expect(await headerSealStyle(page, 'right'), '大纲那侧不该盖印').toBeNull()

  const width = await page.locator('aside').last().evaluate((el) => Math.round(el.getBoundingClientRect().width))
  expect(width, '收起后大纲没变窄').toBeLessThan(50)
})

test('收起后只有文件树那侧盖印；两侧的字合起来仍是「知己」', async ({ open, page }) => {
  await open()
  await page.getByRole('button', { name: '隐藏文件树' }).click()
  await page.getByRole('button', { name: '隐藏大纲' }).click()
  await page.waitForTimeout(200)

  const 左印 = await headerSealStyle(page, 'left')
  const 右字 = await headerTextStyle(page, 'right')

  expect(左印?.text, '左侧收起后不是印').toBe('知')
  expect(右字?.text, '右侧收起后不是「己」').toBe('己')
  // 两边合起来还是应用名的前两个字——这个配对没变，变的是左边盖了印
  expect(`${左印?.text}${右字?.text}`, '两侧收起后的字合起来不是「知己」').toBe('知己')
})
