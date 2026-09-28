import type { GroupedFileResult, LineMatch, SearchOptions } from '../../../preload/index'

/**
 * Ticket #22: the sidebar's full-text search panel.
 *
 * This module owns:
 * - the search UI (query input, case/word/regex option checkboxes, a
 *   debounced-input -> IPC pipeline, streamed result rendering grouped by
 *   file, the 5s "searching..." + cancel affordance)
 * - the "session ID" scheme that lets stale streamed results from a
 *   superseded/cancelled search be dropped instead of corrupting the UI
 *   (key technical constraint from the ticket)
 *
 * It deliberately does NOT own: opening files in tabs or CM6 line
 * highlighting - `onResultClick` is a callback into main.ts, which already
 * owns `openFileInTab`/`MarkdownEditorHandle` (ticket #17/#22's own
 * `revealLine`).
 */

export interface SearchPanelOptions {
  /** Called when the user clicks a search result line. */
  onResultClick: (path: string, lineNumber: number) => void
  /** Returns the currently open library's absolute path, or null if none is open. */
  getLibraryPath: () => string | null
}

export interface SearchPanelHandle {
  /** Shows the panel (hiding the file tree) and focuses the query input. */
  open: () => void
  /** Hides the panel (showing the file tree back). */
  close: () => void
  isOpen: () => boolean
  /** Toggles open/closed - what Ctrl+Shift+F drives. */
  toggle: () => void
}

const DEBOUNCE_MS = 300
const SEARCH_TIMEOUT_MS = 5000

let sessionCounter = 0
function nextSessionId(): string {
  sessionCounter += 1
  return `search-${Date.now()}-${sessionCounter}`
}

