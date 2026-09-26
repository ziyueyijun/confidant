import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * 应用外壳：底部栏、专注模式、两侧栏的宽度。
 *
 * 这一组回答三个问题：
 *
 * 1. **应用级入口在哪儿。** 都在底部栏左侧，一排四个（设置、同步中心、
 *    主题、专注模式）；搜索在文件树那条工具条上，工作空间住进设置里。
 * 2. **专注模式到底藏了什么。** 文件树、文件树顶栏、大纲、大纲顶栏——
 *    四样都要没，而且退出后原来的展开/收起状态不能被打乱。
 * 3. **两侧栏的宽度。** 拖得动，且**拖过就记住**——下次打开还是那个宽度。
 */

/** 两侧栏的宽度（收起时是 36）。 */
async function asideWidths(page: Page) {
  return page.evaluate(() => {
    const asides = Array.from(document.querySelectorAll('aside'))
    const w = (el?: Element) => (el ? Math.round(el.getBoundingClientRect().width) : null)
    return { tree: w(asides[0]), outline: w(asides[asides.length - 1]) }
  })
}

/**
 * 拖某个手柄。
 *
 * 走 page.mouse（真指针事件）而不是 dispatchEvent：手柄用的是
 * setPointerCapture，合成事件拿不到 pointerId，捕获会直接抛错——
 * 那样测出来的"能拖"是假的。
 */
async function dragHandle(page: Page, label: string, dx: number) {
  const handle = page.locator(`[aria-label="${label}"]`)
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  // 取靠上的一点：避开底部那条固定控制条，免得鼠标落在它上面
  const y = box.y + 200

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 10 })
  await page.mouse.up()
}

