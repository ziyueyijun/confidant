/**
 * 全局搜索——**面板，不是页面**（spec §8：检索是主界面的一个部件）。
 *
 * ## 为什么是浮在正文上方的一块，而不是一个整页
 *
 * 搜索是这类软件里用得最多的地方，它必须**来得快、走得快**：打开、打几个字、
 * 跳过去、没了。做成整页的话，用户每次都要"进入搜索"再"离开搜索"，
 * 而这两步都不产生任何价值。所以它是盖在正文上的一块，Esc 就散。
 *
 * ## 边打边搜
 *
 * 防抖 100ms（spec §5.5）。实测延迟给了充足余量，而多按一次回车是每天都在
 * 付的税。这里没有「搜索中」状态——几篇笔记的内存匹配是瞬时的；真机上只有
 * 命中集极大时才需要（spec §5.5 的大库保险）。
 *
 * ## 结果怎么排
 *
 * **标题命中 > 正文命中**（spec §5.5）。同一档里按路径、再按行号，顺序稳定——
 * 上下键才敢按。真机上还有第三档「引用了命中笔记的」，原型里没有反向链接，
 * 所以没有这一档。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { NOTES } from '../data'
import { search, type Hit } from './query'
import { IconSearch } from '../icons'

export function SearchDialog({
  onClose,
  onOpen,
}: {
  onClose: () => void
  /** 选中一条结果：打开那个文件并滚到那一行 */
  onOpen: (path: string, line: number) => void
}) {
  const [raw, setRaw] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // 防抖 100ms。敲得快的时候不必每一帧都重排一遍结果——那会让列表在
  // 打字过程中反复跳动，反而看不清。
  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw), 100)
    return () => clearTimeout(t)
  }, [raw])

  const hits = useMemo(() => search(NOTES, debounced), [debounced])

  // 换了查询，选中的那条要回到第一条——否则按回车打开的是上一轮的第 5 条
  useEffect(() => setActive(0), [debounced])

  // 上下键走到看不见的地方时，把它滚进视野
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const 打开 = (hit: Hit) => {
    onOpen(hit.path, hit.line)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hits[active]) 打开(hits[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      /* items-start：不加的话 flex 默认 `align-items: stretch` 会把面板拉满整屏，
         只搜到一篇时下面拖着一大片空白。 */
      className="fixed inset-0 z-40 flex items-start justify-center p-6"
      style={{ backgroundColor: 'rgba(26,23,20,0.15)' }}
      onMouseDown={onClose}
    >
      <div
        className="mt-[8vh] flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden shadow-2xl"
        style={{
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--surface-primary)',
          border: '1px solid var(--border-color)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 输入行 */}
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
          <IconSearch className="shrink-0" style={{ color: 'var(--content-muted)' }} />
          <input
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索当前工作空间的全部笔记"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--content-primary)' }}
          />
          {raw && (
            <button
              onClick={() => setRaw('')}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--content-muted)' }}
            >
              清空
            </button>
          )}
        </div>

        {/* 结果。**不撑满**（没有 flex-1）：只搜到一篇时，面板就该是矮的——
            撑到 70vh 的话，一条结果悬在一大片空白上面。
            结果多的时候由外面的 max-h 压住，这里滚动。 */}
        <div ref={listRef} className="min-h-0 overflow-auto">
          {raw.trim() === '' ? (
            <空态 />
          ) : hits.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-xs" style={{ color: 'var(--content-secondary)' }}>
                没有找到「{debounced.trim()}」
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
                不做模糊匹配——打错字时重打一遍，比返回一堆不相关的东西好。
              </div>
            </div>
          ) : (
            hits.map((h, i) => (
              <Row
                key={h.path}
                hit={h}
                active={i === active}
                onHover={() => setActive(i)}
                onClick={() => 打开(h)}
              />
            ))
          )}
        </div>

        {/* 脚注：键盘操作与操作符——**操作符得让人看见**，藏起来的语法等于没有 */}
        <div
          className="flex shrink-0 items-center gap-3 px-4 py-2 text-[11px]"
          style={{ borderTop: '1px solid var(--rule-soft)', backgroundColor: 'var(--surface-secondary)', color: 'var(--content-muted)' }}
        >
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          {hits.length > 0 && <span className="ml-auto">{hits.length} 篇</span>}
        </div>
      </div>
    </div>
  )
}

