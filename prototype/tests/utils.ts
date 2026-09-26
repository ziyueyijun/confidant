/** 颜色与几何的小工具——测试要断言「看得见」，就得自己算对比度。 */

export function parseRgb(s: string): [number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(s)
  if (!m) throw new Error(`不是颜色值: ${s}`)
  const p = m[1].split(',').map((x) => Number.parseFloat(x.trim()))
  return [p[0], p[1], p[2]]
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** `#151414` → `[21, 20, 20]`。读 CSS 变量时拿到的是十六进制，得先转一手。 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`不是十六进制颜色: ${hex}`)
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG 对比度，1:1 – 21:1。正文阈值 4.5，大字/图形 3。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseRgb(a))
  const lb = relativeLuminance(parseRgb(b))
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** 两个矩形在竖直方向上是否相接（允许 0.5px 误差）。 */
export function verticallyAdjacent(
  a: { top: number; bottom: number },
  b: { top: number; bottom: number },
): boolean {
  return Math.abs(a.bottom - b.top) < 0.5 || Math.abs(b.bottom - a.top) < 0.5
}
