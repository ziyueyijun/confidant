import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * 在本文中查找（编辑器工具栏第 1 个按钮）。
 *
 * 与另外两个搜索的分工：文件树那条搜**整个工作空间**（`search.spec.ts`），
 * 大纲那条搜**这篇的标题**（同文件最后一节），这一个搜**当前这篇的正文**。
 *
 * 这里断言的几条都是查找这个动作本身的约定：边打边查、跳到第一处、
 * 能前后走、没有命中要说出来、关掉之后不留痕。
 */

const 查找输入框 = (page: Page) => page.getByPlaceholder('在本文中查找')
const 命中数 = (page: Page) => page.locator('[data-find-status]')
/** 正文里的命中标记。当前落点那一个用的是另一个类名，要分开数。 */
const 高亮 = (page: Page) => page.locator('.cm-find-match, .cm-find-match-current')

async function 打开查找(page: Page) {
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(查找输入框(page)).toBeVisible()
}

/** 打字并等一拍渲染 */
async function 查(page: Page, q: string) {
  await 查找输入框(page).fill(q)
  await page.waitForTimeout(200)
}

test.describe('在本文中查找 @find', () => {
  test('工具栏第 1 个按钮打开查找条，输入框自动就位', async ({ open, page }) => {
    await open()
    await 打开查找(page)

    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused, '打开查找条后没有拿到焦点').toBe('INPUT')
    // 按钮自己亮着：它是这条栏的开关，用户得看得出它开着
    expect(await page.getByRole('button', { name: '搜索', exact: true }).getAttribute('aria-pressed')).toBe('true')
  })

  test('打了字就跳到第一处命中，并把命中都标出来', async ({ open, page, editor }) => {
    await open()
    await 打开查找(page)
    await 查(page, '标题')

    expect(await 高亮(page).count(), '正文里一处都没标出来').toBeGreaterThan(0)
    // 当前落点只有一处
    expect(await page.locator('.cm-find-match-current').count()).toBe(1)

    const 落点 = await editor.cursorLine()
    const 那一行 = await editor.lineText(落点)
    expect(那一行, '没有跳到第一处命中上').toContain('标题')
  })

  test('报「第几个 / 共几个」，前后都能走，走到头绕回去', async ({ open, page }) => {
    await open()
    await 打开查找(page)
    await 查(page, '标题')

    const 初始 = (await 命中数(page).textContent())!
    expect(初始, `命中数读起来不像「N / M」：${初始}`).toMatch(/^\d+ \/ \d+$/)
    const 总数 = Number(初始.split('/')[1].trim())

    await page.getByRole('button', { name: '下一个' }).click()
    expect((await 命中数(page).textContent())!.trim()).toBe(`2 / ${总数}`)

    await page.getByRole('button', { name: '上一个' }).click()
    expect((await 命中数(page).textContent())!.trim()).toBe(`1 / ${总数}`)

    // 从第 1 个往回走 = 绕到最后一个
    await page.getByRole('button', { name: '上一个' }).click()
    expect((await 命中数(page).textContent())!.trim()).toBe(`${总数} / ${总数}`)
  })

  test('回车 = 下一个，Shift+回车 = 上一个', async ({ open, page }) => {
    await open()
    await 打开查找(page)
    await 查(page, '标题')

    await page.keyboard.press('Enter')
    expect((await 命中数(page).textContent())!.trim()).toMatch(/^2 \/ \d+$/)

    await page.keyboard.press('Shift+Enter')
    expect((await 命中数(page).textContent())!.trim()).toMatch(/^1 \/ \d+$/)
  })

  test('没有命中时说「无匹配」——静悄悄什么都没发生最糟', async ({ open, page }) => {
    await open()
    await 打开查找(page)
    await 查(page, '这几个字哪儿都没有')

    await expect(命中数(page)).toHaveText('无匹配')
    expect(await 高亮(page).count()).toBe(0)
    // 前后两个按钮这时按不动
    await expect(page.getByRole('button', { name: '下一个' })).toBeDisabled()
  })

  test('Esc 关掉，正文里的高亮跟着一起清掉', async ({ open, page }) => {
    await open()
    await 打开查找(page)
    await 查(page, '标题')
    expect(await 高亮(page).count()).toBeGreaterThan(0)

    await page.keyboard.press('Escape')

    await expect(查找输入框(page)).toHaveCount(0)
    expect(await 高亮(page).count(), '查找条关了，正文里的高亮还在').toBe(0)
    expect(await page.getByRole('button', { name: '搜索', exact: true }).getAttribute('aria-pressed')).toBe('false')
  })

  test('再点一次工具栏那个按钮，同样关掉并清干净', async ({ open, page }) => {
    await open()
    await 打开查找(page)
    await 查(page, '标题')

    await page.getByRole('button', { name: '搜索', exact: true }).click()

    await expect(查找输入框(page)).toHaveCount(0)
    expect(await 高亮(page).count(), '关掉之后高亮没清').toBe(0)
  })

  test('查找条自己占一行，在工具栏下面，不压住正文', async ({ open, page }) => {
    await open()
    await 打开查找(page)

    const 位置 = await page.evaluate(() => {
      const 条 = document.querySelector('input[placeholder="在本文中查找"]')!.closest('div')!
      const 工具栏 = document.querySelector('[data-editor-toolbar]')!
      const 正文 = document.querySelector('.cm-content')!
      return {
        条上: Math.round(条.getBoundingClientRect().top),
        栏下: Math.round(工具栏.getBoundingClientRect().bottom),
        正文上: Math.round(正文.getBoundingClientRect().top),
        条下: Math.round(条.getBoundingClientRect().bottom),
      }
    })

    expect(位置.条上, '查找条没有紧贴在工具栏下面').toBe(位置.栏下)
    expect(位置.条下, '查找条压到正文上面了').toBeLessThanOrEqual(位置.正文上)
  })
})