/** 空查询时看到的东西：操作符说明。 */
function 空态() {
  const 操作符: [string, string][] = [
    ['知识管理', '正文与标题都搜'],
    ['"知识管理"', '短语，必须连在一起'],
    ['知识 管理', '两个词都要有'],
    ['title:周记', '只搜标题'],
    ['path:技术/待整理', '限定路径'],
    ['-path:草稿', '排除路径'],
  ]
  return (
    <div className="px-4 py-4">
      <div className="mb-2.5 text-[11px]" style={{ color: 'var(--content-muted)' }}>
        边打边搜。也能用操作符：
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {操作符.map(([写法, 含义]) => (
          <div key={写法} className="flex items-baseline gap-2.5">
            <code
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]"
              style={{ backgroundColor: 'var(--surface-tertiary)', color: 'var(--content-primary)' }}
            >
              {写法}
            </code>
            <span className="truncate text-[11px]" style={{ color: 'var(--content-muted)' }}>{含义}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 一条结果。
 *
 * 两行：上面是**哪一篇**（标题 + 路径），下面是**哪一行**（原文，命中处高亮）。
 * 少了上面那行就不知道是哪篇，少了下面那行就不知道跳过去能看到什么——
 * 而「跳过去之前先看一眼」正是搜索列表存在的理由。
 */
function Row({
  hit,
  active,
  onHover,
  onClick,
}: {
  hit: Hit
  active: boolean
  onHover: () => void
  onClick: () => void
}) {
  return (
    <button
      /* data-search-row 是给测试用的稳定钩子（同标签栏的 cm-tab-bar）：
         Tailwind 类名组合到处都是，拿它当选择器太脆。
         data-active 标的是**键盘当前选中的那条**，上下键改的就是它。 */
      data-search-row
      data-active={active}
      onMouseMove={onHover}
      onClick={onClick}
      className="block w-full px-4 py-2 text-left transition-colors"
      style={{ backgroundColor: active ? 'var(--surface-hover)' : 'transparent' }}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 truncate text-xs font-medium" style={{ color: 'var(--content-primary)' }}>
          {highlight(hit.title, hit.titleRanges)}
        </span>
        {hit.on === 'title' && (
          <span
            className="shrink-0 rounded px-1 py-px text-[10px]"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            标题命中
          </span>
        )}
        <span className="ml-auto shrink-0 truncate font-mono text-[10px]" style={{ color: 'var(--content-muted)' }}>
          {hit.path}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--content-secondary)' }}>
        {hit.text.trim() !== '' ? (
          highlight(hit.text, hit.ranges)
        ) : hit.on === 'body' ? (
          <span style={{ color: 'var(--content-muted)' }}>（空行）</span>
        ) : null}
      </div>
    </button>
  )
}

/**
 * 把命中处包成 `<mark>`。
 *
 * ⚠️ 高亮区间是在**原文**上算的（见 query.ts）。真机上这条尤其要紧：
 * FTS5 的 `snippet()` / `highlight()` 作用在插了空格的 seg 列上，直接用会
 * 返回「科 学 家」而不是「科学家」（spec §5.2）。
 */
function highlight(text: string, ranges: [number, number][]) {
  if (ranges.length === 0) return text
  const out: React.ReactNode[] = []
  let at = 0
  ranges.forEach(([from, to], i) => {
    if (from > at) out.push(text.slice(at, from))
    out.push(
      <mark key={i} style={{ backgroundColor: 'var(--accent-subtle-hover)', color: 'var(--accent-hover)', borderRadius: 2 }}>
        {text.slice(from, to)}
      </mark>,
    )
    at = to
  })
  if (at < text.length) out.push(text.slice(at))
  return out
}
