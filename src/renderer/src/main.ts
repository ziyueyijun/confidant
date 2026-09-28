import './styles/editor.css'
import { createMarkdownEditor, type MarkdownEditorHandle } from './editor/init'
import { applyEditorWidth, applyTheme } from './theme/applyTheme'
import { EDITOR_WIDTH_OPTIONS, type EditorWidth, type ThemeName } from '@shared/theme'
import type { FileEncodingInfo, FileTreeNode } from '../../preload/index'
import { openTab, focusTab, closeTab, renameTab, EMPTY_TAB_STATE, type TabState } from './tabs/tabState'
import { renderTabBar, basename } from './tabs/tabBarView'
import { renderFileTree } from './sidebar/fileTreeView'
import { handleExternalChangeEvent, type ExternalChangeHooks } from './watch/externalChangeHandler'

/**
 * Ticket #14 scope: open a single file (via command-line arg passed
 * through preload, falling back to a bundled sample doc) and render it.
 *
 * Ticket #15 scope: render it with live Typora-style editing and
 * autosave it back to disk.
 *
 * Ticket #18 scope: load/apply/persist the light/dark theme and editor
 * width.
 *
 * Ticket #17 scope: library mode. Opening a folder shows a file tree in
 * the sidebar; clicking a `.md` file opens it in its own tab (its own
 * `MarkdownEditorHandle`/CM6 instance, per the ticket's lifecycle
 * requirement). A file passed on the command line is still supported -
 * it's opened as the first tab rather than being the only thing the app
 * can show.
 */

/** One open document: its editor instance, DOM host, and save-relevant metadata. */
interface OpenDocument {
  handle: MarkdownEditorHandle
  hostElement: HTMLDivElement
  encoding: FileEncodingInfo
  /** Ticket #20 acceptance criterion #5: true once this document's backing file was deleted externally. */
  deleted: boolean
  /**
   * Mutable holder for the path this document's autosave writes to.
   * Normally equal to the `documents` map key it's stored under, but a
   * "Save As" (ticket #20) can retarget it to a new path without
   * recreating the editor - see `createDocumentForTab`/`saveAs`.
   */
  pathHolder: { path: string }
}