test.describe('底部栏 @shell', () => {
  test('左侧一排四个入口：设置 / 同步中心 / 主题 / 专注模式', async ({ open, page }) => {
    await open()

    const labels = await page.evaluate(() => {
      const bar = document.querySelector('.fixed.inset-x-0.bottom-0')
      const first = bar?.firstElementChild
      return first ? Array.from(first.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label')) : null
    })

    expect(labels, '没找到底部栏左侧那排按钮').not.toBeNull()
    expect(labels!.slice(0, 2)).toEqual(['设置', '同步中心'])
    // 主题按钮的文案随当前主题变（点它会切到另一边）
    expect(labels![2]).toMatch(/^切换到(亮色|深色)模式$/)
    expect(labels![3]).toBe('专注模式')
    // 搜索与工作空间不在这里——搜索在文件树那条工具条上，工作空间在设置里
    expect(labels).toHaveLength(4)
  })

  test('左上角不再有菜单按钮——入口只有底部栏这一处', async ({ open, page }) => {
    await open()

    const inTreeHeader = await page.evaluate(() => {
      const aside = document.querySelector('aside')
      return aside?.firstElementChild?.querySelectorAll('button').length ?? -1
    })
    expect(inTreeHeader, '文件树顶栏里还挂着按钮').toBe(0)
  })

  test('三个按钮各自打开对的东西', async ({ open, page }) => {
    await open()
    // 弹窗都是 `fixed inset-0` 那一层。不能直接 getByRole('button', {name:'关闭'})——
    // 标签页上那个关闭按钮（title="关闭"）会一起被选中。
    const 弹窗 = page.locator('.fixed.inset-0')

    await page.getByRole('button', { name: '设置' }).click()
    await expect(弹窗.getByText('设置', { exact: true })).toBeVisible()
    await expect(弹窗.getByRole('button', { name: '编辑器' })).toBeVisible()
    await 弹窗.getByRole('button', { name: '关闭' }).click()
    await expect(弹窗, '设置弹窗没关掉').toHaveCount(0)

    await page.getByRole('button', { name: '同步中心' }).click()
    await expect(弹窗.getByText('同步中心', { exact: true })).toBeVisible()
  })

  test('设置弹窗里，「关于知己笔记」排在「更新」下面', async ({ open, page }) => {
    await open()
    await page.getByRole('button', { name: '设置' }).click()

    const 弹窗 = page.locator('.fixed.inset-0')
    const nav = await 弹窗.locator('nav button').allTextContents()
    expect(nav, '设置里没有「关于知己笔记」').toContain('关于知己笔记')
    expect(
      nav.indexOf('关于知己笔记'),
      '「关于知己笔记」没有紧挨在「更新」下面',
    ).toBe(nav.indexOf('更新') + 1)

    // 点进去要真的有内容：版本、以及笔记在哪儿
    await 弹窗.getByRole('button', { name: '关于知己笔记' }).click()
    await expect(弹窗.getByText('confidant v1.0.0')).toBeVisible()
    await expect(弹窗.getByText('%USERPROFILE%\\知己笔记')).toBeVisible()
  })

  test('主题按钮就地切换亮色 / 深色', async ({ open, page }) => {
    await open()
    const before = await page.evaluate(() => document.documentElement.classList.contains('dark'))

    await page.getByRole('button', { name: /^切换到(亮色|深色)模式$/ }).click()

    const after = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(after, '点了主题按钮，主题没变').not.toBe(before)
    // 按钮自己也要翻过来，否则用户不知道再点会去哪
    await expect(
      page.getByRole('button', { name: before ? /^切换到深色模式$/ : /^切换到亮色模式$/ }),
    ).toBeVisible()
  })

  test('同步状态在右边那一块里居中，不跟左边的按钮挤在一起', async ({ page }) => {
    // 挑一个「状态栏有话要说」的场景。不能用方向键切——切场景的键盘处理
    // 会跳过 contentEditable，而 open() 之后焦点就在编辑器正文里。
    await page.goto('/?reveal=never&scenario=synced')
    await page.getByRole('button', { name: '语法全集' }).first().click()
    await expect(page.locator('.cm-content')).toBeVisible()

    const pos = await page.evaluate(() => {
      const bar = document.querySelector('.fixed.inset-x-0.bottom-0') as HTMLElement
      // 右块是 grid [占位 | 状态 | 文档信息]，所以状态是它的第 2 个孩子
      const right = bar.children[1] as HTMLElement
      const mid = right.children[1] as HTMLElement
      const rr = right.getBoundingClientRect()
      const mr = mid.getBoundingClientRect()
      return {
        rightCenter: rr.left + rr.width / 2,
        midCenter: mr.left + mr.width / 2,
        text: mid.textContent,
      }
    })

    expect(pos.text, '这个场景下状态栏本该说点什么').toContain('上次同步于')
    expect(
      Math.abs(pos.rightCenter - pos.midCenter),
      '同步状态没有在底部栏右边那一块里居中',
    ).toBeLessThanOrEqual(2)
  })

  test('同步中只报进度，不报正在处理哪个文件', async ({ page }) => {
    await page.goto('/?reveal=never&scenario=syncing')
    await page.getByRole('button', { name: '语法全集' }).first().click()
    await expect(page.locator('.cm-content')).toBeVisible()

    const mid = await page.evaluate(() => {
      const bar = document.querySelector('.fixed.inset-x-0.bottom-0') as HTMLElement
      return (bar.children[1] as HTMLElement).children[1].textContent ?? ''
    })

    expect(mid, '同步中该报进度').toContain('正在同步')
    // 场景数据里的 currentFile 是 assets/003/20260925-150817-c3d4.png
    expect(mid, '底部栏不该出现正在处理的文件名').not.toContain('.png')
    expect(mid, '底部栏不该出现正在处理的文件名').not.toContain('assets/')
  })
})

test.describe('设置弹窗 @shell', () => {
  const 打开设置 = async (page: Page) => {
    await page.getByRole('button', { name: '设置' }).click()
    const 弹窗 = page.locator('.fixed.inset-0')
    await expect(弹窗.getByText('设置', { exact: true })).toBeVisible()
    return 弹窗
  }

  test('分组顺序：工作空间紧挨在同步下面', async ({ open, page }) => {
    await open()
    const 弹窗 = await 打开设置(page)

    const nav = await 弹窗.locator('nav button').allTextContents()
    expect(nav, '设置里没有「工作空间」').toContain('工作空间')
    expect(
      nav.indexOf('工作空间'),
      '「工作空间」没有紧挨在「同步」下面',
    ).toBe(nav.indexOf('同步') + 1)
  })

  test('切分组时弹窗高度不变', async ({ open, page }) => {
    await open()
    const 弹窗 = await 打开设置(page)

    const 高度 = () =>
      page.evaluate(() => {
        const dlg = document.querySelector('.fixed.inset-0 div[class*="shadow-2xl"]') as HTMLElement
        const r = dlg.getBoundingClientRect()
        return { h: Math.round(r.height), top: Math.round(r.top) }
      })

    const 分组 = await 弹窗.locator('nav button').allTextContents()
    const 第一个 = await 高度()
    for (const g of 分组) {
      await 弹窗.getByRole('button', { name: g, exact: true }).click()
      await page.waitForTimeout(80)
      const 现在 = await 高度()
      expect(现在.h, `切到「${g}」时弹窗高度变了（${第一个.h} → ${现在.h}）`).toBe(第一个.h)
      expect(现在.top, `切到「${g}」时弹窗位置动了`).toBe(第一个.top)
    }
  })

  test('同步分组里没有「自动同步」——程序只允许手动同步', async ({ open, page }) => {
    await open()
    const 弹窗 = await 打开设置(page)

    await 弹窗.getByRole('button', { name: '同步', exact: true }).click()
    await expect(弹窗.getByText('WebDAV 同步')).toBeVisible()
    await expect(弹窗.getByText('批量删除保护')).toBeVisible()
    await expect(弹窗.getByText('自动同步'), '设置里还留着自动同步').toHaveCount(0)
    await expect(弹窗.getByText('启用自动同步')).toHaveCount(0)
  })

  test('工作空间分组：两个按钮，「切换」打开系统文件夹选择器', async ({ open, page }) => {
    await open()
    const 弹窗 = await 打开设置(page)

    await 弹窗.getByRole('button', { name: '工作空间', exact: true }).click()
    await expect(弹窗.getByText('%USERPROFILE%\\知己笔记')).toBeVisible()
    await expect(弹窗.getByRole('button', { name: '打开工作空间' })).toBeVisible()

    await 弹窗.getByRole('button', { name: '切换工作空间' }).click()
    // 系统窗口是盖在设置之上的一层——真机上由操作系统画，这里只验它出来了。
    // 标题栏和确认按钮都叫「选择文件夹」，所以按钮要按 role 取。
    const 选择器 = page.locator('.fixed.inset-0').last()
    await expect(选择器.getByRole('button', { name: '选择文件夹' })).toBeVisible()
    await expect(选择器.getByText('原型：这是系统窗口，不是应用画的')).toBeVisible()

    await 选择器.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('选择文件夹')).toHaveCount(0)
    // 关掉选择器之后设置还在
    await expect(弹窗.getByRole('button', { name: '打开工作空间' })).toBeVisible()
  })

  test('编辑器 › 显示方式当场改编辑器（它从工具栏搬到这里了）', async ({ open, page, editor }) => {
    await open()

    /** 正文里含「粗体」那一行的**渲染结果**（DOM，不是文档原文） */
    const 渲染的粗体行 = () =>
      page.evaluate(() => {
        const 行 = Array.from(document.querySelectorAll('.cm-line')).find((l) =>
          l.textContent?.includes('粗体'),
        )
        return 行?.textContent ?? ''
      })

    const 行号 = (await editor.text()).split('\n').findIndex((l) => l.includes('**粗体**')) + 1
    expect(行号, '语法全集里没有含 **粗体** 的那一行').toBeGreaterThan(0)
    await editor.placeCursor(行号, 0)

    // 默认「不展开」：那一行渲染出来是没有 ** 的
    expect(await 渲染的粗体行(), '不展开时标记没藏起来').not.toContain('**')

    const 弹窗 = await 打开设置(page)
    await 弹窗.getByRole('button', { name: '整行', exact: true }).click()
    await 弹窗.getByRole('button', { name: '关闭' }).click()

    // 换成「整行」之后，光标所在那一行把标记露出来
    await editor.placeCursor(行号, 0)
    await expect.poll(渲染的粗体行, { message: '选了「整行」，光标那一行还是没露出 **' }).toContain('**')
  })
})

