/**
 * 表格 markdown 的解析、序列化与结构操作。
 *
 * **这个模块只做纯函数**：进一个 `ParsedTable`，出一个新的 `ParsedTable`，
 * 不碰 DOM、不碰 CodeMirror。行列的增删是「表格」这件事本身的性质，
 * 不是渲染的性质——放在这里才能单独推敲，也才不会被 widget 的生命周期牵连。
 *
 * 行的坐标：`headers` 是表头，`rows[0]` 是第一条数据行。**表头不在 `rows` 里**，
 * 因为它在 Markdown 里是必须存在、且只能有一行的那一行。
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

  // 数据行可以为空——只有表头 + 分隔行也是合法的 GFM 表格。
  // 若在这里返回 null，用户把数据行删光后表格会掉回源码形态，就再也点不回来。
  const rows = lines.slice(2).map(split)
  return { headers, aligns, rows }
}

/** 对齐标记 → 分隔行里的写法。 */
function alignToSep(a: 'left' | 'center' | 'right' | null): string {
  if (a === 'center') return ':---:'
  if (a === 'right') return '---:'
  if (a === 'left') return ':---'
  return '---'
}

/**
 * 结构 → Markdown 行。
 *
 * 顺带把**参差不齐的行补齐**：源码里 `| a | b |` 只有两格、表头有三格是常见的手写
 * 结果，补齐后结构才自洽（否则加一列时短行会跟着错位）。
 */
export function serializeTable(t: ParsedTable): string[] {
  const cols = t.headers.length
  const pad = (cells: string[]) => {
    const c = cells.map((x) => x.replace(/[\r\n]+/g, ' '))
    while (c.length < cols) c.push('')
    return c.slice(0, cols)
  }
  const row = (cells: string[]) => '| ' + pad(cells).join(' | ') + ' |'
  return [
    row(t.headers),
    '| ' + t.aligns.map(alignToSep).join(' | ') + ' |',
    ...t.rows.map(row),
  ]
}

/**
 * 在 `at` 处插入 `count` 条空数据行（`at === rows.length` 即追加到末尾）。
 *
 * 单条插入是 `count === 1` 的特例——两条路径共用一份实现，免得「插入一行」
 * 和「插入多行」在边界上（比如行数不足时的补齐）各有一套行为。
 */
export function insertTableRows(t: ParsedTable, at: number, count: number): ParsedTable {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return t
  const rows = [...t.rows]
  // 每条都新建一个数组：共享同一个数组引用在内容相同的时候看不出问题，
  // 但一旦以后有人就地改某一行，另一行会跟着变。
  rows.splice(at, 0, ...Array.from({ length: n }, () => t.headers.map(() => '')))
  return { ...t, rows }
}

/** 在 `at` 处插入一条空数据行。 */
export function insertTableRow(t: ParsedTable, at: number): ParsedTable {
  return insertTableRows(t, at, 1)
}

/** 删掉 `rows[at]`。表头删不掉——它不在 `rows` 里，这是结构上就杜绝了。 */
export function deleteTableRow(t: ParsedTable, at: number): ParsedTable {
  const rows = [...t.rows]
  rows.splice(at, 1)
  return { ...t, rows }
}

/**
 * 在 `at` 处插入 `count` 列。表头、对齐、每一条数据行都要跟着长。
 *
 * 数据行比表头短是手写的常见结果（`| a | b |` 对三列表头），
 * 所以这里先补齐到表头宽度再插——否则短行会插错位置。
 */
export function insertTableColumns(t: ParsedTable, at: number, count: number): ParsedTable {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return t
  const blanks = Array.from({ length: n }, () => '')
  const headers = [...t.headers]
  headers.splice(at, 0, ...blanks)
  const aligns = [...t.aligns]
  aligns.splice(at, 0, ...Array.from({ length: n }, () => null as null))
  return {
    headers,
    aligns,
    rows: t.rows.map((r) => {
      const cells = [...r]
      while (cells.length < t.headers.length) cells.push('')
      cells.splice(at, 0, ...blanks)
      return cells
    }),
  }
}

/** 在 `at` 处插入一列。 */
export function insertTableColumn(t: ParsedTable, at: number): ParsedTable {
  return insertTableColumns(t, at, 1)
}

/** 删掉第 `at` 列。剩最后一列时不动——没有列的表格不存在。 */
export function deleteTableColumn(t: ParsedTable, at: number): ParsedTable {
  if (t.headers.length <= 1) return t
  const headers = [...t.headers]
  headers.splice(at, 1)
  const aligns = [...t.aligns]
  aligns.splice(at, 1)
  return {
    headers,
    aligns,
    rows: t.rows.map((r) => {
      const cells = [...r]
      cells.splice(at, 1)
      return cells
    }),
  }
}

/**
 * 工具栏「插入表格」用的骨架。
 *
 * `rows` 数的是**渲染后看得见的行，含表头**——所以 `rows = 4` 给出的是
 * 表头 + 3 条数据行。Markdown 表格的表头是必需的，不把它算进去的话
 * 用户看到的行数会和参数对不上。
 */
export function tableSkeleton(rows = 4, cols = 3): string {
  const body = Math.max(1, rows - 1)
  const header = '| ' + Array.from({ length: cols }, (_, i) => `列 ${i + 1}`).join(' | ') + ' |'
  const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |'
  const empty = '| ' + Array.from({ length: cols }, () => '').join(' | ') + ' |'
  return [header, sep, ...Array.from({ length: body }, () => empty)].join('\n')
}