async function bootstrap(): Promise<void> {
  const editorHostsContainer = document.getElementById('editor-hosts')
  const tabBarContainer = document.getElementById('tab-bar')
  const fileTreeContainer = document.getElementById('file-tree')
  const sidebar = document.getElementById('sidebar')
  const libraryNameLabel = document.getElementById('library-name')
  if (!editorHostsContainer || !tabBarContainer || !fileTreeContainer || !sidebar || !libraryNameLabel) {
    throw new Error('Missing required layout mount points')
  }

  const themeConfig = await window.api.getTheme()
  applyTheme(themeConfig.theme)
  applyEditorWidth(themeConfig.editorWidth)
  setupThemeToggle()
  setupWidthToggle()
  setupSidebarCollapseToggle(sidebar)

  let tabState: TabState = EMPTY_TAB_STATE
  const documents = new Map<string, OpenDocument>()

  function rerenderTabBar(): void {
    renderTabBar(tabBarContainer!, tabState, {
      onSelectTab: (path) => void switchToTab(path),
      onCloseTab: (path) => void closeDocumentTab(path),
      isDeleted: (path) => documents.get(path)?.deleted ?? false
    })
    for (const [path, doc] of documents) {
      doc.hostElement.classList.toggle('cf-editor-pane-active', path === tabState.activePath)
    }
    updateStatusBar()
  }

  // --- Ticket #20: status bar for the active tab's "deleted externally" state (acceptance criterion #5) ---

  const statusBar = document.getElementById('status-bar')
  const statusBarMessage = document.getElementById('status-bar-message')
  const statusBarSaveAsButton = document.getElementById('status-bar-save-as')

  function updateStatusBar(): void {
    if (!statusBar || !statusBarMessage) return
    const activeDoc = tabState.activePath ? documents.get(tabState.activePath) : undefined
    const showDeleted = Boolean(activeDoc?.deleted)
    statusBar.classList.toggle('cf-status-bar-visible', showDeleted)
    if (showDeleted) {
      statusBarMessage.textContent = '文件已被外部删除，改动无法保存到原路径 - 请另存为'
    }
  }

  statusBarSaveAsButton?.addEventListener('click', () => {
    if (tabState.activePath) void saveAs(tabState.activePath)
  })

  function rerenderFileTree(nodes: FileTreeNode[]): void {
    renderFileTree(fileTreeContainer!, nodes, {
      onOpenFile: (path) => void openFileInTab(path),
      isActive: (path) => path === tabState.activePath
    })
  }

  /**
   * Flushes the currently active tab's autosave before switching away
   * from it (acceptance criterion #5). Safe to call when there is no
   * active tab yet (first open). Skips the flush for a tab whose file
   * was deleted externally (ticket #20 acceptance criterion #5) -
   * writing there would silently resurrect the file at its old path
   * instead of respecting the deletion, and the status bar already
   * tells the user their only path forward is Save As.
   */
  async function flushActiveTab(): Promise<void> {
    if (!tabState.activePath) return
    const doc = documents.get(tabState.activePath)
    if (doc && !doc.deleted) await doc.handle.flushSave()
  }

  async function switchToTab(path: string): Promise<void> {
    if (path === tabState.activePath) return
    await flushActiveTab()
    tabState = focusTab(tabState, path)
    rerenderTabBar()
    rerenderFileTreeActiveHighlight()
  }

  async function closeDocumentTab(path: string): Promise<void> {
    const doc = documents.get(path)
    if (doc) {
      if (!doc.deleted) await doc.handle.flushSave() // acceptance criterion #5: save on close (unless the file is already gone)
      doc.handle.destroy()
      doc.hostElement.remove()
      documents.delete(path)
    }
    tabState = closeTab(tabState, path)
    rerenderTabBar()
    rerenderFileTreeActiveHighlight()
  }

  /**
   * Opens `path` in a tab, or focuses its existing tab (acceptance
   * criterion #3). Reads the file from disk and creates a fresh
   * `MarkdownEditorHandle` only on first open.
   */
  async function openFileInTab(path: string): Promise<void> {
    await flushActiveTab()

    const result = openTab(tabState, path)
    tabState = result.state

    if (result.didOpen) {
      await createDocumentForTab(path)
    }

    rerenderTabBar()
    rerenderFileTreeActiveHighlight()
  }

  function rerenderFileTreeActiveHighlight(): void {
    fileTreeContainer!.querySelectorAll('.cf-tree-file-active').forEach((el) => {
      el.classList.remove('cf-tree-file-active')
    })
    if (tabState.activePath) {
      const active = fileTreeContainer!.querySelector<HTMLElement>(
        `[data-path="${cssEscape(tabState.activePath)}"]`
      )
      active?.classList.add('cf-tree-file-active')
    }
  }

  async function createDocumentForTab(path: string): Promise<void> {
    const hostElement = document.createElement('div')
    hostElement.className = 'cf-editor-pane'
    const inner = document.createElement('div')
    inner.className = 'cf-editor-host'
    hostElement.appendChild(inner)
    editorHostsContainer!.appendChild(hostElement)

    let content: string
    let encoding: FileEncodingInfo
    try {
      const result = await window.api.readFile(path)
      content = result.content
      encoding = result.encoding
      if (result.warning) console.warn(result.warning)
    } catch (err) {
      content = `# Could not open file\n\n${path}\n\n\`\`\`\n${String(err)}\n\`\`\`\n`
      encoding = { hasBOM: false, lineEnding: 'CRLF' }
    }

    // Mutable holder rather than closing over `path` directly: ticket
    // #20's "Save As" flow (for a tab whose file was deleted externally,
    // or the conflict dialog's "save a copy" choice) re-targets this
    // same open document/editor instance at a new path without
    // recreating the CM6 view - `saveAs` below updates `pathHolder.path`
    // so this `onSave` callback (and future autosaves) write to the new
    // location from then on.
    const pathHolder = { path }
    const lineSeparator = encoding.lineEnding === 'CRLF' ? '\r\n' : '\n'
    const handle = createMarkdownEditor(
      inner,
      content,
      async (docContent) => {
        await window.api.writeFile(pathHolder.path, docContent, { hasBOM: encoding.hasBOM })
      },
      lineSeparator
    )

    documents.set(path, { handle, hostElement, encoding, deleted: false, pathHolder })
  }

  // --- External change handling (ticket #20, acceptance criteria #3-#7) ---
  //
  // The main process's chokidar watcher (src/main/externalWatch.ts) pushes
  // one coalesced event per logical filesystem change via
  // `watch:externalChange`. `handleExternalChangeEvent` (pure routing
  // logic, unit tested against fake hooks in externalChangeHandler.test.ts)
  // decides silent-reload/mark-deleted/conflict-dialog; the hooks below
  // are what actually touch `documents`/the editor/disk.

  async function silentReload(path: string): Promise<void> {
    const doc = documents.get(path)
    if (!doc) return
    try {
      const result = await window.api.readFile(path)
      doc.handle.reloadContent(result.content)
      doc.encoding = result.encoding
    } catch (err) {
      console.error('Failed to reload externally changed file', path, err)
    }
  }

  function markDeleted(path: string): void {
    const doc = documents.get(path)
    if (!doc) return
    doc.deleted = true
    rerenderTabBar()
  }

  /** Conflict resolution: "keep my version" - overwrite disk with the current in-memory content. */
  async function keepMine(path: string): Promise<void> {
    const doc = documents.get(path)
    if (!doc) return
    await doc.handle.flushSave()
  }

  /** Conflict resolution: "use external version" - discard local edits and reload from disk. */
  async function useExternal(path: string): Promise<void> {
    await silentReload(path)
  }

  /**
   * Conflict resolution (and the deleted-file status bar action): "save
   * a copy" via a native Save As dialog. Writes the current in-memory
   * content to the chosen path, then re-targets this same open
   * tab/editor instance at the new path (rather than just writing a
   * copy and leaving the tab pointed at the old, gone path) - future
   * edits/autosaves go to the new location, the tab label updates, and
   * (for the deleted-file case) the red "已删除" state clears since the
   * document now has a real, existing backing file again.
   */
  async function saveAs(path: string): Promise<void> {
    const doc = documents.get(path)
    if (!doc) return
    const chosenPath = await window.api.saveAsDialog(path)
    if (!chosenPath) return

    const content = doc.handle.view.state.doc.sliceString(
      0,
      doc.handle.view.state.doc.length,
      doc.encoding.lineEnding === 'CRLF' ? '\r\n' : '\n'
    )
    await window.api.writeFile(chosenPath, content, { hasBOM: doc.encoding.hasBOM })

    if (chosenPath === path) {
      // Saved back over the same path (e.g. re-picked the identical
      // name from the dialog) - just clear the deleted flag, no
      // map/tab-state key change needed.
      doc.deleted = false
    } else {
      documents.delete(path)
      doc.deleted = false
      doc.pathHolder.path = chosenPath
      documents.set(chosenPath, doc)
      tabState = renameTab(tabState, path, chosenPath)
    }

    rerenderTabBar()
  }

  const externalChangeHooks: ExternalChangeHooks = {
    isOpen: (path) => documents.has(path),
    isDirty: (path) => documents.get(path)?.handle.isDirty() ?? false,
    silentReload,
    markDeleted,
    keepMine,
    useExternal,
    saveAs,
    labelFor: (path) => basename(path)
  }

  window.api.onExternalChange((event) => {
    void handleExternalChangeEvent(event, externalChangeHooks)
  })

  // --- Library open flow (acceptance criterion #1) ---

  async function openLibrary(libraryPath: string, recordAsOpened: boolean): Promise<void> {
    libraryNameLabel!.textContent = libraryPath
    libraryNameLabel!.title = libraryPath
    if (recordAsOpened) {
      await window.api.recordLibraryOpened(libraryPath)
    }
    const tree = await window.api.listDirectoryTree(libraryPath)
    rerenderFileTree(tree)
  }

  document.getElementById('open-library-button')?.addEventListener('click', () => {
    void (async () => {
      const chosen = await window.api.openLibraryDialog()
      if (chosen) await openLibrary(chosen, false) // dialog handler already recorded it
    })()
  })

  // --- Startup: command-line file (opened as a tab), and/or most recent library ---

  const initialFilePath = await window.api.getInitialFilePath()
  const recents = await window.api.getRecentLibraries()
  const mostRecentLibrary = recents.recentLibraryPaths[0] ?? null

  if (mostRecentLibrary) {
    await openLibrary(mostRecentLibrary, false)
  }

  if (initialFilePath) {
    await openFileInTab(initialFilePath)
  } else if (!mostRecentLibrary) {
    // Nothing to show yet: no library, no file on the command line.
    // Fall back to the sample doc so the app isn't a blank screen.
    await openSampleDocument()
  }

  rerenderTabBar()
  wireLifecycleFlush()

  async function openSampleDocument(): Promise<void> {
    const hostElement = document.createElement('div')
    hostElement.className = 'cf-editor-pane cf-editor-pane-active'
    const inner = document.createElement('div')
    inner.className = 'cf-editor-host'
    hostElement.appendChild(inner)
    editorHostsContainer!.appendChild(hostElement)

    const handle = createMarkdownEditor(inner, SAMPLE_DOC, async () => {
      // Sample doc isn't backed by a file on disk; nothing to persist.
    })

    const samplePath = '__sample__'
    documents.set(samplePath, {
      handle,
      hostElement,
      encoding: { hasBOM: false, lineEnding: 'CRLF' },
      deleted: false,
      pathHolder: { path: samplePath }
    })
    tabState = { tabs: [samplePath], activePath: samplePath }
  }

  function wireLifecycleFlush(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void flushActiveTab()
      }
    })

    window.addEventListener('beforeunload', () => {
      void flushActiveTab()
    })
  }
}

