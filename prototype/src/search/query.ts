/**
 * 查询的解析与匹配。
 *
 * **这是原型的替身。** 真机上这一步走 FTS5 逐字索引 + refine（spec §5.1 / §5.2），
 * 这里直接在内存里那几篇笔记上做子串匹配。要验证的是**交互**——边打边搜的
 * 手感、操作符好不好用、结果怎么排、命中怎么高亮——不是索引的性能。
 *
 * 有一条不是替身：**语法错误不报错，按字面搜索**（spec §5.5）。这是行为约定，
 * 不是实现细节，所以这里就照做——认不出的 `tag:读书` 当成那几个字符去搜。
 */
import type { Note } from '../data'

// ---------------------------------------------------------------- 解析

interface Term {
  text: string
  /** 只搜标题（`title:xxx`） */
  titleOnly: boolean
}

export interface Query {
  terms: Term[]
  /** `path:xxx`——路径里必须含这段 */
  pathInclude: string[]
  /** `-path:xxx`——路径里含这段的整个排除掉 */
  pathExclude: string[]
}

/**
 * 把输入切成词。
 *
 * 引号里的整段算一个词（`"知识 管理"` 是一个短语，不是两个词）——不切的话
 * 短语就没法表达。未闭合的引号按普通字符处理，不报错。
 */
function tokenize(raw: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false

  for (const ch of raw) {
    if (ch === '"') {
      quoted = !quoted
      cur += ch
    } else if (!quoted && /\s/.test(ch)) {
      if (cur) out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur) out.push(cur)
  return out
}

/** 去掉短语两端的引号。`"知识 管理"` → `知识 管理` */
function unquote(s: string): string {
  return s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1) : s
}

/**
 * 解析成结构化查询。
 *
 * 只认三个操作符：`title:` / `path:` / `-path:`。**认不出的一律当普通词**——
 * 见文件头的说明。
 */
export function parseQuery(raw: string): Query {
  const q: Query = { terms: [], pathInclude: [], pathExclude: [] }

  for (const tok of tokenize(raw.trim())) {
    if (tok.startsWith('-path:') && tok.length > 6) {
      q.pathExclude.push(unquote(tok.slice(6)))
    } else if (tok.startsWith('path:') && tok.length > 5) {
      q.pathInclude.push(unquote(tok.slice(5)))
    } else if (tok.startsWith('title:') && tok.length > 6) {
      q.terms.push({ text: unquote(tok.slice(6)), titleOnly: true })
    } else {
      q.terms.push({ text: unquote(tok), titleOnly: false })
    }
  }

  return q
}

// ---------------------------------------------------------------- 匹配

export interface Hit {
  path: string
  title: string
  /**
   * 这一条**为什么**进来。排序用：标题命中 > 正文命中（spec §5.5）。
   *
   * `path` 是第三种：`path:技术/待整理` 这种**只有筛选、没有词**的查询。
   * 它不假装是标题命中——那个徽章会误导人（标题里根本没这个词）。
   */
  on: 'title' | 'body' | 'path'
  /** 选中后滚到哪一行（0-based）。标题命中回笔记开头，正文命中回那一行 */
  line: number
  /** 预览那一行的原文 */
  text: string
  /** 标题上的高亮区间——标题命中时才有 */
  titleRanges: [number, number][]
  /** `text` 那一行上的高亮区间——正文命中时才有 */
  ranges: [number, number][]
}

/** 整个列表最多几行——再多也看不完，还拖慢渲染 */
const 总数上限 = 60

/** 找 needle 在 hay 里出现的所有位置（忽略大小写）。中文不受影响，英文有用。 */
function findRanges(hay: string, needle: string): [number, number][] {
  if (!needle) return []
  const h = hay.toLowerCase()
  const n = needle.toLowerCase()
  const out: [number, number][] = []
  let i = h.indexOf(n)
  while (i !== -1) {
    out.push([i, i + needle.length])
    i = h.indexOf(n, i + needle.length)
  }
  return out
}

