import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

/**
 * Ticket #24: renders inline images from markdown `![alt](src)` syntax.
 *
 * Acceptance criteria:
 * - Default max-width 800px, max-height 1000px
 * - Click to open fullscreen preview (black overlay, Esc to close)
 * - On load error: show placeholder "🖼 图片加载失败: path"
 */

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span')
    container.className = 'cm-image-widget'
    container.style.display = 'inline-block'
    container.style.maxWidth = '800px'

    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.style.maxWidth = '800px'
    img.style.maxHeight = '1000px'
    img.style.cursor = 'pointer'
    img.style.display = 'block'

    img.onerror = () => {
      img.replaceWith(createErrorPlaceholder(this.src))
    }

    img.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      showFullscreenPreview(this.src)
    }

    container.appendChild(img)
    return container
  }

  eq(other: ImageWidget): boolean {
    return this.src === other.src && this.alt === other.alt
  }
}

function createErrorPlaceholder(src: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = `🖼 图片加载失败: ${src}`
  span.style.color = '#d32f2f'
  span.style.fontFamily = 'monospace'
  span.style.fontSize = '0.9em'
  return span
}

function showFullscreenPreview(src: string): void {
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  `
  overlay.tabIndex = -1

  const img = document.createElement('img')
  img.src = src
  img.style.maxWidth = '90%'
  img.style.maxHeight = '90%'
  img.style.objectFit = 'contain'

  overlay.appendChild(img)
  document.body.appendChild(overlay)

  const closeOverlay = (): void => {
    overlay.remove()
  }

  overlay.onclick = closeOverlay
  overlay.onkeydown = (e) => {
    if (e.key === 'Escape') closeOverlay()
  }

  // Focus overlay so keyboard events work
  setTimeout(() => overlay.focus(), 0)
}

/**
 * Scans the syntax tree for image nodes `![alt](src)` and creates
 * widget decorations to render them inline.
 */
function buildImageDecorations(state: EditorState): DecorationSet {
  const widgets: Array<{ from: number; to: number; widget: WidgetType }> = []

  syntaxTree(state).iterate({
    enter: (node) => {
      // Markdown image syntax: Image node contains URL and optionally alt text
      if (node.name === 'Image') {
        const imageText = state.doc.sliceString(node.from, node.to)
        const match = imageText.match(/!\[([^\]]*)\]\(([^)]+)\)/)

        if (match) {
          const alt = match[1]
          const src = match[2]
          widgets.push({
            from: node.to,
            to: node.to,
            widget: new ImageWidget(src, alt)
          })
        }
      }
    }
  })

  return Decoration.set(
    widgets.map((w) => Decoration.widget({ widget: w.widget, side: 1 }).range(w.from))
  )
}

/**
 * ViewPlugin that renders images inline in the editor.
 */
export function imageWidgetExtension() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildImageDecorations(view.state)
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildImageDecorations(update.state)
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  )
}