test.describe('同步中心弹窗 @shell', () => {
  test('概览与冲突两个页签高度一样，切换时不跳', async ({ page }) => {
    // 有冲突的场景：两个页签都有内容，切换才是真的在切
    await page.goto('/?reveal=never&scenario=conflicts')

    const 弹窗 = page.locator('.fixed.inset-0')
    await expect(弹窗.getByText('同步中心', { exact: true })).toBeVisible()

    const 尺寸 = () =>
      page.evaluate(() => {
        const dlg = document.querySelector('.fixed.inset-0 div[class*="shadow-2xl"]') as HTMLElement
        const r = dlg.getBoundingClientRect()
        return { h: Math.round(r.height), top: Math.round(r.top) }
      })

    // 有冲突时默认停在冲突页
    const 冲突页 = await 尺寸()
    await 弹窗.getByRole('button', { name: '概览', exact: true }).click()
    await page.waitForTimeout(120)
    const 概览页 = await 尺寸()

    expect(概览页.h, `切页签时弹窗高度变了（${冲突页.h} → ${概览页.h}）`).toBe(冲突页.h)
    expect(概览页.top, '切页签时弹窗位置动了').toBe(冲突页.top)
  })
})

test.describe('底部栏左段与文件树对齐 @shell', () => {
  /** 文件树右边框、底部栏左段右边框各自在哪条竖线上 */
  async function borders(page: Page) {
    return page.evaluate(() => {
      const aside = document.querySelector('aside')!
      const bar = document.querySelector('.fixed.inset-x-0.bottom-0') as HTMLElement
      const seg = bar.firstElementChild as HTMLElement
      return {
        treeRight: Math.round(aside.getBoundingClientRect().right),
        segRight: Math.round(seg.getBoundingClientRect().right),
        segBorder: getComputedStyle(seg).borderRightWidth,
        segWidth: Math.round(seg.getBoundingClientRect().width),
        barBottom: Math.round(bar.getBoundingClientRect().bottom),
        winH: window.innerHeight,
      }
    })
  }

  test('左段的右边框接上文件树的右边框，竖线一路到底', async ({ open, page }) => {
    await open()
    const b = await borders(page)

    expect(b.segRight, `文件树右边框在 ${b.treeRight}，底部栏左段却在 ${b.segRight}`).toBe(b.treeRight)
    expect(b.segBorder, '左段没有右边框——竖线在底部栏这里断了').not.toBe('0px')
    // 底部栏贴着窗口下边缘：竖线一直画到底
    expect(b.winH - b.barBottom).toBeLessThanOrEqual(1)
  })

  test('把文件树拖宽，左段跟着变宽', async ({ open, page }) => {
    await open()
    const before = await borders(page)

    const handle = page.locator('[aria-label="调整文件树宽度"]')
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + 200, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(150)

    const after = await borders(page)
    expect(after.segWidth, '拖宽文件树，底部栏左段没跟着').toBeGreaterThan(before.segWidth)
    expect(after.segRight, '拖宽之后两边又错开了').toBe(after.treeRight)
  })

  test('按钮均分左段，每个都够点（不小于 24px）', async ({ open, page }) => {
    await open()

    const widths = await page.evaluate(() => {
      const seg = document.querySelector('.fixed.inset-x-0.bottom-0')!.firstElementChild as HTMLElement
      return Array.from(seg.querySelectorAll('button')).map((b) => Math.round(b.getBoundingClientRect().width))
    })

    expect(widths).toHaveLength(4)
    for (const w of widths) {
      expect(w, `有个按钮只有 ${w}px 宽，点不准`).toBeGreaterThanOrEqual(24)
    }
  })

  test('文件树收到最窄时，按钮仍然够点', async ({ open, page }) => {
    await open()

    const handle = page.locator('[aria-label="调整文件树宽度"]')
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 2000, box.y + 200, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(150)

    const widths = await page.evaluate(() => {
      const seg = document.querySelector('.fixed.inset-x-0.bottom-0')!.firstElementChild as HTMLElement
      return Array.from(seg.querySelectorAll('button')).map((b) => Math.round(b.getBoundingClientRect().width))
    })
    for (const w of widths) {
      expect(w, `收到最窄后按钮只有 ${w}px 宽`).toBeGreaterThanOrEqual(24)
    }
  })

  test('文件树收起后，左段不再跟着对齐（缩成一组，也不画竖线）', async ({ open, page }) => {
    await open()
    await page.getByRole('button', { name: '隐藏文件树' }).click()
    await page.waitForTimeout(150)

    const b = await borders(page)
    expect(b.segBorder, '文件树都收起了，底部栏还画着一条对齐线').toBe('0px')
    // 按钮还在，够点
    await expect(page.getByRole('button', { name: '同步中心' })).toBeVisible()
  })
})

