/**
 * 大纲组件。
 * 从 markdown 文本提取 ATX 标题（# ## ###），渲染为可点击的导航列表。
 *
 * 原型用 regex 提取（不依赖 CodeMirror），内容变化时不自动更新——
 * 生产阶段应改用 syntaxTree 或 watchEffect 实时同步。
 */
import { useRef, useState } from 'react'

interface Heading {
  level: number  // 1 | 2 | 3
  text: string
  line: number   // 0-based 行号
}

function parseHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  markdown.split('\n').forEach((line, idx) => {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].replace(/[`*_]/g, '').trim(),
        line: idx,
      })
    }
  })
  return headings
}

interface Props {
  /** 当前笔记的 markdown 正文 */
  body: string
  /** 点击标题时调用，参数是 0-based 行号 */
  onJump?: (line: number) => void
}

export function Outline({ body, onJump }: Props) {
  const headings = parseHeadings(body)
  const [active, setActive] = useState<number>(0)
  const listRef = useRef<HTMLUListElement>(null)

  // body 现在会随打字实时变化，所以不能拿它当「换了一篇笔记」的信号——
  // 那会在每次击键时把高亮重置回第一条。调用方按 path 改 key 来重挂，
  // 换笔记时 active 自然回到 0。

  if (headings.length === 0) {
    return (
      <aside className="flex w-48 shrink-0 flex-col border-l border-slate-200 bg-slate-50/50">
        <div className="border-b border-slate-200 px-3 py-2">
          <span className="text-xs font-medium tracking-wide text-slate-400">大纲</span>
        </div>
        <div className="flex-1 overflow-auto px-3 py-3">
          <p className="text-xs text-slate-400">无标题</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-48 shrink-0 flex-col border-l border-slate-200 bg-slate-50/50">
      <div className="border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-medium tracking-wide text-slate-400">大纲</span>
      </div>
      <nav className="flex-1 overflow-auto px-1 py-2" ref={listRef}>
        <ul className="space-y-0.5">
          {headings.map((h, i) => (
            <li key={i}>
              <button
                onClick={() => {
                  setActive(i)
                  onJump?.(h.line)
                }}
                className={`block w-full truncate rounded px-2 py-0.5 text-left text-xs transition-colors ${
                  active === i
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                title={h.text}
              >
                {h.text || <span className="italic text-slate-300">无标题</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
