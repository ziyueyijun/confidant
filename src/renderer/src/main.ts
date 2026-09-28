import './styles/editor.css'
import { createReadOnlyMarkdownEditor } from './editor/init'
import { applyEditorWidth, applyTheme } from './theme/applyTheme'
import { EDITOR_WIDTH_OPTIONS, type EditorWidth, type ThemeName } from '@shared/theme'

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
  setupThemeToggle()
  setupWidthToggle()

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
 * Minimal toggle entry points for manual verification (ticket #18 does
 * not require a full settings panel). Both buttons read the *other*
 * setting straight from the live DOM state (`readCurrentTheme` /
 * `readCurrentEditorWidth`) rather than from a second closure variable,
 * so clicking one button can never stomp on a stale copy of the other.
 * Each persists the full config via `theme:set` so it survives restarts.
 */
function setupThemeToggle(): void {
  const button = document.getElementById('theme-toggle')
  if (!button) return

  button.addEventListener('click', () => {
    const next: ThemeName = readCurrentTheme() === 'light' ? 'dark' : 'light'
    applyTheme(next)
    window.api.setTheme({ theme: next, editorWidth: readCurrentEditorWidth() }).catch((err) => {
      console.error('Failed to persist theme', err)
    })
  })
}

/**
 * Cycles editor width 800px -> 1000px -> 100% -> back to 800px. A full
 * settings panel is out of scope for #18; this closes the gap where the
 * width was persistable/appliable but had no UI control at all.
 */
function setupWidthToggle(): void {
  const button = document.getElementById('width-toggle')
  if (!button) return

  button.addEventListener('click', () => {
    const currentIndex = EDITOR_WIDTH_OPTIONS.indexOf(readCurrentEditorWidth())
    const next = EDITOR_WIDTH_OPTIONS[(currentIndex + 1) % EDITOR_WIDTH_OPTIONS.length]
    applyEditorWidth(next)
    window.api.setTheme({ theme: readCurrentTheme(), editorWidth: next }).catch((err) => {
      console.error('Failed to persist editor width', err)
    })
  })
}

function readCurrentTheme(): ThemeName {
  return document.body.dataset.theme === 'dark' ? 'dark' : 'light'
}

function readCurrentEditorWidth(): EditorWidth {
  const value = document.body.style.getPropertyValue('--editor-max-width').trim()
  return (EDITOR_WIDTH_OPTIONS as readonly string[]).includes(value)
    ? (value as EditorWidth)
    : '800px'
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
