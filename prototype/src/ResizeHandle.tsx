/**
 * 侧栏宽度：状态 + 拖拽手柄。
 *
 * 文件树的右边框、大纲的左边框都能拖，且**宽度记在 localStorage 里**——
 * 用户把文件树拉宽是因为他的笔记名长，这个决定不该每次重启都作废。
 *
 * 手柄本身画在侧栏边框上（见 index.css 的 `.resize-handle`），
 * 所以侧栏必须 `relative`。
 */
import { useCallback, useState } from 'react'

/** 拖拽时宽度的上下限。下限保证内容读得下，上限不让它把编辑区挤没。 */
export interface WidthRange {
  def: number
  min: number
  max: number
}

function clamp(w: number, { min, max }: WidthRange) {
  return Math.min(max, Math.max(min, Math.round(w)))
}

/**
 * 一条侧栏的宽度。
 *
 * 读盘时**也要夹一次**：存下来的值可能是旧版本写的（那时上下限不同），
 * 直接信它会让侧栏开在一个已经不允许的宽度上。
 */
export function usePanelWidth(key: string, range: WidthRange) {
  const { def, min, max } = range
  const [width, setWidth] = useState(() => {
    const raw = localStorage.getItem(key)
    const n = raw === null ? NaN : Number(raw)
    return Number.isFinite(n) ? clamp(n, { def, min, max }) : def
  })

  const set = useCallback(
    (w: number) => {
      const next = clamp(w, { def, min, max })
      setWidth(next)
      localStorage.setItem(key, String(next))
    },
    [key, def, min, max],
  )

  return [width, set] as const
}

interface Props {
  /** 这条边属于哪一侧：left = 左栏（文件树）的右边框，right = 右栏（大纲）的左边框 */
  side: 'left' | 'right'
  width: number
  range: WidthRange
  /** 无障碍名称，也是 tooltip 的前半句 */
  label: string
  onChange: (w: number) => void
}

export function ResizeHandle({ side, width, range, label, onChange }: Props) {
  const [dragging, setDragging] = useState(false)

  /**
   * 指针捕获 + 手动挂监听。
   *
   * 用 setPointerCapture 而不是监听 window：指针被这个元素捕获后，
   * 拖到窗口外（甚至拖出浏览器）事件仍然回来，松手也一定能收到——
   * 挂在 window 上时，在 iframe 边缘或窗口外松手会漏掉 pointerup，
   * 界面就卡在"一直拖着"的状态里。
   */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()

    const el = e.currentTarget
    const startX = e.clientX
    const startWidth = width
    // 左栏的边在它右侧：往右拖 = 变宽。右栏相反。
    const sign = side === 'left' ? 1 : -1

    el.setPointerCapture(e.pointerId)
    setDragging(true)
    document.body.classList.add('is-resizing')

    const move = (ev: PointerEvent) => onChange(startWidth + sign * (ev.clientX - startX))
    const finish = () => {
      setDragging(false)
      document.body.classList.remove('is-resizing')
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
  }

  /** 键盘也能调——只给拖拽的话，够不着鼠标的人就改不了宽度 */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const sign = side === 'left' ? 1 : -1
    const step = (e.shiftKey ? 32 : 8) * sign
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onChange(width + step)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onChange(width - step)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(range.def)
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      tabIndex={0}
      title={`${label}（双击复位）`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(range.def)}
      onKeyDown={onKeyDown}
      className={`resize-handle ${dragging ? 'is-dragging' : ''}`}
      // 骑在边框上：一半在外、一半在内
      style={side === 'left' ? { right: -3 } : { left: -3 }}
    />
  )
}
