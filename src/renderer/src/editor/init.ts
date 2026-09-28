import { Annotation, EditorState, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { languages } from '@codemirror/language-data'
import { buildWysiwygDecorations, frontmatterLineDecoration } from './decorations'
import { splitFrontmatter } from '../lib/markdown'
import { createAutosaveController, type AutosaveController } from './autosave'
import { attachSearchPanel, findKeymapExtension, searchExtensions, type SearchPanelHandle } from './searchPanel'

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
/**
 * Ticket #20: tags a transaction as "external reload" so the
 * `updateListener` below (which drives autosave dirty-tracking) can tell
 * it apart from a real user edit. Without this, `reloadContent`'s
 * programmatic doc replacement (silent reload / "use external version")
 * would itself mark the document dirty and schedule a pointless
 * autosave write of content that already matches disk.
 */
export const externalReloadAnnotation = Annotation.define<boolean>()

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
    if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalReloadAnnotation))) {
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
  /**
   * True if there are edits not yet persisted to disk (ticket #20:
   * queried when an external-change event arrives to decide silent
   * reload vs. conflict dialog - acceptance criteria #4/#6).
   */
  isDirty: () => boolean
  /**
   * Replaces the document content in place, preserving cursor position
   * and scroll offset as closely as possible (ticket #20 acceptance
   * criterion #4: silent reload on a no-conflict external change).
   * Selection offsets are clamped to the new document length in case the
   * external edit shortened the file. Does not mark the document dirty
   * or trigger autosave - this reflects what's already on disk.
   */
  reloadContent: (content: string) => void
  /** Tears down autosave timers. Call when the editor is being discarded. */
  destroy: () => void
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
    isDirty: () => controller.isDirty(),
    reloadContent: (content: string) => {
      const view = viewRef
      const previousSelection = view.state.selection
      const previousScrollTop = view.scrollDOM.scrollTop
      const previousScrollLeft = view.scrollDOM.scrollLeft

      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        // Clamp the old selection into the new document length (the
        // external edit may have shortened the file) rather than
        // resetting to 0 - this is what "preserve cursor position" means
        // when the doc itself changed underneath the cursor.
        selection: {
          anchor: Math.min(previousSelection.main.anchor, content.length),
          head: Math.min(previousSelection.main.head, content.length)
        },
        annotations: externalReloadAnnotation.of(true)
      })

      // CM6 can adjust scroll position as a side effect of the content
      // change (e.g. if the new doc is shorter); restore it explicitly
      // on the next frame so the user doesn't see a jump.
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = previousScrollTop
        view.scrollDOM.scrollLeft = previousScrollLeft
      })

      // The reloaded content now matches disk exactly - clear any dirty
      // flag left over from local edits that this reload is discarding
      // (ticket #20 "use external version" conflict resolution), so a
      // later autosave doesn't rewrite identical content back to disk.
      controller.clearDirty()
    },
    destroy: () => {
      viewRef.contentDOM.removeEventListener('blur', handleBlur)
      searchPanelRef?.destroy()
      controller.dispose()
      viewRef.destroy()
    }
  }
}
