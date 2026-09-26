import { useEffect, useRef, useState } from 'react'
import type { EditorApi } from './MarkdownEditor'
import { IconChevronDown, IconChevronUp, IconSearch } from '../icons'

/**
 * 在本文中查找的查找条。
 *
 * **长在编辑器工具栏下面一行**，不是浮在正文角上的一小块：它和工具栏、
 * 语法标记那三个按钮是同一条流程上的东西（都是"对这篇正文做什么"），
 * 摆在同一条竖线上读起来是一件事。浮层要自己管位置、遮挡与关闭，
 * 而这里没有一条理由需要它浮起来。
 *
 * 打开就聚焦、Esc 就散——与全局搜索面板同一个手感。
 */
export function FindBar({ getApi, onClose }: { getApi: () => EditorApi | null; onClose: () => void }) {
  const [raw, setRaw] = useState('')
  const [status, setStatus] = useState<{ index: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 点按钮打开就能直接打字，不必再点一下输入框
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /**
   * 边打边查。
   *
   * 敲进一个词之后**自动跳到第一处**（光标本来就在某处命中上时不动）——
   * 不然打了字正文毫无反应，用户不知道是没找到还是没生效。
   * 与浏览器里的 Ctrl+F 是同一条规矩。
   */
  useEffect(() => {
    const api = getApi()
    if (!api) return
    api.setFindQuery(raw)
    if (raw && api.findStatus()?.index === 0) api.findNext()
    setStatus(api.findStatus())
  }, [raw, getApi])

  /** 上一个 / 下一个。焦点留在输入框里——用户多半还要接着改词。 */
  const 走 = (dir: 'next' | 'prev') => {
    const api = getApi()
    if (!api) return
    dir === 'next' ? api.findNext() : api.findPrev()
    setStatus(api.findStatus())
  }

  return (
    <div
      /* 30px 高，与它上面那条编辑器工具栏同一个数——两条紧挨着的横栏
         不一样高的话，看起来像谁没对齐。
         **不画下边框**：它和工具栏、正文都是同一个面色（--surface-center），
         三者连成一片；查找条属于这一页，不属于"框"。 */
      className="flex min-h-[30px] shrink-0 items-center gap-2 px-3"
      style={{ backgroundColor: 'var(--surface-center)' }}
    >
      <IconSearch
        size={14}
        className="shrink-0"
        style={{ color: 'var(--content-muted)' }}
      />

      <input
        ref={inputRef}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            走(e.shiftKey ? 'prev' : 'next')
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder="在本文中查找"
        aria-label="在本文中查找"
        className="w-56 shrink-0 bg-transparent text-xs outline-none"
        style={{ color: 'var(--content-primary)' }}
      />

      {/* 命中数。**没有命中时也要说话**——静悄悄什么都没发生，
          用户分不清是"没有"还是"没生效"。 */}
      {raw !== '' && (
        <span
          data-find-status
          className="shrink-0 text-[11px]"
          style={{ color: status?.total === 0 ? 'var(--accent)' : 'var(--content-muted)' }}
        >
          {status === null || status.total === 0
            ? '无匹配'
            : status.index > 0
              ? `${status.index} / ${status.total}`
              : `${status.total} 处`}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <FindButton label="上一个" disabled={!status?.total} onClick={() => 走('prev')}>
          <IconChevronUp size={14} />
        </FindButton>
        <FindButton label="下一个" disabled={!status?.total} onClick={() => 走('next')}>
          <IconChevronDown size={14} />
        </FindButton>
      </div>

      <div className="ml-auto" />

      <button
        onClick={onClose}
        title="关闭查找"
        aria-label="关闭查找"
        className="shrink-0 rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--content-muted)' }}
      >
        关闭
      </button>
    </div>
  )
}

/**
 * 上一个 / 下一个。
 *
 * `onMouseDown` 里 preventDefault：**不让按钮把焦点从输入框抢走**——
 * 点一下"下一个"之后还要接着改词，是这里的常规用法。
 */
function FindButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-hover)]"
      style={{ color: disabled ? 'var(--content-muted)' : 'var(--content-secondary)' }}
    >
      {children}
    </button>
  )
}

