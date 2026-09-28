import './styles/editor.css'
import { createReadOnlyMarkdownEditor } from './editor/init'

/**
 * Ticket #14 scope: open a single file (via command-line arg passed
 * through preload, falling back to a bundled sample doc) and render it
 * read-only. No file tree, tabs, editing, or autosave yet.
 */
async function bootstrap(): Promise<void> {
  const host = document.getElementById('editor-host')
  if (!host) throw new Error('Missing #editor-host mount point')

  const filePath = await window.api.getInitialFilePath()
  let content: string

  if (filePath) {
    try {
      const result = await window.api.readFile(filePath)
      content = result.content
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

  createReadOnlyMarkdownEditor(host, content)
}

const SAMPLE_DOC = `---
title: Confidant scaffold
tags: [demo]
---

# Confidant

This is a **read-only** WYSIWYG preview rendered by *CodeMirror 6*.

> Open a file from the command line to render your own markdown.

- input rules
- autosave
- editing

Those land in later tickets. This ticket only proves the render pipeline works: \`main -> preload -> renderer -> CodeMirror\`.
`

bootstrap().catch((err) => {
  console.error('Failed to bootstrap renderer', err)
})