test.describe('专注模式 @shell', () => {
  test('两侧栏连顶栏一起消失，只剩标签页与正文', async ({ open, page }) => {
    await open()
    expect(await page.locator('aside').count()).toBe(2)

    await page.getByRole('button', { name: '专注模式' }).click()

    // 四条都要没：文件树、文件树顶栏、大纲、大纲顶栏。
    // aside 是整个侧栏（含顶栏），所以 aside 数量为 0 就是这四条全没了。
    expect(await page.locator('aside').count(), '专注模式下还有侧栏').toBe(0)
    await expect(page.getByText('知己笔记'), '文件树顶栏还在').toHaveCount(0)
    await expect(page.getByText('大纲', { exact: true }), '大纲顶栏还在').toHaveCount(0)
    // 正文还在
    await expect(page.locator('.cm-content')).toBeVisible()
  })

  test('出口是底部栏那个按钮，它自己亮着', async ({ open, page }) => {
    await open()
    await page.getByRole('button', { name: '专注模式' }).click()

    const exit = page.getByRole('button', { name: '退出专注模式' })
    await expect(exit, '两侧栏都没了，底部栏那个按钮是唯一的出口').toBeVisible()
    expect(await exit.getAttribute('aria-pressed')).toBe('true')

    await exit.click()
    expect(await page.locator('aside').count()).toBe(2)
  })

  test('退出后两侧栏的展开 / 收起状态原样回来', async ({ open, page }) => {
    await open()
    await page.getByRole('button', { name: '隐藏大纲' }).click()
    await page.waitForTimeout(150)

    await page.getByRole('button', { name: '专注模式' }).click()
    await page.getByRole('button', { name: '退出专注模式' }).click()

    // 大纲仍是收起的——专注模式不该顺手把它摊开
    await expect(page.getByRole('button', { name: '显示大纲' })).toBeVisible()
  })
})

