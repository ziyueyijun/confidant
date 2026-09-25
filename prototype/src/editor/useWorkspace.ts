/**
 * 编辑区的工作区状态：打开的标签、每个标签的「磁盘内容」与「编辑中内容」。
 *
 * 原型没有真实文件系统，`saved` 就充当磁盘——保存是 draft → saved，
 * 刷新是 saved → draft。文档一旦打开就留在 docs 里（相当于落盘了），
 * 关掉标签再打开不会丢已保存的内容。
 */
import { useCallback, useState } from 'react'
import { NOTES } from '../data'

export interface Doc {
  path: string
  title: string
  /** 「磁盘上」的内容——上次保存后的样子 */
  saved: string
  /** 编辑器里的当前内容 */
  draft: string
  /** 每次刷新自增，用来强制编辑器重新挂载 */
  rev: number
}

export interface Pane {
  id: string
  /** 打开的标签，按打开顺序 */
  tabs: string[]
  active: string | null
}

function seedDoc(path: string): Doc {
  const note = NOTES.find((n) => n.path === path)
  return {
    path,
    title: note?.title ?? path,
    saved: note?.body ?? '',
    draft: note?.body ?? '',
    rev: 0,
  }
}

export function useWorkspace() {
  const [docs, setDocs] = useState<Record<string, Doc>>({})
  const [panes, setPanes] = useState<Pane[]>([{ id: 'pane-0', tabs: [], active: null }])
  const [activePane, setActivePane] = useState('pane-0')

  const activePaneObj = panes.find((p) => p.id === activePane) ?? panes[0]
  const activePaneId = activePaneObj?.id ?? 'pane-0'
  const activeDoc = activePaneObj?.active ? docs[activePaneObj.active] ?? null : null

  const ensure = useCallback((path: string) => {
    setDocs((d) => (d[path] ? d : { ...d, [path]: seedDoc(path) }))
  }, [])

  /** 在某个 pane 打开标签（已开则只激活）。paneId 省略时用当前活动 pane。 */
  const open = useCallback(
    (path: string, paneId?: string) => {
      ensure(path)
      const target = paneId ?? activePaneId
      setPanes((ps) =>
        ps.map((p) =>
          p.id === target
            ? { ...p, tabs: p.tabs.includes(path) ? p.tabs : [...p.tabs, path], active: path }
            : p,
        ),
      )
      setActivePane(target)
    },
    [activePaneId, ensure],
  )

  const activate = useCallback((paneId: string, path: string) => {
    setPanes((ps) => ps.map((p) => (p.id === paneId ? { ...p, active: path } : p)))
    setActivePane(paneId)
  }, [])

  const close = useCallback((paneId: string, path: string) => {
    setPanes((ps) => {
      const next = ps.map((p) => {
        if (p.id !== paneId) return p
        const tabs = p.tabs.filter((t) => t !== path)
        return { ...p, tabs, active: p.active === path ? tabs[tabs.length - 1] ?? null : p.active }
      })
      // 空掉的分屏自己收起来，但始终留一块（哪怕也是空的）
      const pruned = next.filter((p) => p.tabs.length > 0)
      return pruned.length > 0 ? pruned : next.slice(0, 1)
    })
  }, [])

  const closeOthers = useCallback((paneId: string, path: string) => {
    setPanes((ps) => ps.map((p) => (p.id === paneId ? { ...p, tabs: [path], active: path } : p)))
  }, [])

  /**
   * 把标签挪到另一栏。方向由当前栏的位置决定：只有一栏时是新建右栏（分屏），
   * 已经分屏时左栏的标签往右挪、右栏的往左挪（挪回去，也就是撤销分屏）。
   *
   * 挪完空掉的那一栏自己收起来——这正是「把最后一个标签挪回左栏 = 撤销分屏」。
   * 唯一不做的情况是挪了等于没挪：只有一栏且只有一个标签，挪过去左栏空了又被
   * 收起，净效果为零。调用方据此禁用菜单项，这里再兜一道。
   */
  const moveAcross = useCallback(
    (paneId: string, path: string) => {
      const srcIdx = panes.findIndex((p) => p.id === paneId)
      if (srcIdx < 0) return
      const src = panes[srcIdx]
      if (!src.tabs.includes(path)) return

      const isRightmost = panes.length >= 2 && srcIdx === panes.length - 1
      if (src.tabs.length < 2 && !isRightmost) return

      ensure(path)
      const rest = src.tabs.filter((t) => t !== path)
      const restActive = rest[rest.length - 1] ?? null
      const targetIdx = srcIdx === 0 ? 1 : 0
      const target = panes[targetIdx]
      const targetId = target?.id ?? 'pane-1'

      setPanes((ps) => {
        const moved = target
          ? ps.map((p) => {
              if (p.id === paneId) return { ...p, tabs: rest, active: restActive }
              if (p.id === targetId) {
                return {
                  ...p,
                  tabs: p.tabs.includes(path) ? p.tabs : [...p.tabs, path],
                  active: path,
                }
              }
              return p
            })
          : [
              ...ps.map((p) => (p.id === paneId ? { ...p, tabs: rest, active: restActive } : p)),
              { id: targetId, tabs: [path], active: path },
            ]
        const pruned = moved.filter((p) => p.tabs.length > 0)
        return pruned.length > 0 ? pruned : moved.slice(0, 1)
      })
      setActivePane(targetId)
    },
    [ensure, panes],
  )

  /**
   * 菜单上那个「挪动」项的文案与可用性。
   *
   * 文案和判据故意由同一个函数给出——分开写的话两处守卫迟早会漂移，
   * 变成「显示可点但点了没反应」或者反过来。
   */
  const moveLabel = useCallback(
    (paneId: string): { label: string; enabled: boolean } => {
      const idx = panes.findIndex((p) => p.id === paneId)
      if (idx < 0) return { label: '向右分屏', enabled: false }
      const src = panes[idx]

      if (panes.length < 2) {
        // 还没分屏。只有一个标签时分出去等于原地打转，所以置灰但仍叫「向右分屏」。
        return { label: '向右分屏', enabled: src.tabs.length >= 2 }
      }
      if (idx === panes.length - 1) {
        // 最右栏的标签能挪回左边；左栏空了会被收起，等于撤销分屏，总是有意义
        return { label: '移到左栏', enabled: true }
      }
      // 左栏的标签往右挪，同样需要至少两个，否则净效果为零
      return { label: '移到右栏', enabled: src.tabs.length >= 2 }
    },
    [panes],
  )

  /** 丢弃编辑中的内容，重新从「磁盘」读——刷新用，关闭时选「不保存」也用它。 */
  const revert = useCallback((path: string) => {
    setDocs((d) =>
      d[path] ? { ...d, [path]: { ...d[path], draft: d[path].saved, rev: d[path].rev + 1 } } : d,
    )
  }, [])

  const save = useCallback((path: string) => {
    setDocs((d) => (d[path] ? { ...d, [path]: { ...d[path], saved: d[path].draft } } : d))
  }, [])

  const updateDraft = useCallback((path: string, text: string) => {
    setDocs((d) => (d[path] ? { ...d, [path]: { ...d[path], draft: text } } : d))
  }, [])

  const isDirty = useCallback(
    (path: string) => {
      const doc = docs[path]
      return !!doc && doc.draft !== doc.saved
    },
    [docs],
  )

  return {
    docs,
    panes,
    activePane: activePaneId,
    activeDoc,
    setActivePane,
    open,
    activate,
    close,
    closeOthers,
    moveAcross,
    moveLabel,
    revert,
    save,
    updateDraft,
    isDirty,
  }
}
