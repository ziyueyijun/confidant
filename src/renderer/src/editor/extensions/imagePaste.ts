import { EditorView } from '@codemirror/view'
import { dirname } from 'path-browserify'

/**
 * Ticket #24: handles image paste (Ctrl+V) and drag-and-drop.
 *
 * Acceptance criteria:
 * - Clipboard bitmap (screenshot) → save as PNG to attachments/
 * - Clipboard/dragged local file → copy to attachments/ (preserve format)
 * - Browser drag-and-drop → download and save to attachments/
 * - Naming: YYYYMMDD-xxxx.ext (timestamp + 4-char hex)
 * - Relative paths: attachments/xxx for library root, ../attachments/xxx for subdirs
 */
export function imagePasteExtension(
  getLibraryPath: () => string | null,
  getCurrentFilePath: () => string | null
) {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const items = event.clipboardData?.items
      if (!items) return false

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault()
          const blob = item.getAsFile()
          if (!blob) continue

          const libraryPath = getLibraryPath()
          if (!libraryPath) return true

          // Convert blob to base64 data URL
          const reader = new FileReader()
          reader.onload = async () => {
            try {
              const dataUrl = reader.result as string
              const filename = await window.api.saveImageFromClipboard(libraryPath, dataUrl)
              insertImageMarkdown(view, filename, getCurrentFilePath(), libraryPath)
            } catch (error) {
              console.error('Failed to save clipboard image:', error)
            }
          }
          reader.readAsDataURL(blob)
          return true
        }
      }
      return false
    },

    drop: (event, view) => {
      const libraryPath = getLibraryPath()
      if (!libraryPath) return false

      const files = event.dataTransfer?.files
      const html = event.dataTransfer?.getData('text/html')
      const url = html?.match(/src="([^"]+)"/)?.[1]

      if (files && files.length > 0) {
        // Local file drag-and-drop
        let handled = false
        for (const file of Array.from(files)) {
          // In Electron, File objects have a 'path' property
          const filePath = (file as File & { path?: string }).path
          if (file.type.startsWith('image/') && filePath) {
            event.preventDefault()
            handled = true
            // Handle async operation without blocking return
            void (async () => {
              try {
                const filename = await window.api.copyImageFile(libraryPath, filePath)
                insertImageMarkdown(view, filename, getCurrentFilePath(), libraryPath)
              } catch (error) {
                console.error('Failed to copy image file:', error)
              }
            })()
          }
        }
        return handled
      } else if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        // Browser image drag-and-drop
        event.preventDefault()
        // Handle async operation without blocking return
        void (async () => {
          try {
            const filename = await window.api.downloadImage(libraryPath, url)
            insertImageMarkdown(view, filename, getCurrentFilePath(), libraryPath)
          } catch (error) {
            console.error('Failed to download image:', error)
          }
        })()
        return true
      }

      return false
    }
  })
}

/**
 * Inserts `![](relativePath)` at the current cursor position.
 */
function insertImageMarkdown(
  view: EditorView,
  filename: string,
  currentFilePath: string | null,
  libraryPath: string
): void {
  const relativePath = computeRelativePath(currentFilePath, libraryPath, filename)
  const markdown = `![](${relativePath})`

  const { from } = view.state.selection.main
  view.dispatch({
    changes: { from, insert: markdown },
    selection: { anchor: from + markdown.length }
  })
}

/**
 * Computes the relative path from the current markdown file to the image.
 * - If file is in library root: `attachments/filename`
 * - If file is in a subdirectory: `../attachments/filename`
 */
function computeRelativePath(
  currentFilePath: string | null,
  libraryPath: string,
  filename: string
): string {
  if (!currentFilePath) {
    return `attachments/${filename}`
  }

  const fileDir = dirname(currentFilePath).replace(/\\/g, '/')
  const normalizedLibraryPath = libraryPath.replace(/\\/g, '/')

  if (fileDir === normalizedLibraryPath) {
    return `attachments/${filename}`
  } else {
    // File is in a subdirectory, need ../attachments/
    return `../attachments/${filename}`
  }
}
