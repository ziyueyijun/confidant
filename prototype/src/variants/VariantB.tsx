import { useState } from 'react'
import { NOTES } from '../data'
import { MarkdownEditor } from '../editor/MarkdownEditor'
import type { SyntaxReveal } from '../editor/markdownLivePreview'

interface Props {
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  onCapture: () => void
  currentPath: string
  onSelect: (path: string) => void
}

/**
 * 变体 B：单栏 + 命令面板。
 *
 * 结构上刻意与 A 不同——**没有常驻的侧边栏**，没有笔记列表。
 * 整个界面只有一篇笔记，其他一切通过一个搜索框触达。
 *
 * 论据：优先级排序是「捕捉 > 日记 > 检索 > 长文写作」。
 * 既然检索排第三、而列表浏览根本没进排序，那就该让搜索成为主入口，
 * 而不是让用户先学会"这篇该放哪个文件夹"。
 *
 * 代价（要观察的）：你会不会因此"找不到东西"？
 * 目录树提供的是空间记忆，去掉它，人靠什么定位？
 */
export function VariantB({ reveal, sourceMode, renderTables, onCapture, currentPath, onSelect  }: Props) {
  const current = NOTES.find((n) => n.path === currentPath) ?? NOTES[0]
  const [query, setQuery] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)

  const results = query
    ? NOTES.filter(
        (n) => n.title.includes(query) || n.body.includes(query) || n.tags.some((t) => t.includes(query)),
      )
    : NOTES

  return (
    <div className="relative flex h-full flex-col bg-white">
      {/* 顶栏：只有路径与搜索 */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-6 py-2.5">
        <span className="truncate text-xs text-slate-400">{current.path}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPaletteOpen(true)
              }}
              onFocus={() => setPaletteOpen(true)}
              onBlur={() => setTimeout(() => setPaletteOpen(false), 150)}
              placeholder="搜索…"
              className="w-56 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm outline-none focus:border-blue-400 focus:bg-white"
            />
            {paletteOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {results.length === 0 && (
                  <div className="px-3 py-2.5 text-sm text-slate-400">没有匹配的笔记</div>
                )}
                {results.map((n) => (
                  <button
                    key={n.path}
                    onMouseDown={() => {
                      onSelect(n.path)
                      setPaletteOpen(false)
                      setQuery('')
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="truncate text-sm text-slate-800">{n.title}</div>
                    <div className="truncate text-xs text-slate-400">{n.path}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onCapture}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            捕捉
          </button>
        </div>
      </header>

      {/* 正文：居中单栏，宽度比 A 更窄（更接近阅读） */}
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[38rem] px-8 py-12">
          <MarkdownEditor
            key={current.path}
            initialDoc={current.body}
            reveal={reveal}
            sourceMode={sourceMode}
              renderTables={renderTables}
          />
        </div>
      </main>

      {/* 底部：一行极简状态，不抢注意力 */}
      <footer className="flex items-center gap-4 border-t border-slate-100 px-6 py-1.5 text-xs text-slate-300">
        <span>Ctrl+K 搜索</span>
        <span>Ctrl+Shift+Space 捕捉</span>
        <span className="ml-auto">已同步</span>
      </footer>
    </div>
  )
}