/** Minimal CSS.escape polyfill-free helper: only paths ever go here, and this is attribute-value safe. */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

/**
 * Cycles editor width 800px -> 1000px -> 100% -> back to 800px, and the
 * light/dark toggle. Both read the *other* setting straight from live DOM
 * state (`readCurrentTheme`/`readCurrentEditorWidth`) rather than a second
 * closure variable, so clicking one can never stomp a stale copy of the
 * other. Unchanged from ticket #18 aside from file location.
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

/** Ticket #17 acceptance criterion #6: sidebar collapses/expands (260px expanded). */
function setupSidebarCollapseToggle(sidebar: HTMLElement): void {
  const button = document.getElementById('sidebar-collapse-toggle')
  if (!button) return

  button.addEventListener('click', () => {
    sidebar.classList.toggle('cf-sidebar-collapsed')
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

This is an editable **WYSIWYG** preview rendered by *CodeMirror 6*. Move
your cursor into this bold text, or into a \`code span\`, to see the
markdown syntax markers appear.

> Open a library folder (top-right button) to browse and edit its files
> in tabs.

- click into a list item to see its marker
- edits autosave 500ms after you stop typing
- open a folder to see the file tree and multi-tab editing (#17)

This sample document isn't backed by a file on disk, so edits here aren't persisted.
`

bootstrap().catch((err) => {
  console.error('Failed to bootstrap renderer', err)
})
