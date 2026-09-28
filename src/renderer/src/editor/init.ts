import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { languages } from '@codemirror/language-data'
import { buildWysiwygDecorations, frontmatterLineDecoration } from './decorations'
import { splitFrontmatter } from '../lib/markdown'
import { createAutosaveController, type AutosaveController } from './autosave'

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
 * `onSave` gets the exact current doc text via `state.doc.toString()` -
 * no re-serialization/AST round-trip, so whatever bytes CM6 is holding
 * (untouched lines, indentation, CRLF, trailing hard-break spaces) are
 * exactly what gets written (minimal-diff requirement).
 */
function autosavePlugin(view: () => EditorView, onSave: (content: string) => Promise<void>): {
  extension: Extension
  controller: AutosaveController
} {
  const controller = createAutosaveController({
    save: onSave,
    getContent: () => view().state.doc.toString()
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
}

/**
 * Creates a live, editable markdown WYSIWYG editor.
 *
 * `onSave` is called with the full current document text whenever an
 * autosave is due (debounced 500ms after edits stop, or immediately via
 * the returned `flushSave`). The caller is responsible for actually
 * persisting it (main-process IPC + atomic write - see
 * src/main/fileSystem.ts `writeMarkdownFile`).
 */
export function createMarkdownEditor(
  parent: HTMLElement,
  content: string,
  onSave: (content: string) => Promise<void>
): MarkdownEditorHandle {
  let viewRef: EditorView

  const { extension: autosaveExtension, controller } = autosavePlugin(() => viewRef, onSave)

  const state = EditorState.create({
    doc: content,
    extensions: [
      markdown({ codeLanguages: languages, extensions: [Table] }),
      EditorView.lineWrapping,
      frontmatterPlugin(content),
      wysiwygPlugin(),
      autosaveExtension,
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { fontFamily: 'inherit' }
      })
    ]
  })

  viewRef = new EditorView({ state, parent })

  const handleBlur = (): void => {
    void controller.flush()
  }
  viewRef.contentDOM.addEventListener('blur', handleBlur)

  return {
    view: viewRef,
    flushSave: () => controller.flush(),
    destroy: () => {
      viewRef.contentDOM.removeEventListener('blur', handleBlur)
      controller.dispose()
      viewRef.destroy()
    }
  }
}