/** Escapes a string for safe insertion as HTML text content. */
function escapeHtml(value: string): string {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

/**
 * Renders one context/match line with the matched substring wrapped in a
 * highlight span. `matchStart`/`matchEnd` are omitted for pure context
 * lines (no highlight).
 */
function renderLineHtml(text: string, matchStart?: number, matchEnd?: number): string {
  if (matchStart === undefined || matchEnd === undefined) {
    return escapeHtml(text)
  }
  const before = escapeHtml(text.slice(0, matchStart))
  const matched = escapeHtml(text.slice(matchStart, matchEnd))
  const after = escapeHtml(text.slice(matchEnd))
  return `${before}<mark class="cf-search-result-highlight">${matched}</mark>${after}`
}

export function createSearchPanel(
  container: HTMLElement,
  fileTreeContainer: HTMLElement,
  options: SearchPanelOptions
): SearchPanelHandle {
  container.replaceChildren()
  container.classList.add('cf-search-sidebar')

  const inputRow = document.createElement('div')
  inputRow.className = 'cf-search-sidebar-input-row'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'cf-search-sidebar-input'
  input.placeholder = 'Search library...'
  input.setAttribute('aria-label', 'Search library')

  inputRow.appendChild(input)

  const optionsRow = document.createElement('div')
  optionsRow.className = 'cf-search-sidebar-options'

  const caseCheckbox = createOptionToggle('Aa', 'Match case')
  const wordCheckbox = createOptionToggle('Ab', 'Match whole word')
  const regexCheckbox = createOptionToggle('.*', 'Use regular expression')

  optionsRow.append(caseCheckbox.button, wordCheckbox.button, regexCheckbox.button)

  const statusRow = document.createElement('div')
  statusRow.className = 'cf-search-sidebar-status'
  statusRow.hidden = true

  const statusLabel = document.createElement('span')
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'cf-search-sidebar-cancel'
  cancelButton.textContent = 'Cancel'
  cancelButton.hidden = true
  statusRow.append(statusLabel, cancelButton)

  const resultsContainer = document.createElement('div')
  resultsContainer.className = 'cf-search-sidebar-results'

  container.append(inputRow, optionsRow, statusRow, resultsContainer)

  let isOpen = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null
  let currentSessionId: string | null = null
  let unsubscribeResult: (() => void) | null = null
  let unsubscribeDone: (() => void) | null = null
  let unsubscribeError: (() => void) | null = null

  function readOptions(): SearchOptions {
    return {
      caseSensitive: caseCheckbox.isActive(),
      wholeWord: wordCheckbox.isActive(),
      useRegex: regexCheckbox.isActive()
    }
  }

  function clearTimers(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  /**
   * Ends the current session (if any) without starting a new one:
   * unsubscribes from streamed events and tells the main process to stop
   * scanning. Called both when the query changes (superseded) and when
   * the panel closes.
   */
  function endCurrentSession(): void {
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
    if (currentSessionId !== null) {
      window.api.cancelSearch(currentSessionId)
    }
    unsubscribeResult?.()
    unsubscribeDone?.()
    unsubscribeError?.()
    unsubscribeResult = null
    unsubscribeDone = null
    unsubscribeError = null
    currentSessionId = null
  }

  function setStatus(text: string | null, showCancel: boolean): void {
    if (text === null) {
      statusRow.hidden = true
      return
    }
    statusRow.hidden = false
    statusLabel.textContent = text
    cancelButton.hidden = !showCancel
  }

  function runSearch(query: string): void {
    endCurrentSession()
    resultsContainer.replaceChildren()

    if (query.length === 0) {
      setStatus(null, false)
      return
    }

    const libraryPath = options.getLibraryPath()
    if (!libraryPath) {
      setStatus('Open a library folder to search.', false)
      return
    }

    const sessionId = nextSessionId()
    currentSessionId = sessionId
    setStatus('Searching...', false)

    // Acceptance criterion #6: after 5s with no completion, show
    // "searching..." + a cancel button (the status is already showing
    // "Searching...", so this just reveals Cancel).
    timeoutTimer = setTimeout(() => {
      if (currentSessionId === sessionId) {
        setStatus('Searching...', true)
      }
    }, SEARCH_TIMEOUT_MS)

    const fileEntries = new Map<string, HTMLElement>()

    unsubscribeResult = window.api.onSearchResult((resultSessionId, result) => {
      // Session-ID guard: drop results from any search that isn't the
      // current one (superseded by newer input, or already cancelled) -
      // this is what stops a slow old search's late-arriving batches
      // from polluting a fresh query's result list.
      if (resultSessionId !== sessionId) return
      renderFileResult(result)
    })

    unsubscribeDone = window.api.onSearchDone((doneSessionId) => {
      if (doneSessionId !== sessionId) return
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      const total = fileEntries.size
      setStatus(total === 0 ? 'No results.' : null, false)
    })

    unsubscribeError = window.api.onSearchError((errorSessionId, error) => {
      if (errorSessionId !== sessionId) return
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      setStatus(`Invalid regular expression: ${error.message}`, false)
    })

    window.api.startSearch(sessionId, libraryPath, query, readOptions())

    function renderFileResult(result: GroupedFileResult): void {
      const existing = fileEntries.get(result.path)
      const entry = existing ?? buildFileEntry(result)
      if (!existing) {
        fileEntries.set(result.path, entry)
        resultsContainer.appendChild(entry)
      }
    }

    function buildFileEntry(result: GroupedFileResult): HTMLElement {
      const details = document.createElement('details')
      details.className = 'cf-search-result-file'
      details.open = true

      const summary = document.createElement('summary')
      const nameSpan = document.createElement('span')
      nameSpan.className = 'cf-search-result-filename'
      nameSpan.textContent = result.name
      nameSpan.title = result.path

      const countSpan = document.createElement('span')
      countSpan.className = 'cf-search-result-count'
      countSpan.textContent = String(result.totalMatches)

      summary.append(nameSpan, countSpan)
      details.appendChild(summary)

      const list = document.createElement('ul')
      list.className = 'cf-search-result-matches'

      for (const match of result.displayedMatches) {
        list.appendChild(buildMatchItem(result.path, match))
      }

      if (result.totalMatches > result.displayedMatches.length) {
        const more = document.createElement('li')
        more.className = 'cf-search-result-more'
        more.textContent = `+${result.totalMatches - result.displayedMatches.length} more`
        list.appendChild(more)
      }

      details.appendChild(list)
      return details
    }

    function buildMatchItem(path: string, match: LineMatch): HTMLElement {
      const item = document.createElement('li')
      item.className = 'cf-search-result-match'
      item.setAttribute('role', 'button')
      item.tabIndex = 0

      if (match.contextBefore !== null) {
        const before = document.createElement('div')
        before.className = 'cf-search-result-context'
        before.innerHTML = renderLineHtml(match.contextBefore)
        item.appendChild(before)
      }

      const matchLine = document.createElement('div')
      matchLine.className = 'cf-search-result-match-line'
      matchLine.innerHTML = renderLineHtml(match.lineText, match.matchStart, match.matchEnd)
      item.appendChild(matchLine)

      if (match.contextAfter !== null) {
        const after = document.createElement('div')
        after.className = 'cf-search-result-context'
        after.innerHTML = renderLineHtml(match.contextAfter)
        item.appendChild(after)
      }

      const open = (): void => options.onResultClick(path, match.lineNumber)
      item.addEventListener('click', open)
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      })

      return item
    }
  }

  function scheduleSearch(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runSearch(input.value.trim()), DEBOUNCE_MS)
  }

  input.addEventListener('input', scheduleSearch)
  caseCheckbox.button.addEventListener('click', () => {
    caseCheckbox.toggle()
    if (input.value.trim().length > 0) runSearch(input.value.trim())
  })
  wordCheckbox.button.addEventListener('click', () => {
    wordCheckbox.toggle()
    if (input.value.trim().length > 0) runSearch(input.value.trim())
  })
  regexCheckbox.button.addEventListener('click', () => {
    regexCheckbox.toggle()
    if (input.value.trim().length > 0) runSearch(input.value.trim())
  })

  cancelButton.addEventListener('click', () => {
    endCurrentSession()
    setStatus('Search cancelled.', false)
  })

  function openPanel(): void {
    isOpen = true
    container.hidden = false
    fileTreeContainer.hidden = true
    input.focus()
    input.select()
  }

  function closePanel(): void {
    isOpen = false
    container.hidden = true
    fileTreeContainer.hidden = false
    clearTimers()
    endCurrentSession()
  }

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => isOpen,
    toggle: () => (isOpen ? closePanel() : openPanel())
  }
}

interface OptionToggle {
  button: HTMLButtonElement
  isActive: () => boolean
  toggle: () => void
}

function createOptionToggle(label: string, title: string): OptionToggle {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cf-search-option-toggle'
  button.textContent = label
  button.title = title
  button.setAttribute('aria-label', title)
  button.setAttribute('aria-pressed', 'false')

  let active = false
  return {
    button,
    isActive: () => active,
    toggle: () => {
      active = !active
      button.classList.toggle('cf-search-option-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
  }
}
