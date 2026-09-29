import { StateEffect, StateField, EditorSelection, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

/**
 * Ticket #22 acceptance criterion #5: clicking a search result jumps to
 * the matching file/line and highlights that line for 3 seconds, then the
 * highlight disappears (without deleting/altering any document text - this
 * is a transient decoration, same pattern as #23's search-match marks).
 *
 * Kept in its own module/StateField (like searchPanel.ts's find-in-document
 * state) since it's a distinct concern from both the WYSIWYG decorations
 * (#15) and the Ctrl+F match highlighting (#23): those are driven by
 * cursor position / an active find query, this is a one-shot "flash this
 * line" triggered externally by the search sidebar.
 */

const setHighlightedLine = StateEffect.define<number | null>() // line number (1-based) or null to clear

function buildHighlightDecoration(lineNumber: number | null, doc: EditorView['state']['doc']): DecorationSet {
  if (lineNumber === null) return Decoration.none
  if (lineNumber < 1 || lineNumber > doc.lines) return Decoration.none

  const line = doc.line(lineNumber)
  return Decoration.set([Decoration.line({ class: 'cf-line-highlight' }).range(line.from)])
}

const highlightDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    let next = deco
    for (const effect of tr.effects) {
      if (effect.is(setHighlightedLine)) {
        next = buildHighlightDecoration(effect.value, tr.state.doc)
      }
    }
    // Doc changes clear the highlighted line number (see `highlightField`
    // above); mirror that here so the decoration doesn't linger pointing
    // at a now-stale line offset.
    if (tr.docChanged && !tr.effects.some((e) => e.is(setHighlightedLine))) {
      next = Decoration.none
    }
    return next
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** The StateField this feature needs, to include in `EditorState.create`'s extensions list. */
export function revealLineExtensions(): Extension {
  return [highlightDecorationField]
}

/**
 * Scrolls `lineNumber` (1-based) into view centered, and flashes a
 * highlight on it for `durationMs` (default 3000ms per acceptance
 * criterion #5), then clears the highlight automatically.
 */
export function revealAndHighlightLine(view: EditorView, lineNumber: number, durationMs = 3000): void {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return

  const line = view.state.doc.line(lineNumber)
  view.dispatch({
    selection: EditorSelection.cursor(line.from),
    effects: [
      EditorView.scrollIntoView(line.from, { y: 'center' }),
      setHighlightedLine.of(lineNumber)
    ]
  })

  setTimeout(() => {
    // Guard against the view having been destroyed (tab closed) during
    // the timeout window.
    if (view.dom.isConnected) {
      view.dispatch({ effects: setHighlightedLine.of(null) })
    }
  }, durationMs)
}
