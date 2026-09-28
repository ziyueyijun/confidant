import './styles/editor.css'
import { createMarkdownEditor, type MarkdownEditorHandle } from './editor/init'
import type { FileEncodingInfo } from '../../preload/index'

/**
 * Ticket #15 scope: open a single file (via command-line arg passed
 * through preload, falling back to a bundled sample doc), render it
 * with live Typora-style editing, and autosave it back to disk. Still
 * no file tree or tabs (#17) - single-document only.
 */
async function bootstrap(): Promise<void> {
  const host = document.getElementById('editor-host')
  if (!host) throw new Error('Missing #editor-host mount point')

  const filePath = await window.api.getInitialFilePath()
  let content: string
  // Files opened from disk carry whatever BOM/line-ending they already
  // have; the sample doc (no file on disk yet) defaults to "no BOM" -
  // the spec's "新建文件用 CRLF" default is handled by
  // `detectLineEnding()` in the main process the first time a brand new
  // file is saved, so nothing extra is needed on the renderer side here.
  let encoding: FileEncodingInfo = { hasBOM: false, lineEnding: 'CRLF' }

  if (filePath) {
    try {
      const result = await window.api.readFile(filePath)
      content = result.content
      encoding = result.encoding
      if (result.warning) {
        // UI treatment (e.g. a visible banner) lands in a later ticket;
        // for #14 we only need the main process to detect and surface this.
        console.warn(result.warning)
      }
    } catch (err) {
      content = `# Could not open file\n\n${filePath}\n\n\`\`\`\n${String(err)}\n\`\`\`\n`
    }
  } else {
    content = SAMPLE_DOC
  }

  const handle = createMarkdownEditor(host, content, async (docContent) => {
    if (!filePath) return // Nothing to save back to when there's no file on disk (sample doc).
    await window.api.writeFile(filePath, docContent, { hasBOM: encoding.hasBOM })
  })

  wireLifecycleFlush(handle)
}

/**
 * Ticket #15 acceptance criterion #3: save on blur (handled inside
 * createMarkdownEditor via the contentDOM blur listener) and on
 * tab/window close. `visibilitychange`+`beforeunload` cover both "user
 * switches away from this window/tab" and "window is being closed" -
 * the same hook point ticket #17 will reuse per-tab.
 */
function wireLifecycleFlush(handle: MarkdownEditorHandle): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void handle.flushSave()
    }
  })

  window.addEventListener('beforeunload', () => {
    void handle.flushSave()
  })
}

const SAMPLE_DOC = `---
title: Confidant scaffold
tags: [demo]
---

# Confidant

This is an editable **WYSIWYG** preview rendered by *CodeMirror 6*. Move
your cursor into this bold text, or into a \`code span\`, to see the
markdown syntax markers appear.

> Open a file from the command line to load and autosave your own markdown.

- click into a list item to see its marker
- edits autosave 500ms after you stop typing
- no file tree or tabs yet - those land in ticket #17

This sample document isn't backed by a file on disk, so edits here aren't persisted; open a real \`.md\` file to see autosave write to disk.
`

bootstrap().catch((err) => {
  console.error('Failed to bootstrap renderer', err)
})
