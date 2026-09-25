import { useState } from 'react'
import type { EditorApi } from './MarkdownEditor'
import type { SyntaxReveal } from './markdownLivePreview'

/**
 * 编辑器工具栏。
 *
 * 按钮分成四组，中间用竖线隔开——分组是为了让「这一段管什么」一眼看得出来：
 * 1. **块级**：标题、引用、列表、任务、代码块、表格、分割线
 * 2. **行内**：粗体、斜体、删除线、行内代码、链接、图片
 * 3. **格式**：源码格式、清除格式
 * 4. **视图**：语法标记显示方式
 *
 * ## 「源码格式」和「清除格式」不是一回事
 *
 * - **源码格式**（`</>`）：**整个编辑器**切到 Markdown 原文，不做渲染。
 *   它是全局视图开关，不是对选区做手术。
 * - **清除格式**（`Tx`）：把**选区里**的 Markdown 标记去掉，只留文字。
 *   它是对内容做手术，不是换视图。
 *
 * 两者都容易被理解成对方，所以按钮上给了不同的图标与 tooltip。
 */
export function EditorToolbar({
  getApi,
  sourceMode,
  onSourceMode,
  reveal,
  onReveal,
}: {
  /** 按需取编辑器 API——ref 回调晚于首次渲染，直接传值会拿到 null */
  getApi: () => EditorApi | null
  sourceMode: boolean
  onSourceMode: (v: boolean) => void
  reveal: SyntaxReveal
  onReveal: (v: SyntaxReveal) => void
}) {
  const api = getApi

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/70 px-2 py-1">
      {/* ---- 块级 ---- */}
      <Btn label="标题" hint="一级标题（再点一次去掉）" onClick={() => api()?.prefixLines('# ')}>
        <span className="text-[13px] font-semibold">H1</span>
      </Btn>
      <Btn label="标题" hint="二级标题" onClick={() => api()?.prefixLines('## ')}>
        <span className="text-[12px] font-semibold">H2</span>
      </Btn>
      <Btn label="标题" hint="三级标题" onClick={() => api()?.prefixLines('### ')}>
        <span className="text-[11px] font-semibold">H3</span>
      </Btn>

      <Sep />

      <Btn label="引用" hint="引用块" onClick={() => api()?.prefixLines('> ')}>
        <span className="text-[13px]">❝</span>
      </Btn>
      <Btn label="无序列表" hint="项目符号" onClick={() => api()?.prefixLines('- ')}>
        <IconBullet />
      </Btn>
      <Btn label="有序列表" hint="编号列表" onClick={() => api()?.prefixLines('1. ')}>
        <span className="font-mono text-[12px]">1.</span>
      </Btn>
      <Btn label="任务" hint="待办项" onClick={() => api()?.prefixLines('- [ ] ')}>
        <IconCheck />
      </Btn>

      <Sep />

      <Btn label="代码块" hint="围栏代码块" onClick={() => api()?.insert('```\n\n```')}>
        <span className="font-mono text-[12px]">{'{}'}</span>
      </Btn>
      <Btn label="表格" hint="插入表格骨架" onClick={() => api()?.insert('| 列 1 | 列 2 |\n| --- | --- |\n|  |  |')}>
        <IconTable />
      </Btn>
      <Btn label="分割线" hint="水平分隔" onClick={() => api()?.insert('\n---\n')}>
        <span className="text-[13px]">―</span>
      </Btn>

      <Sep />

      {/* ---- 行内 ---- */}
      <Btn label="粗体" hint="Ctrl+B" onClick={() => api()?.wrap('**', '**', '粗体')}>
        <span className="text-[13px] font-bold">B</span>
      </Btn>
      <Btn label="斜体" hint="Ctrl+I" onClick={() => api()?.wrap('*', '*', '斜体')}>
        <span className="text-[13px] italic">I</span>
      </Btn>
      <Btn label="删除线" hint="删除线" onClick={() => api()?.wrap('~~', '~~', '删除线')}>
        <span className="text-[13px] line-through">S</span>
      </Btn>
      <Btn label="行内代码" hint="等宽显示" onClick={() => api()?.wrap('`', '`', 'code')}>
        <span className="font-mono text-[12px]">`x`</span>
      </Btn>
      <Btn label="链接" hint="插入链接" onClick={() => api()?.wrap('[', '](url)', '链接文字')}>
        <span className="text-[13px]">🔗</span>
      </Btn>
      <Btn label="图片" hint="插入图片" onClick={() => api()?.insert('![](assets/001/文件名.png)')}>
        <span className="text-[13px]">🖼</span>
      </Btn>

      <Sep />

      {/* ---- 格式 ---- */}
      <Btn
        label="源码格式"
        hint="整个编辑器切到 Markdown 原文（全局视图开关）"
        active={sourceMode}
        onClick={() => onSourceMode(!sourceMode)}
      >
        <span className="font-mono text-[12px]">&lt;/&gt;</span>
      </Btn>
      <Btn
        label="清除格式"
        hint="去掉选区里的 Markdown 标记，只留文字（只影响选区）"
        onClick={() => api()?.clearFormat()}
      >
        <span className="text-[11px] font-medium">Tx</span>
      </Btn>

      <div className="ml-auto" />

      {/* ---- 视图：语法标记 ---- */}
      <div className="flex items-center gap-0.5 rounded border border-slate-200 bg-white p-0.5">
        {(
          [
            ['line', '整行'],
            ['marker', '标记'],
            ['never', '不展开'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => onReveal(v)}
            className={`rounded px-1.5 py-0.5 text-[10px] transition ${
              reveal === v ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Btn({
  label,
  hint,
  active,
  onClick,
  children,
}: {
  label: string
  hint: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={`${label}　${hint}`}
      aria-label={label}
      className={`flex h-7 w-7 items-center justify-center rounded transition ${
        active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-slate-300" />
}

// ---- 图标（内联 SVG，避免引图标库） ----

function IconBullet() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="3" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="10" r="1" fill="currentColor" stroke="none" />
      <line x1="6.5" y1="4" x2="12" y2="4" />
      <line x1="6.5" y1="10" x2="12" y2="10" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="3" width="7" height="7" rx="1" />
      <path d="M3.5 6.5 L5 8 L7 5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="10.5" y1="6.5" x2="12.5" y2="6.5" />
    </svg>
  )
}

function IconTable() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" />
      <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" />
      <line x1="5.5" y1="5.5" x2="5.5" y2="11.5" />
      <line x1="9" y1="5.5" x2="9" y2="11.5" />
    </svg>
  )
}
