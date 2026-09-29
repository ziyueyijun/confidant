import { StateEffect, StateField, EditorSelection, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap, type KeyBinding } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import {
  collectMarkerRanges,
  findMatchesInDocument,
  nextMatchIndex,
  prevMatchIndex,
  type DocMatch
} from './search'

/**
 * Ticket #23: Ctrl+F find-in-document.
 *
 * Kept in its own module/StateField, deliberately separate from #15's
 * `wysiwygPlugin` (decorations.ts) - that plugin owns marker show/hide,
 * this one owns match highlighting. Both contribute decorations to the
 * same EditorView independently; CM6 merges decoration sources from
 * different extensions natively, so there's no need to combine their
 * logic.
 */

interface SearchState {
  query: string
  matches: DocMatch[]
  currentIndex: number
}

const emptySearchState: SearchState = { query: '', matches: [], currentIndex: -1 }

const setSearchQuery = StateEffect.define<string>()
const setCurrentIndex = StateEffect.define<number>()
const clearSearch = StateEffect.define<void>()

/**
 * Holds the current query + match list + which match is "current".
 * Recomputes matches on every relevant doc/query change. Recomputing on
 * every doc change (not just when the query changes) keeps highlights
 * correct while the user is typing elsewhere in the document with the
 * find panel still open.
 */
const searchStateField = StateField.define<SearchState>({
  create() {
    return emptySearchState
  },
  update(value, tr) {
    let next = value

    for (const effect of tr.effects) {
      if (effect.is(setSearchQuery)) {
        next = { ...next, query: effect.value }
      } else if (effect.is(setCurrentIndex)) {
        next = { ...next, currentIndex: effect.value }
      } else if (effect.is(clearSearch)) {
        next = emptySearchState
      }
    }

    if (next.query && (tr.docChanged || next.query !== value.query)) {
      const markerRanges = collectMarkerRanges(tr.state)
      const matches = findMatchesInDocument(tr.state.doc.toString(), markerRanges, next.query)
      const currentIndex = matches.length > 0 ? Math.min(next.currentIndex >= 0 ? next.currentIndex : 0, matches.length - 1) : -1
      next = { ...next, matches, currentIndex }
    } else if (!next.query) {
      next = { ...next, matches: [], currentIndex: -1 }
    }

    return next
  }
})

function buildMatchDecorations(state: SearchState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const sorted = [...state.matches.entries()].sort((a, b) => a[1].from - b[1].from)

  for (const [idx, match] of sorted) {
    const isCurrent = idx === state.currentIndex
    builder.add(
      match.from,
      match.to,
      Decoration.mark({ class: isCurrent ? 'cf-search-match-current' : 'cf-search-match' })
    )
  }

  return builder.finish()
}

