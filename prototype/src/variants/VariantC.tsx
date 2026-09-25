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
 * 变体 C：时间流 + 抽屉。
 *
 * 结构上与前两个都不同——**笔记不是主体，时间是主体**。
 * 左栏是一条按时间排的流（像 flomo / 日记），点开某条就在右侧展开编辑。
 *
 * 论据：优先级第一位是**捕捉**、第二位是**日记**——两个都和时间强相关，
 * 而"整理成文件树"根本不在优先级里。
 *
 * 代价（要观察的）：长文写作在这种形态下会不会很难受？
 * 以及：当你有三百条而不是三条时，这条流还看得清吗？
 */
export function VariantC({ reveal, sourceMode, renderTables, onCapture, currentPath, onSelect  }: Props) {
  const current = NOTES.find((n) => n.path === currentPath) ?? NOTES[0]
  const 按时间 = [...NOTES].sort((a, b) => (a.created < b.created ? 1 : -1))

  return (
    <div className="flex h-full bg-white">
      {/* 左：时间流 */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">最近</span>
          <button
            onClick={onCapture}
            className="ml-auto rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            捕捉
          </button>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          {按时间.map((n) => {
            const active = n.path === current.path
            return (
              <button
                key={n.path}
                onClick={() => onSelect(n.path)}
                className={`mb-1 block w-full rounded-lg px-3 py-2.5 text-left transition ${
                  active ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs tabular-nums text-slate-400">{n.created.slice(5)}</span>
                  <span className="truncate text-sm font-medium text-slate-800">{n.title}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {n.body.replace(/[#*`>|-]/g, '').slice(0, 60)}
                </div>
                {n.tags.length > 0 && (
                  <div className="mt-1.5 flex gap-1">
                    {n.tags.map((t) => (
                      <span key={t} className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </aside>

      {/* 右：展开的编辑区 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-3 border-b border-slate-200 px-8 py-3">
          <h1 className="text-lg font-semibold text-slate-800">{current.title}</h1>
          <span className="text-xs text-slate-400">{current.created}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-[44rem] px-8 py-8">
            <MarkdownEditor
              key={current.path}
              initialDoc={current.body}
              reveal={reveal}
              sourceMode={sourceMode}
              renderTables={renderTables}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
