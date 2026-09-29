import type { TabState } from './tabState'

/**
 * Ticket #17: renders the tab strip DOM from a `TabState` snapshot.
 * Purely presentational - all open/focus/close decisions live in
 * `tabState.ts`; this module just reflects the current state and
 * forwards click intent back to the caller (`main.ts`), which is
 * responsible for actually mutating state and flushing autosave before
 * switching/closing.
 */
export interface TabBarOptions {
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  /**
   * Ticket #20 acceptance criterion #5: true if `path`'s backing file
   * was deleted externally. Deleted tabs render in red with a "(已删除)"
   * suffix so the user notices before trying to keep editing a document
   * that can no longer autosave back to its original path.
   */
  isDeleted?: (path: string) => boolean
}

/** Shortens an absolute path to its basename for the tab label. */
export function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? path : normalized.slice(lastSlash + 1)
}

export function renderTabBar(container: HTMLElement, state: TabState, options: TabBarOptions): void {
  container.replaceChildren()

  for (const path of state.tabs) {
    const tab = document.createElement('div')
    tab.className = 'cf-tab'
    if (path === state.activePath) tab.classList.add('cf-tab-active')
    const deleted = options.isDeleted?.(path) ?? false
    if (deleted) tab.classList.add('cf-tab-deleted')
    tab.dataset.path = path
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(path === state.activePath))
    tab.tabIndex = 0

    const label = document.createElement('span')
    label.className = 'cf-tab-label'
    label.textContent = deleted ? `${basename(path)} (已删除)` : basename(path)
    label.title = path

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'cf-tab-close'
    closeButton.setAttribute('aria-label', `Close ${basename(path)}`)
    closeButton.textContent = '×'
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation()
      options.onCloseTab(path)
    })

    tab.appendChild(label)
    tab.appendChild(closeButton)

    tab.addEventListener('click', () => options.onSelectTab(path))
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        options.onSelectTab(path)
      }
    })

    container.appendChild(tab)
  }
}