test.describe('侧栏宽度 @shell', () => {
  test('拖文件树的右边框，栏跟着变宽', async ({ open, page }) => {
    await open()
    const before = (await asideWidths(page)).tree!

    await dragHandle(page, '调整文件树宽度', 100)

    const after = (await asideWidths(page)).tree!
    expect(Math.abs(after - (before + 100)), `拖了 100px，宽度从 ${before} 变成 ${after}`).toBeLessThanOrEqual(3)
  })

  test('拖大纲的左边框，往左拖是变宽', async ({ open, page }) => {
    await open()
    const before = (await asideWidths(page)).outline!

    await dragHandle(page, '调整大纲宽度', -80)

    const after = (await asideWidths(page)).outline!
    expect(Math.abs(after - (before + 80)), `往左拖 80px，宽度从 ${before} 变成 ${after}`).toBeLessThanOrEqual(3)
  })

  test('拖过之后记住：刷新页面还是那个宽度', async ({ open, page }) => {
    await open()
    await dragHandle(page, '调整文件树宽度', 120)
    await dragHandle(page, '调整大纲宽度', -60)
    const dragged = await asideWidths(page)

    await open()
    await page.waitForTimeout(200)

    const after = await asideWidths(page)
    expect(after.tree, '刷新后文件树宽度没记住').toBe(dragged.tree)
    expect(after.outline, '刷新后大纲宽度没记住').toBe(dragged.outline)
  })

  test('宽度有上下限，拖过头不会把编辑区挤没', async ({ open, page }) => {
    await open()

    await dragHandle(page, '调整文件树宽度', 2000)
    const wide = (await asideWidths(page)).tree!
    expect(wide, '文件树能拖到 480 以上').toBeLessThanOrEqual(480)

    await dragHandle(page, '调整文件树宽度', -2000)
    const narrow = (await asideWidths(page)).tree!
    expect(narrow, '文件树能拖到 140 以下').toBeGreaterThanOrEqual(140)

    // 编辑区始终还在
    await expect(page.locator('.cm-content')).toBeVisible()
  })

  test('拖一条不会动到另一条', async ({ open, page }) => {
    await open()
    const before = await asideWidths(page)

    await dragHandle(page, '调整文件树宽度', 90)

    const after = await asideWidths(page)
    expect(after.outline, '拖文件树把大纲也改了').toBe(before.outline)
  })
})