/**
 * 按起点排序并合并重叠区间。
 *
 * 不合并的话，两个词命中同一段（搜「知识 识别」而原文是「知识识别」）会产出
 * 两个压在一起的区间——渲染出来是两层 `<mark>`，颜色叠一次，看起来比别处深。
 */
function 合并(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/**
 * 在整篇笔记里搜。**一篇笔记最多出一行。**
 *
 * 一行而不是「每个命中行一行」：搜索列表在这里的作用是**找到哪一篇**，
 * 而 spec §5.5 的排序（标题命中 > 正文命中）说的也是篇，不是行。一篇笔记
 * 命中十次就列十行的话，两三篇就把整个列表占满，反而看不出还有别的笔记。
 * 想看全部命中，跳过去在正文里看——那里本来就有。
 *
 * 逐字子串匹配 = 真机上「相邻字短语」的等价物（spec §5.1），所以中文的
 * 召回行为跟真机一致；英文的边界行为（子串也会命中）跟真机不同，但那不是
 * 这一票要看的东西。
 */
export function search(notes: Note[], raw: string): Hit[] {
  const q = parseQuery(raw)
  if (q.terms.length === 0 && q.pathInclude.length === 0) return []

  const hits: Hit[] = []

  for (const note of notes) {
    const lowerPath = note.path.toLowerCase()
    if (q.pathExclude.some((p) => lowerPath.includes(p.toLowerCase()))) continue
    if (q.pathInclude.some((p) => !lowerPath.includes(p.toLowerCase()))) continue

    // 每个词都要有：标题或正文里找得到就算有（titleOnly 的只在标题里找）
    const titleRanges: [number, number][] = []
    let allMatched = true

    for (const t of q.terms) {
      const inTitle = findRanges(note.title, t.text)
      if (inTitle.length > 0) {
        titleRanges.push(...inTitle)
        continue
      }
      if (t.titleOnly || !note.body.toLowerCase().includes(t.text.toLowerCase())) {
        allMatched = false
        break
      }
    }
    if (!allMatched) continue

    const lines = note.body.split('\n')
    const 首行 = lines.find((l) => l.trim() !== '') ?? ''

    // ⓪ 只有筛选、没有词（`path:技术/待整理`）——列出这一路径下的全部笔记。
    //    不列的话这种查询会返回空，而它明明是个合理的问法。
    if (q.terms.length === 0) {
      hits.push({
        path: note.path,
        title: note.title,
        on: 'path',
        line: 0,
        text: 首行,
        titleRanges: [],
        ranges: [],
      })
      continue
    }

    // ① 标题命中——它排在正文命中前面，预览给笔记的**第一行非空内容**当上下文
    //    （不标高亮：高亮在标题上，正文这行没命中），点进去回到笔记开头
    if (titleRanges.length > 0) {
      hits.push({
        path: note.path,
        title: note.title,
        on: 'title',
        line: 0,
        text: 首行,
        titleRanges: 合并(titleRanges),
        ranges: [],
      })
      continue
    }

    // ② 正文命中——预览给**第一处命中**那一行，点进去就跳到它
    for (let i = 0; i < lines.length; i++) {
      const ranges: [number, number][] = []
      for (const t of q.terms) {
        if (t.titleOnly) continue
        ranges.push(...findRanges(lines[i], t.text))
      }
      if (ranges.length === 0) continue

      hits.push({
        path: note.path,
        title: note.title,
        on: 'body',
        line: i,
        text: lines[i],
        titleRanges: [],
        ranges: 合并(ranges),
      })
      break
    }
  }

  // 标题命中 > 正文命中；同一档里按路径——顺序稳定，上下键才敢按。
  // （`path` 那一档只在「只有筛选、没有词」时出现，不会跟另外两档混在一起，
  //   排最后只是给个确定的位置。）
  const 档位 = { title: 0, body: 1, path: 2 } as const
  hits.sort((a, b) => {
    if (a.on !== b.on) return 档位[a.on] - 档位[b.on]
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  })

  return hits.slice(0, 总数上限)
}
