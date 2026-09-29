import { fuzzyMatchFiles, type QuickSwitcherFile } from '@shared/quickSwitcher'
import { recordFileOpened, EMPTY_RECENT_FILES_STATE, type RecentFilesState } from './recentFiles'
import { nextIndex, prevIndex, clampIndex } from './navigation'

/**
 * Ticket #21: Ctrl+P quick switcher.
 *
 * Unlike #23's find panel (searchPanel.ts), this floating UI is not
 * scoped to a single CM6 editor instance - it's a top-level overlay that
 * picks from *all* markdown files in the currently open library and
 * opens the result into a tab via the caller's `onOpenFile` (main.ts's
 * `openFileInTab`). So it's plain DOM + a global keydown listener,
 * wired up once in main.ts's bootstrap, not a CM6 StateField/keymap.
 *
 * State shape mirrors searchPanel.ts's pattern (module-level pure logic
 * in shared/quickSwitcher.ts + recentFiles.ts + navigation.ts, DOM glue
 * here) for consistency, minus CM6's StateField machinery since there's
 * no EditorState to hang state off of here.
 */

export interface QuickSwitcherOptions {
  /** Called with the chosen file's absolute path when the user picks a result. */
  onOpenFile: (path: string) => void
}

export interface QuickSwitcherHandle {
  /** Opens the panel (creating DOM if needed), showing recent files, and focuses the input. */
  open: () => void
  /** Closes the panel and clears the query/selection. */
  close: () => void
  /** Whether the panel is currently open. */
  isOpen: () => boolean
  /**
   * Replaces the full candidate file list (call whenever the open
   * library's file tree changes/loads).
   */
  setFiles: (files: QuickSwitcherFile[]) => void
  /**
   * Records `path` as just-opened, for the default recent-files view.
   * Call this from the same place `openFileInTab` is called (main.ts),
   * so every open - via the switcher, the sidebar, or the initial
   * command-line file - counts.
   */
  recordOpened: (path: string) => void
  /** Removes the panel's DOM node and the global keydown listener. */
  destroy: () => void
}

const PANEL_WIDTH_PX = 600

/**
 * Creates the quick switcher overlay and appends it to `document.body`.
 * Registers a `window`-level `keydown` listener for Ctrl+P (open) and,
 * while open, ↑/↓/Enter/Esc (handled on the input itself once focused).
 */
export function createQuickSwitcher(options: QuickSwitcherOptions): QuickSwitcherHandle {
  let allFiles: QuickSwitcherFile[] = []
  let recentState: RecentFilesState = EMPTY_RECENT_FILES_STATE
  let results: QuickSwitcherFile[] = []
  let selectedIndex = -1
  let isOpen = false

  const overlay = document.createElement('div')
  overlay.className = 'cf-quick-switcher-overlay'
  overlay.style.display = 'none'

  const panel = document.createElement('div')
  panel.className = 'cf-quick-switcher-panel'
  panel.style.width = `${PANEL_WIDTH_PX}px`

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'cf-quick-switcher-input'
  input.placeholder = 'Go to file...'
  input.setAttribute('aria-label', 'Go to file')

  const resultsList = document.createElement('ul')
  resultsList.className = 'cf-quick-switcher-results'

  panel.append(input, resultsList)
  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  function currentQuery(): string {
    return input.value.trim()
  }

  /** Recomputes `results` from the current input value, per acceptance criteria #2/#3. */
  function refreshResults(): void {
    const query = currentQuery()
    if (query.length === 0) {
      // Default view (acceptance criterion #2): most-recently-opened
      // first. A recent path whose file no longer exists in the current
      // file list (e.g. the library changed) is silently dropped by the
      // `undefined` filter below.
      results = recentState.paths
        .map((path) => allFiles.find((f) => f.path === path))
        .filter((f): f is QuickSwitcherFile => f !== undefined)
    } else {
      results = fuzzyMatchFiles(allFiles, query)
    }
    selectedIndex = clampIndex(selectedIndex, results.length)
    renderResults(query.length === 0)
  }

  function renderResults(isShowingRecents: boolean): void {
    resultsList.replaceChildren()
    if (results.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'cf-quick-switcher-empty'
      empty.textContent = isShowingRecents ? 'No recently opened files' : 'No matching files'
      resultsList.appendChild(empty)
      return
    }

    results.forEach((file, index) => {
      const item = document.createElement('li')
      item.className = 'cf-quick-switcher-result'
      if (index === selectedIndex) item.classList.add('cf-quick-switcher-result-selected')

      const icon = document.createElement('span')
      icon.className = 'cf-quick-switcher-icon'
      icon.textContent = isShowingRecents ? '🕘' : '📄'

      const name = document.createElement('span')
      name.className = 'cf-quick-switcher-name'
      name.textContent = file.name

      const path = document.createElement('span')
      path.className = 'cf-quick-switcher-path'
      path.textContent = file.path

      item.append(icon, name, path)
      item.addEventListener('mousedown', (e) => {
        e.preventDefault() // don't steal focus from the input before we act
        selectedIndex = index
        commitSelection()
      })

      resultsList.appendChild(item)
    })
  }

  function commitSelection(): void {
    const file = results[selectedIndex]
    if (!file) return
    closePanel()
    options.onOpenFile(file.path)
  }

  input.addEventListener('input', refreshResults)

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex = nextIndex(selectedIndex, results.length)
      renderResults(currentQuery().length === 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex = prevIndex(selectedIndex, results.length)
      renderResults(currentQuery().length === 0)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commitSelection()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closePanel()
    }
  })

  // Clicking the dimmed backdrop (outside the panel) closes it, matching
  // the usual "modal palette" convention.
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closePanel()
  })

  function openPanel(): void {
    isOpen = true
    overlay.style.display = 'flex'
    input.value = ''
    selectedIndex = -1
    refreshResults()
    input.focus()
  }

  function closePanel(): void {
    isOpen = false
    overlay.style.display = 'none'
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    const isCtrlP = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p'
    if (!isCtrlP) return
    event.preventDefault() // stops the browser/OS print dialog (key technical constraint)
    if (isOpen) closePanel()
    else openPanel()
  }

  window.addEventListener('keydown', handleGlobalKeydown)

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => isOpen,
    setFiles: (files) => {
      allFiles = files
    },
    recordOpened: (path) => {
      recentState = recordFileOpened(recentState, path)
    },
    destroy: () => {
      window.removeEventListener('keydown', handleGlobalKeydown)
      overlay.remove()
    }
  }
}