const searchHighlightField = StateField.define<DecorationSet>({
  create(state) {
    return buildMatchDecorations(state.field(searchStateField))
  },
  update(_deco, tr) {
    return buildMatchDecorations(tr.state.field(searchStateField))
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Scrolls the given match into view, centered, without stealing focus from the find input. */
function scrollMatchIntoView(view: EditorView, match: DocMatch): void {
  view.dispatch({
    effects: EditorView.scrollIntoView(EditorSelection.range(match.from, match.to), { y: 'center' })
  })
}

export interface SearchPanelHandle {
  /** Opens the panel (creating the DOM if needed) and focuses the input. */
  open: () => void
  /** Closes the panel and clears all highlights/state. */
  close: () => void
  /** Whether the panel is currently open. */
  isOpen: () => boolean
  /** Removes the panel's DOM node. Call when the editor is destroyed. */
  destroy: () => void
}

/**
 * Creates the floating find UI (native DOM, no framework - consistent
 * with #14/#18) anchored to the top-right corner of `hostElement`, and
 * wires it to the CM6 `view` via the state effects above.
 */
function createSearchPanelDom(
  hostElement: HTMLElement,
  view: EditorView
): SearchPanelHandle {
  const panel = document.createElement('div')
  panel.className = 'cf-search-panel'
  panel.style.display = 'none'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'cf-search-input'
  input.placeholder = 'Find'
  input.setAttribute('aria-label', 'Find in document')

  const countLabel = document.createElement('span')
  countLabel.className = 'cf-search-count'

  const prevButton = document.createElement('button')
  prevButton.type = 'button'
  prevButton.className = 'cf-search-btn'
  prevButton.textContent = '↑'
  prevButton.title = 'Previous match (Shift+Enter)'
  prevButton.setAttribute('aria-label', 'Previous match')

  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'cf-search-btn'
  nextButton.textContent = '↓'
  nextButton.title = 'Next match (Enter/F3)'
  nextButton.setAttribute('aria-label', 'Next match')

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'cf-search-btn cf-search-close'
  closeButton.textContent = '×'
  closeButton.title = 'Close (Esc)'
  closeButton.setAttribute('aria-label', 'Close find panel')

  panel.append(input, countLabel, prevButton, nextButton, closeButton)
  hostElement.appendChild(panel)

  let isOpen = false

  function currentSearchState(): SearchState {
    return view.state.field(searchStateField)
  }

  function updateCountLabel(): void {
    const { matches, currentIndex } = currentSearchState()
    countLabel.textContent = matches.length === 0 ? '0/0' : `${currentIndex + 1}/${matches.length}`
  }

  function goToIndex(index: number): void {
    view.dispatch({ effects: setCurrentIndex.of(index) })
    updateCountLabel()
    const match = currentSearchState().matches[index]
    if (match) scrollMatchIntoView(view, match)
  }

  function runQuery(query: string): void {
    view.dispatch({ effects: setSearchQuery.of(query) })
    updateCountLabel()
    const state = currentSearchState()
    if (state.matches.length > 0) {
      scrollMatchIntoView(view, state.matches[state.currentIndex])
    }
  }

  function goNext(): void {
    const { matches, currentIndex } = currentSearchState()
    const idx = nextMatchIndex(matches.length, currentIndex)
    if (idx !== -1) goToIndex(idx)
  }

  function goPrev(): void {
    const { matches, currentIndex } = currentSearchState()
    const idx = prevMatchIndex(matches.length, currentIndex)
    if (idx !== -1) goToIndex(idx)
  }

  input.addEventListener('input', () => runQuery(input.value))

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) goPrev()
      else goNext()
    } else if (event.key === 'F3') {
      event.preventDefault()
      if (event.shiftKey) goPrev()
      else goNext()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closePanel()
    }
  })

  prevButton.addEventListener('click', goPrev)
  nextButton.addEventListener('click', goNext)

  function openPanel(): void {
    isOpen = true
    panel.style.display = 'flex'
    input.focus()
    input.select()
    if (input.value) runQuery(input.value)
  }

  function closePanel(): void {
    isOpen = false
    panel.style.display = 'none'
    view.dispatch({ effects: clearSearch.of() })
    view.focus()
  }

  closeButton.addEventListener('click', closePanel)

  return {
    open: openPanel,
    close: closePanel,
    isOpen: () => isOpen,
    destroy: () => {
      panel.remove()
    }
  }
}

/**
 * The two StateFields (search state + highlight decorations) that must
 * be part of the editor's `EditorState.create` extensions list. Separate
 * from the Ctrl+F keymap below because CM6 extensions are fixed at state
 * creation time, before the `EditorView` (and thus the find panel's DOM,
 * which needs a live view to dispatch into) exists - see init.ts for how
 * the two are sequenced via a mutable ref filled in after construction.
 */
export function searchExtensions(): Extension {
  return [searchStateField, searchHighlightField]
}

/**
 * Wires the floating find panel to a live `view`, anchored inside
 * `hostElement` (expected to be positioned, e.g. `position: relative`,
 * so the panel's `position: absolute` places it in the editor's
 * top-right corner per acceptance criterion #1).
 */
export function attachSearchPanel(hostElement: HTMLElement, view: EditorView): SearchPanelHandle {
  return createSearchPanelDom(hostElement, view)
}

/**
 * Ctrl+F / Cmd+F keymap extension. `preventDefault: true` stops the
 * browser/Electron chrome's own find dialog from opening (the ticket's
 * "key technical constraint"). `getPanel` is a thunk rather than a
 * direct reference because the keymap must be registered before the
 * panel DOM/handle exists (see `searchExtensions` doc above) - by the
 * time Ctrl+F is actually pressed, init.ts has filled in the ref it
 * closes over.
 */
export function findKeymapExtension(getPanel: () => SearchPanelHandle | null): Extension {
  const bindings: KeyBinding[] = [
    {
      key: 'Mod-f',
      preventDefault: true,
      run: () => {
        const panel = getPanel()
        if (!panel) return false
        panel.open()
        return true
      }
    }
  ]
  return keymap.of(bindings)
}
