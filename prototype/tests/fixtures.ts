import { test as base, expect, type Page } from '@playwright/test'

/**
 * 原型的测试夹具。
 *
 * 原型只有一个界面、数据全在内存里、没有网络——夹具只做三件事：
 * 打开页面并载入「语法全集」、把控制条上的实验变量拨到指定状态、
 * 给编辑器留一个稳定的操作入口（读文档、放光标、读光标）。
 *
 * 光标位置一律通过 `window.__cmDebug.view` 读写：它由 markdownLivePreview
 * 模块挂出，是编辑器状态的**唯一真相**，比数 DOM 节点稳。
 */

export interface EditorFixture {
  /** 编辑器根节点 */
  root: ReturnType<Page['locator']>
  /** 可编辑正文区 */
  content: ReturnType<Page['locator']>
  /** 当前文档全文 */
  text: () => Promise<string>
  /** 第 line 行（1-based）的原文 */
  lineText: (line: number) => Promise<string>
  /** 把光标放到第 line 行（1-based）的第 charOffset 个字符处 */
  placeCursor: (line: number, charOffset?: number) => Promise<void>
  /** 光标当前行号（1-based） */
  cursorLine: () => Promise<number>
  /** 光标在当前行内的列（0-based） */
  cursorCol: () => Promise<number>
  /** 光标所在的文档位置 */
  cursorPos: () => Promise<number>
  /** 选中 [from, to) 区间 */
  select: (from: number, to: number) => Promise<void>
  /** 在编辑器内按键 */
  press: (key: string, times?: number) => Promise<void>
  /** 在编辑器内输入文本 */
  type: (text: string) => Promise<void>
}

export interface PrototypeFixture {
  /** 打开原型并载入语法全集 */
  open: () => Promise<void>
  editor: EditorFixture
  /** 拨动控制条上的开关（按钮文案） */
  toggle: (label: string) => Promise<void>
  /** 切主题 */
  theme: (t: 'light' | 'dark') => Promise<void>
  /** 当前主题 */
  currentTheme: () => Promise<'light' | 'dark'>
}

const controlBar = (page: Page) => page.locator('.fixed.bottom-11')

export const test = base.extend<PrototypeFixture>({
  open: async ({ page }, use) => {
    await use(async () => {
      await page.goto('/?reveal=never')
      // 禁掉过渡。界面里有 `transition-colors`（150ms），切主题时 color /
      // background 都在过渡中——测试若在这期间读样式，拿到的是**起始值**，
      // 对比度断言会假红（实测：按钮读到浅色的 rgb(106,98,89)，400ms 后才是
      // 深色的 rgb(166,158,148)）。断言要的是最终值，不是动画中间帧。
      await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
      })
      await page.getByRole('button', { name: '语法全集' }).first().click()
      await expect(page.locator('.cm-content')).toBeVisible()
    })
  },

  /** 把 scroller 滚到指定位置，让虚拟滚动把对应位置的 widget/行渲染到 DOM */
  scrollTo: async ({ page }, use) => {
    await use(async (scrollTop: number) => {
      await page.evaluate((top) => {
        const scroller = document.querySelector('.cm-scroller') as HTMLElement | null
        if (scroller) scroller.scrollTop = top
      }, scrollTop)
      await page.waitForTimeout(150)
    })
  },

  editor: async ({ page }, use) => {
    const root = page.locator('.cm-editor')
    const content = page.locator('.cm-content')

    const api: EditorFixture = {
      root,
      content,

      text: () =>
        page.evaluate(() => (window as any).__cmDebug?.view?.state.doc.toString() ?? ''),

      lineText: (line) =>
        page.evaluate((n) => (window as any).__cmDebug.view.state.doc.line(n).text, line),

      placeCursor: async (line, charOffset = 0) => {
        await page.evaluate(
          ({ line, charOffset }) => {
            const view = (window as any).__cmDebug.view
            const target = view.state.doc.line(line)
            view.dispatch({ selection: { anchor: Math.min(target.from + charOffset, target.to) } })
            view.focus()
          },
          { line, charOffset },
        )
      },

      cursorLine: () =>
        page.evaluate(() => {
          const view = (window as any).__cmDebug.view
          return view.state.doc.lineAt(view.state.selection.main.head).number
        }),

      cursorCol: () =>
        page.evaluate(() => {
          const view = (window as any).__cmDebug.view
          const head = view.state.selection.main.head
          return head - view.state.doc.lineAt(head).from
        }),

      cursorPos: () =>
        page.evaluate(() => (window as any).__cmDebug.view.state.selection.main.head),

      select: async (from, to) => {
        await page.evaluate(
          ({ from, to }) => {
            const view = (window as any).__cmDebug.view
            view.dispatch({ selection: { anchor: from, head: to } })
            view.focus()
          },
          { from, to },
        )
      },

      press: async (key, times = 1) => {
        for (let i = 0; i < times; i++) await page.keyboard.press(key)
      },

      type: async (text) => {
        await page.keyboard.type(text)
      },
    }

    await use(api)
  },

  toggle: async ({ page }, use) => {
    await use(async (label: string) => {
      await controlBar(page).getByRole('button', { name: label, exact: true }).click()
    })
  },

  theme: async ({ page }, use) => {
    await use(async (t) => {
      const isDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      )
      if ((t === 'dark') !== isDark) {
        await controlBar(page).getByRole('button', { name: /深色|浅色/ }).click()
      }
      await expect(page.locator('html')).toHaveClass(t === 'dark' ? /dark/ : /^(?!.*dark)/)
    })
  },

  currentTheme: async ({ page }, use) => {
    await use(async () =>
      (await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      ))
        ? 'dark'
        : 'light',
    )
  },
})

export { expect }
