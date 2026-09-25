/**
 * 表格 markdown 解析器
 */
export interface ParsedTable {
  headers: string[]
  aligns: Array<'left' | 'center' | 'right' | null>
  rows: string[][]
}

/** 把 Markdown 表格文本解析成结构。解析失败返回 null。 */
export function parseTable(lines: string[]): ParsedTable | null {
  if (lines.length < 2) return null
  const split = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())

  const headers = split(lines[0])
  const sep = split(lines[1])
  if (!sep.every((c) => /^:?-{1,}:?$/.test(c))) return null

  const aligns = sep.map((c) => {
    const l = c.startsWith(':')
    const r = c.endsWith(':')
    if (l && r) return 'center'
    if (r) return 'right'
    if (l) return 'left'
    return null
  })

  const rows = lines.slice(2).map(split)
  if (rows.length === 0) return null
  return { headers, aligns, rows }
}
