import { test, expect } from './fixtures'

/**
 * 光标行为：上下左右移动、跨块进出、以及「光标乱跳」。
 *
 * 这一组全是用户实测报上来的问题（#1 光标乱跳、#6 从代码块向上会跳过列表）。
 * 断言的是**行号序列**，不是像素——行号是用户能感知的「跳没跳」。
 */

test.describe('光标导航 @cursor', () => {
  test('↑ 从代码块顶部应逐行经过有序列表、无序列表、任务列表（#6）', async ({ open, editor }) => {
    await open()

    // 第 37 行是 ```javascript（代码块开头）
    await editor.placeCursor(37, 0)
    const trail: number[] = []
    for (let i = 0; i < 14; i++) {
      trail.push(await editor.cursorLine())
      await editor.press('ArrowUp')
    }

    // 从 37 往上，必须**逐行**经过 36,35,34,33,32,31,30,29,28,27,26,25 —— 一行都不能跳
    for (let expected = 37; expected >= 25; expected--) {
      expect(trail, `光标跳过了第 ${expected} 行，实际轨迹 ${trail.join(' -> ')}`).toContain(
        expected,
      )
    }

    // 且顺序必须是严格递减的
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i]).toBeLessThanOrEqual(trail[i - 1])
    }
  })

  test('↑ 从任务列表顶部逐行经过嵌套列表与空行', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(34, 0)

    const trail: number[] = []
    for (let i = 0; i < 12; i++) {
      trail.push(await editor.cursorLine())
      await editor.press('ArrowUp')
    }

    for (let expected = 34; expected >= 23; expected--) {
      expect(trail, `跳过了第 ${expected} 行：${trail.join(' -> ')}`).toContain(expected)
    }
  })

  test('↓ 从列表向下逐行经过空行与代码块', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(25, 0)

    const trail: number[] = []
    for (let i = 0; i < 14; i++) {
      trail.push(await editor.cursorLine())
      await editor.press('ArrowDown')
    }

    for (let expected = 25; expected <= 38; expected++) {
      expect(trail, `跳过了第 ${expected} 行：${trail.join(' -> ')}`).toContain(expected)
    }
  })

  test('↑ 进入引用块内部时逐行停留', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(22, 0) // 引用块下面那行

    const trail: number[] = []
    for (let i = 0; i < 6; i++) {
      trail.push(await editor.cursorLine())
      await editor.press('ArrowUp')
    }

    for (const expected of [22, 21, 20, 19, 18, 17]) {
      expect(trail, `引用块内跳行：${trail.join(' -> ')}`).toContain(expected)
    }
  })

  test('↑/↓ 在表格内部按行移动，到边界才离开表格', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(52, 0)

    const table = editor.content.locator('.cm-md-table')
    const header = table.locator('[data-row="0"][data-col="0"]')
    await header.click()
    await expect(header).toBeFocused()

    // ↓ 走到第一数据行
    await editor.press('ArrowDown')
    await expect(table.locator('[data-row="1"][data-col="0"]')).toBeFocused()

    // ↑ 回到表头
    await editor.press('ArrowUp')
    await expect(header).toBeFocused()

    // 表头再 ↑ 应当离开表格，落到表格上方的行
    await editor.press('ArrowUp')
    const line = await editor.cursorLine()
    expect(line, '表头按 ↑ 没有离开表格').toBeLessThan(52)
  })

  test('光标移动时不会「乱跳」——连续按 ↓ 的行号单调不减（#1）', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(1, 0)

    const trail: number[] = []
    for (let i = 0; i < 30; i++) {
      trail.push(await editor.cursorLine())
      await editor.press('ArrowDown')
    }

    for (let i = 1; i < trail.length; i++) {
      expect(
        trail[i],
        `光标回跳了：${trail.join(' -> ')}`,
      ).toBeGreaterThanOrEqual(trail[i - 1])
    }
  })

  test('点击某一行，光标落在该行', async ({ open, editor }) => {
    await open()
    await editor.placeCursor(1)

    // 点「引用可以有多行」那一行
    const target = editor.content.locator('.cm-line').nth(17)
    await target.click()
    expect(await editor.cursorLine()).toBe(18)
  })
})
