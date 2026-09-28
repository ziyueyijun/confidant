import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { languages } from '@codemirror/language-data'
import { buildWysiwygDecorations, frontmatterLineDecoration } from './decorations'
import { splitFrontmatter } from '../lib/markdown'
import { createAutosaveController, type AutosaveController } from './autosave'
import { attachSearchPanel, findKeymapExtension, searchExtensions, type SearchPanelHandle } from './searchPanel'
import { revealAndHighlightLine, revealLineExtensions } from './revealLine'

/**
 * Ticket #15: the editor is now live.
 *
 * `readOnly`/`editable: false` from #14 are gone. Decorations are no
 * longer computed once at construction time - `update()` recomputes
 * them whenever the selection or document changes, so markers show
 * while the cursor is inside their node and hide once it leaves
 * (Typora-style Live Preview, acceptance criteria #1/#2).
 */
function wysiwygPlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildWysiwygDecorations(view.state)
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet) {
          this.decorations = buildWysiwygDecorations(update.view.state)
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  )
}

/**
 * Frontmatter is still detected once from the original source text
 * (spec: the boundary between frontmatter and body doesn't move once a
 * document is open - editing the body never changes where the
 * frontmatter block ends, and editing inside the frontmatter block
 * itself is out of scope for re-detecting the boundary here). The line
 * range is recomputed on doc changes so line numbers stay correct if
 * lines are inserted/removed above/below, but the frontmatter's own
 * line count is fixed at open time.
 */
function frontmatterPlugin(source: string): Extension {
  const { frontmatter } = splitFrontmatter(source)
  if (!frontmatter) return []

  const lineCount = frontmatter.split('\n').length

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = frontmatterLineDecoration(1, lineCount, view.state)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = frontmatterLineDecoration(1, lineCount, update.view.state)
        }
      }
    },
    { decorations: (v) => v.decorations }
  )
}

/**
 * Wires the 500ms-after-typing-stops autosave (acceptance criterion #3)
 * using the document-agnostic `AutosaveController` from ./autosave.
 *
 * `onSave` gets the doc text via `state.doc.sliceString(0, length,
 * lineSeparator)`, NOT `state.doc.toString()`. `Text.toString()` is
 * documented to always join lines with a bare `\n` regardless of what
 * was loaded (CM6's `Text` class stores a document as an array of line
 * strings with the separators already stripped out - there's no
 * "preserved" CRLF sitting in the model for `toString()` to return).
 * `sliceString`'s optional `lineSep` parameter is the actual supported
 * way to reconstitute the original separator on the way out. Passing
 * the exact on-disk separator here is what makes minimal-diff saves
 * (acceptance criterion #6) work for CRLF files - which on Windows are
 * the common case, not an edge case.
 */
function autosavePlugin(
  view: () => EditorView,
  onSave: (content: string) => Promise<void>,
  lineSeparator: string
): {
  extension: Extension
  controller: AutosaveController
} {
  const controller = createAutosaveController({
    save: onSave,
    getContent: () => view().state.doc.sliceString(0, view().state.doc.length, lineSeparator)
  })

  const extension = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      controller.markDirty()
      controller.scheduleSave()
    }
  })

  return { extension, controller }
}

export interface MarkdownEditorHandle {
  view: EditorView
  /**
   * Flushes any pending autosave immediately. Call on blur/tab-switch/
   * tab-close/window-close so edits within the last 500ms aren't lost.
   * Exposed on the handle (rather than only wired to window blur here)
   * so ticket #17's per-tab lifecycle can call it directly too.
   */
  flushSave: () => Promise<void>
  /** Tears down autosave timers. Call when the editor is being discarded. */
  destroy: () => void
  /**
   * Ticket #22 acceptance criterion #5: scrolls to `lineNumber` (1-based)
   * and flashes a highlight on it for 3 seconds. Used when the user
   * clicks a full-text search result.
   */
  revealLine: (lineNumber: number) => void
}

/**
 * Creates a live, editable markdown WYSIWYG editor.
 *
 * `onSave` is called with the full current document text whenever an
 * autosave is due (debounced 500ms after edits stop, or immediately via
 * the returned `flushSave`). The caller is responsible for actually
 * persisting it (main-process IPC + atomic write - see
 * src/main/fileSystem.ts `writeMarkdownFile`).
 *
 * `lineSeparator` MUST be the exact line ending detected on disk
 * (`fileSystem.ts`'s `detectLineEnding`, either `'\r\n'` or `'\n'`).
 * `Text.toString()` always joins lines with a bare `\n` (that's its
 * documented behavior - CM6's `Text` stores a document as an array of
 * line strings with separators already stripped, so there's no
 * "preserved" CRLF for `toString()` to return regardless of what was
 * loaded or which facets are set). `autosavePlugin` reads the doc via
 * `sliceString(0, length, lineSeparator)` instead, which is the API
 * that actually supports round-tripping the original separator. We
 * also pin the `EditorState.lineSeparator` facet here so that CM6-driven
 * edits (e.g. inserting a newline while typing) use the matching
 * separator internally, keeping the two consistent.
 */
export function createMarkdownEditor(
  parent: HTMLElement,
  content: string,
  onSave: (content: string) => Promise<void>,
  lineSeparator: '\r\n' | '\n' = '\n'
): MarkdownEditorHandle {
  let viewRef: EditorView
  // Ticket #23: the Ctrl+F keymap must be part of the extensions passed
  // to `EditorState.create` below, but the find panel it opens needs a
  // live `EditorView` + a DOM node to anchor to, both of which only
  // exist *after* the view is constructed. This ref lets the keymap
  // (registered up front) call into the panel (attached afterwards)
  // without restructuring the state/view creation order.
  let searchPanelRef: SearchPanelHandle | null = null

  const { extension: autosaveExtension, controller } = autosavePlugin(
    () => viewRef,
    onSave,
    lineSeparator
  )

  const state = EditorState.create({
    doc: content,
    extensions: [
      EditorState.lineSeparator.of(lineSeparator),
      markdown({ codeLanguages: languages, extensions: [Table] }),
      EditorView.lineWrapping,
      frontmatterPlugin(content),
      wysiwygPlugin(),
      searchExtensions(),
      findKeymapExtension(() => searchPanelRef),
      revealLineExtensions(),
      autosaveExtension,
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { fontFamily: 'inherit' }
      })
    ]
  })

  viewRef = new EditorView({ state, parent })

  // Anchor the floating find panel to `parent` (the same host CM6 mounts
  // into, `#editor-host` per main.ts) so it's positioned relative to the
  // editor's own top-right corner (acceptance criterion #1), not the
  // whole window.
  searchPanelRef = attachSearchPanel(parent, viewRef)

  const handleBlur = (): void => {
    void controller.flush()
  }
  viewRef.contentDOM.addEventListener('blur', handleBlur)

  return {
    view: viewRef,
    flushSave: () => controller.flush(),
    destroy: () => {
      viewRef.contentDOM.removeEventListener('blur', handleBlur)
      searchPanelRef?.destroy()
      controller.dispose()
      viewRef.destroy()
    },
    revealLine: (lineNumber: number) => revealAndHighlightLine(viewRef, lineNumber)
  }
}
