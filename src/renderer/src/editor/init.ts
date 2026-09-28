import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { buildWysiwygDecorations, frontmatterLineDecoration } from './decorations'
import { splitFrontmatter } from '../lib/markdown'

/**
 * Ticket #14: read-only WYSIWYG rendering.
 *
 * `EditorState.readOnly` / view `editable: false` are set because this
 * ticket does not implement editing, autosave, or cursor-driven marker
 * show/hide (ticket #15/#16). The CodeMirror instance is still real
 * (not a static HTML render) so that the later tickets can flip it to
 * editable without swapping the rendering engine.
 */
function wysiwygPlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildWysiwygDecorations(view.state)
      }

      update(): void {
        // Read-only document: decorations never need to be recomputed
        // after the initial build in this ticket's scope.
      }
    },
    {
      decorations: (v) => v.decorations
    }
  )
}

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
      update(): void {
        // Static for a read-only document.
      }
    },
    { decorations: (v) => v.decorations }
  )
}

export function createReadOnlyMarkdownEditor(parent: HTMLElement, content: string): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [
      markdown({ codeLanguages: languages }),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      frontmatterPlugin(content),
      wysiwygPlugin(),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { fontFamily: 'inherit' }
      })
    ]
  })

  return new EditorView({ state, parent })
}
