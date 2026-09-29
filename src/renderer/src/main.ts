import './styles/editor.css'
import { createMarkdownEditor, type MarkdownEditorHandle } from './editor/init'
import { applyEditorWidth, applyTheme } from './theme/applyTheme'
import { EDITOR_WIDTH_OPTIONS, type EditorWidth, type ThemeName } from '@shared/theme'
import type { FileEncodingInfo, FileTreeNode } from '../../preload/index'
import {
  openTab,
  focusTab,
  closeTab,
  renameTabPath,
  EMPTY_TAB_STATE,
  type TabState
} from './tabs/tabState'
import { renderTabBar, basename } from './tabs/tabBarView'
import { renderFileTree } from './sidebar/fileTreeView'
import { handleExternalChangeEvent, type ExternalChangeHooks } from './watch/externalChangeHandler'
import { flattenMarkdownFiles } from '@shared/fileTree'
import { createQuickSwitcher } from './quickSwitcher/quickSwitcherPanel'
import { createSearchPanel, type SearchPanelHandle } from './sidebar/searchPanelView'

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
 *
 * Ticket #19 scope: file tree CRUD (new/rename/delete). Mutations go
 * through the main process (`window.api.createFile`/`renameEntry`/
 * `deleteToTrash`), then the tree is reloaded from disk so the sidebar
 * always reflects ground truth rather than an optimistic client-side
 * patch. Renaming a file that's currently open in a tab also updates
 * that tab's key (and the `documents` map's key) in place, so the tab
 * keeps pointing at the same open editor instead of looking like the
 * file disappeared.
 */

  /** One open document: its editor instance, DOM host, and save-relevant metadata. */
interface OpenDocument {
  handle: MarkdownEditorHandle
  hostElement: HTMLDivElement
  encoding: FileEncodingInfo
  /**
   * Mutable box holding the path autosave currently writes to (see
   * createDocumentForTab). Normally equal to the `documents` map key
   * it's stored under, but ticket #19's file-tree rename and ticket
   * #20's "Save As" flow both retarget it to a new path without
   * recreating the editor - see `renameFile`/`saveAs`.
   */
  savePath: { current: string }
  /** Ticket #20 acceptance criterion #5: true once this document's backing file was deleted externally. */
  deleted: boolean
  /** Ticket #27: true if the file is read-only or has permission issues. */
  readOnly: boolean
}

