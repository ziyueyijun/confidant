import './styles/editor.css'
import { createReadOnlyMarkdownEditor } from './editor/init'
import { applyEditorWidth, applyTheme } from './theme/applyTheme'
import type { ThemeName } from '@shared/theme'

/**
 * Ticket #14 scope: open a single file (via command-line arg passed
 * through preload, falling back to a bundled sample doc) and render it
 * read-only. No file tree, tabs, editing, or autosave yet.
 *
 * Ticket #18 scope: load/apply/persist the light/dark theme and editor
 * width. No settings panel UI yet (deferred, per ticket) beyond the
 * minimal toggle button wired in `setupThemeToggle`.
 */
async function bootstrap(): Promise<void> {
  const host = document.getElementById('editor-host')
  if (!host) throw new Error('Missing #editor-host mount point')

  const themeConfig = await window.api.getTheme()
  applyTheme(themeConfig.theme)
  applyEditorWidth(themeConfig.editorWidth)
  setupThemeToggle(themeConfig.theme)

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

/**
 * Minimal toggle entry point for manual verification (ticket #18 does
 * not require a full settings panel). Persists the choice via
 * `theme:set` so it survives restarts.
 */
function setupThemeToggle(initial: ThemeName): void {
  const button = document.getElementById('theme-toggle')
  if (!button) return

  let current = initial

  button.addEventListener('click', () => {
    current = current === 'light' ? 'dark' : 'light'
    applyTheme(current)
    window.api.setTheme({ theme: current, editorWidth: readEditorWidth() }).catch((err) => {
      console.error('Failed to persist theme', err)
    })
  })
}

function readEditorWidth(): '800px' | '1000px' | '100%' {
  const value = document.body.style.getPropertyValue('--editor-max-width').trim()
  return value === '1000px' || value === '100%' ? value : '800px'
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