async function bootstrap(): Promise<void> {
  const editorHostsContainer = document.getElementById('editor-hosts')
  const tabBarContainer = document.getElementById('tab-bar')
  const fileTreeContainer = document.getElementById('file-tree')
  const searchPanelContainer = document.getElementById('search-panel')
  const sidebar = document.getElementById('sidebar')
  const libraryNameLabel = document.getElementById('library-name')
  if (
    !editorHostsContainer ||
    !tabBarContainer ||
    !fileTreeContainer ||
    !searchPanelContainer ||
    !sidebar ||
    !libraryNameLabel
  ) {
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
  let currentLibraryPath: string | null = null

  // Ticket #19: tracks the open library root (for "new file" on empty
  // space) and the most recently created file (so it can auto-enter
  // rename mode on its next render), and caches the last-loaded tree so
  // mutation handlers can trigger a reload+rerender without threading
  // the tree through every call site.
  let pendingAutoRenamePath: string | null = null

  // Ticket #21: Ctrl+P quick switcher. Global overlay, independent of any
  // editor instance - opening a result routes through `openFileInTab`
  // below (same tab-open path the sidebar uses).
  const quickSwitcher = createQuickSwitcher({
    onOpenFile: (path) => void openFileInTab(path)
  })

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

    // Ticket #27: show read-only status (acceptance criterion #1)
    const showReadOnly = Boolean(activeDoc?.readOnly && !activeDoc.deleted)
    const showDeleted = Boolean(activeDoc?.deleted)
    const showStatus = showReadOnly || showDeleted

    statusBar.classList.toggle('cf-status-bar-visible', showStatus)

    if (showDeleted) {
      statusBarMessage.textContent = '文件已被外部删除，改动无法保存到原路径 - 请另存为'
    } else if (showReadOnly) {
      statusBarMessage.textContent = '[只读] 文件为只读或权限不足，无法保存到原路径 - 请另存为'
    }
  }

  statusBarSaveAsButton?.addEventListener('click', () => {
    if (tabState.activePath) void saveAs(tabState.activePath)
  })

  function rerenderFileTree(nodes: FileTreeNode[]): void {
    renderFileTree(fileTreeContainer!, nodes, {
      onOpenFile: (path) => void openFileInTab(path),
      isActive: (path) => path === tabState.activePath,
      onNewFile: (dirPath) => void createNewFile(dirPath),
      onRename: (path, newName) => void renameFile(path, newName),
      onDelete: (path) => void deleteFile(path),
      rootPath: currentLibraryPath ?? '',
      autoRenamePath: pendingAutoRenamePath
    })
    pendingAutoRenamePath = null

    // Ticket #21: keep the quick switcher's candidate list in sync with
    // whatever library is currently open.
    quickSwitcher.setFiles(
      flattenMarkdownFiles(nodes).map((node) => ({ path: node.path, name: node.name }))
    )
  }

  /** Reloads the tree from disk and re-renders (ticket #19 acceptance criterion #4). */
  async function refreshFileTree(): Promise<void> {
    if (!currentLibraryPath) return
    const tree = await window.api.listDirectoryTree(currentLibraryPath)
    rerenderFileTree(tree)
  }

  async function createNewFile(dirPath: string): Promise<void> {
    try {
      const newPath = await window.api.createFile(dirPath)
      pendingAutoRenamePath = newPath
      await refreshFileTree()
      await openFileInTab(newPath)
    } catch (err) {
      console.error('Failed to create file', err)
      window.alert(`Could not create a new file: ${String(err)}`)
    }
  }

  /**
   * Renames `path` to `newName`. On success: refuses silently is not an
   * option per the tree's own retry UX (the input just reverts and the
   * user can try again), but here we've already gotten a definitive
   * answer from the main process, so on `target-exists`/`error` we show
   * an alert and leave the file tree/tabs untouched. On success, syncs
   * the open tab (if any) and warns that other files' links aren't
   * updated (acceptance criterion #2).
   */
  async function renameFile(path: string, newName: string): Promise<void> {
    const result = await window.api.renameEntry(path, newName)
    if (!result.ok) {
      const reasonText =
        result.reason === 'target-exists'
          ? `A file named "${newName}" already exists in this folder.`
          : `Rename failed: ${result.message}`
      window.alert(reasonText)
      await refreshFileTree()
      return
    }

    const { newPath } = result
    const doc = documents.get(path)
    if (doc) {
      doc.savePath.current = newPath // keep the live editor's autosave pointed at the new path
      documents.delete(path)
      documents.set(newPath, doc)
    }
    tabState = renameTabPath(tabState, path, newPath)

    await refreshFileTree()
    rerenderTabBar()

    // Acceptance criterion #2: renaming does not scan/update links in
    // other files, so warn the user those links may now be stale.
    window.alert(
      `Renamed to "${newName}". Links to the old filename in other files were not updated automatically.`
    )
  }

  async function deleteFile(path: string): Promise<void> {
    const confirmed = window.confirm(`Move "${basenameOf(path)}" to the trash?`)
    if (!confirmed) return

    try {
      await window.api.deleteToTrash(path)
    } catch (err) {
      console.error('Failed to delete file', err)
      window.alert(`Could not delete file: ${String(err)}`)
      return
    }

    const doc = documents.get(path)
    if (doc) {
      doc.handle.destroy()
      doc.hostElement.remove()
      documents.delete(path)
    }
    tabState = closeTab(tabState, path)

    await refreshFileTree()
    rerenderTabBar()
    rerenderFileTreeActiveHighlight()
  }

  function basenameOf(path: string): string {
    const normalized = path.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    return lastSlash === -1 ? path : normalized.slice(lastSlash + 1)
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

    quickSwitcher.recordOpened(path) // ticket #21: track for the switcher's default recent view

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
    let readOnly = false

    try {
      const result = await window.api.readFile(path)

      // Ticket #27: handle read errors (acceptance criteria #4, #5, #6)
      if (!result.success) {
        let errorTitle = '无法打开文件'
        let errorMessage = result.message

        if (result.error === 'FILE_TOO_LARGE') {
          errorTitle = '文件过大'
        } else if (result.error === 'BINARY_FILE') {
          errorTitle = '二进制文件'
        } else if (result.error === 'ACCESS_DENIED') {
          errorTitle = '权限不足'
        }

        window.alert(`${errorTitle}\n\n${errorMessage}`)

        // Show error in editor
        content = `# ${errorTitle}\n\n${path}\n\n${errorMessage}\n`
        encoding = { hasBOM: false, lineEnding: 'CRLF' }
        readOnly = true
      } else {
        content = result.content
        encoding = result.encoding

        // Ticket #27: show warning for large files (acceptance criterion #4)
        if (result.warning) {
          console.warn(result.warning)
          window.alert(`警告：${result.warning}`)
        }
      }
    } catch (err) {
      content = `# Could not open file\n\n${path}\n\n\`\`\`\n${String(err)}\n\`\`\`\n`
      encoding = { hasBOM: false, lineEnding: 'CRLF' }
      readOnly = true
    }

    // `savePath` is a mutable box, not the `path` parameter directly:
    // `createMarkdownEditor`'s `onSave` callback captures this closure
    // once at creation time and there's no API to swap it out (see
    // MarkdownEditorHandle). Ticket #19 renames a file (and ticket #20's
    // "Save As" flow) without destroying/recreating its editor instance
    // (to preserve undo history/cursor/scroll), so the save target must
    // be reassignable in place. `renameFile`/`saveAs` below assign
    // `.current` on the same object returned here rather than mutating a
    // plain closed-over variable, so the update is visible to this
    // callback immediately - a caught bug where autosave kept writing to
    // the pre-rename path (resurrecting a "deleted" file on disk) would
    // otherwise have gone unnoticed by typecheck/tests, since nothing
    // here is a type error, just a stale value.
    const savePath = { current: path }
    const lineSeparator = encoding.lineEnding === 'CRLF' ? '\r\n' : '\n'
    const handle = createMarkdownEditor(
      inner,
      content,
      async (docContent) => {
        // Ticket #27: handle write errors (acceptance criteria #1, #2, #3)
        const result = await window.api.writeFile(savePath.current, docContent, { hasBOM: encoding.hasBOM })

        if (!result.success) {
          const doc = documents.get(path)
          if (!doc) return

          // Mark as read-only so status bar shows the issue
          doc.readOnly = true
          updateStatusBar()

          // Show error dialog with "Save As" option
          let errorMessage = result.message
          if (result.error === 'READ_ONLY') {
            errorMessage = '文件为只读，无法保存。是否要另存为到其他位置？'
          } else if (result.error === 'PERMISSION_DENIED') {
            errorMessage = '权限不足，无法保存。是否要另存为到其他位置？'
          } else if (result.error === 'DISK_FULL') {
            errorMessage = '磁盘空间不足，无法保存。是否要另存为到其他位置？'
          }

          const shouldSaveAs = window.confirm(errorMessage)
          if (shouldSaveAs) {
            await saveAs(path)
          }
        }
      },
      lineSeparator
    )

    documents.set(path, { handle, hostElement, encoding, savePath, deleted: false, readOnly })
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
      if (result.success) {
        doc.handle.reloadContent(result.content)
        doc.encoding = result.encoding
      } else {
        console.error('Failed to reload externally changed file', path, result.message)
      }
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

    // Ticket #27: handle write errors in Save As
    const result = await window.api.writeFile(chosenPath, content, { hasBOM: doc.encoding.hasBOM })

    if (!result.success) {
      window.alert(`保存失败：${result.message}`)
      return
    }

    if (chosenPath === path) {
      // Saved back over the same path (e.g. re-picked the identical
      // name from the dialog) - just clear the deleted flag, no
      // map/tab-state key change needed.
      doc.deleted = false
      doc.readOnly = false // Ticket #27: clear read-only flag
    } else {
      documents.delete(path)
      doc.deleted = false
      doc.readOnly = false // Ticket #27: clear read-only flag
      doc.savePath.current = chosenPath
      documents.set(chosenPath, doc)
      tabState = renameTabPath(tabState, path, chosenPath)
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
    currentLibraryPath = libraryPath
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

  // --- Full-text search sidebar panel (ticket #22) ---

  const searchPanel: SearchPanelHandle = createSearchPanel(searchPanelContainer, fileTreeContainer, {
    getLibraryPath: () => currentLibraryPath,
    onResultClick: (path, lineNumber) => {
      void openFileAtLine(path, lineNumber)
    }
  })

  /**
   * Opens `path` (reusing the normal tab-open flow) and, once its editor
   * exists, scrolls to and highlights `lineNumber` (acceptance criterion
   * #5). Awaits `openFileInTab` first so this works whether the file was
   * already open (existing `MarkdownEditorHandle`) or needs to be created
   * fresh.
   */
  async function openFileAtLine(path: string, lineNumber: number): Promise<void> {
    await openFileInTab(path)
    const doc = documents.get(path)
    doc?.handle.revealLine(lineNumber)
  }

  document.getElementById('sidebar-search-toggle')?.addEventListener('click', () => {
    searchPanel.toggle()
  })

  window.addEventListener('keydown', (event) => {
    const isToggleShortcut =
      (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f'
    if (isToggleShortcut) {
      event.preventDefault()
      if (sidebar!.classList.contains('cf-sidebar-collapsed')) {
        sidebar!.classList.remove('cf-sidebar-collapsed')
      }
      searchPanel.toggle()
    }
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
      savePath: { current: samplePath }, // never actually written: onSave above is a no-op
      deleted: false,
      readOnly: false
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
