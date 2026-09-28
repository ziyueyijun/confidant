import type { FileTreeNode } from '../../../preload/index'
import { isMarkdownFile } from '@shared/fileTree'

/**
 * Ticket #17: renders the recursive file tree into the sidebar DOM.
 *
 * The tree data itself (sorting: folders-first, filtering: hidden files
 * and non-whitelisted extensions) is computed in the main process via
 * `listDirectoryTree` (backed by the pure helpers in
 * `src/shared/fileTree.ts`) - this module only turns that already-sorted
 * data into DOM nodes and wires click handling. Only `.md`/`.markdown`
 * files are clickable-to-open (acceptance criterion #3); other visible
 * file kinds (images, PDFs, .txt) render but are inert for this ticket -
 * opening non-markdown files in a tab is out of scope here.
 *
 * Ticket #19: adds a right-click context menu (new file / rename /
 * delete) and inline rename-on-create. We use a hand-rolled DOM menu
 * (a positioned `<div>`, closed on outside click/Escape) rather than
 * Electron's native `Menu`/`MenuItem` - it avoids a second IPC round
 * trip just to ask the main process to show a menu and report back
 * which item was clicked, and keeps all the tree's interaction logic in
 * one place (this file) instead of splitting it across renderer and
 * main. The tradeoff is we lose the OS-native menu chrome/animations;
 * for a small, fixed set of menu items that's an acceptable trade.
 */
export interface FileTreeViewOptions {
  /** Called when a markdown file entry is clicked. */
  onOpenFile: (path: string) => void
  /** Returns true if `path` is the currently active tab, for highlighting. */
  isActive: (path: string) => boolean
  /** Called when "new file" is chosen. `dirPath` is the folder to create it in. */
  onNewFile: (dirPath: string) => void
  /** Called when "rename" is confirmed with a non-empty, changed name. */
  onRename: (path: string, newName: string) => void
  /** Called when "delete" is confirmed. */
  onDelete: (path: string) => void
  /**
   * The directory a "new file" created with no folder selected should
   * land in (e.g. the library root). Used when the context menu is
   * opened on empty space rather than on a specific folder.
   */
  rootPath: string
  /** Path that should immediately enter rename-editing mode on this render (e.g. a just-created file). */
  autoRenamePath?: string | null
}

let openMenu: HTMLElement | null = null
let closeMenuListenersAttached = false

function closeContextMenu(): void {
  if (openMenu) {
    openMenu.remove()
    openMenu = null
  }
}

function ensureGlobalCloseListeners(): void {
  if (closeMenuListenersAttached) return
  closeMenuListenersAttached = true
  document.addEventListener('click', closeContextMenu)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu()
  })
  window.addEventListener('blur', closeContextMenu)
}

interface MenuItem {
  label: string
  onSelect: () => void
}

function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  closeContextMenu()
  ensureGlobalCloseListeners()

  const menu = document.createElement('div')
  menu.className = 'cf-context-menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  for (const item of items) {
    const entry = document.createElement('button')
    entry.type = 'button'
    entry.className = 'cf-context-menu-item'
    entry.textContent = item.label
    entry.addEventListener('click', (e) => {
      e.stopPropagation()
      closeContextMenu()
      item.onSelect()
    })
    menu.appendChild(entry)
  }

  document.body.appendChild(menu)
  openMenu = menu

  // Stop the outside-click closer from firing for the click that opened
  // this very menu (the contextmenu event that triggered showContextMenu
  // happens before this listener is attached, so this only matters for
  // the menu element's own click bubbling out to `document`).
  menu.addEventListener('click', (e) => e.stopPropagation())
}

export function renderFileTree(
  container: HTMLElement,
  nodes: FileTreeNode[],
  options: FileTreeViewOptions
): void {
  container.replaceChildren()
  const root = buildList(nodes, options)
  container.appendChild(root)

  container.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const target = e.target as HTMLElement
    const fileLabel = target.closest<HTMLElement>('.cf-tree-file')
    const folderLabel = target.closest<HTMLElement>('.cf-tree-folder')

    if (fileLabel?.dataset.path) {
      showFileMenu(e.clientX, e.clientY, fileLabel.dataset.path, options)
    } else if (folderLabel?.dataset.path) {
      showFolderMenu(e.clientX, e.clientY, folderLabel.dataset.path, options)
    } else {
      // Right-clicked empty space: only "new file" (in the library root) makes sense.
      showContextMenu(e.clientX, e.clientY, [
        { label: 'New File', onSelect: () => options.onNewFile(options.rootPath) }
      ])
    }
  })
}

function showFolderMenu(x: number, y: number, dirPath: string, options: FileTreeViewOptions): void {
  showContextMenu(x, y, [{ label: 'New File', onSelect: () => options.onNewFile(dirPath) }])
}

function showFileMenu(x: number, y: number, path: string, options: FileTreeViewOptions): void {
  showContextMenu(x, y, [
    {
      label: 'Rename',
      onSelect: () => {
        const label = document.querySelector<HTMLElement>(`.cf-tree-file[data-path="${cssEscape(path)}"]`)
        if (label) beginInlineRename(label, path, options)
      }
    },
    { label: 'Delete', onSelect: () => options.onDelete(path) }
  ])
}

/** Minimal CSS.escape polyfill-free helper: only paths ever go here, and this is attribute-value safe. */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

/**
 * Swaps a file label's text for an inline `<input>` so the user can
 * rename in place. Commits on Enter/blur (if the name actually changed
 * and isn't empty), cancels on Escape.
 */
function beginInlineRename(
  label: HTMLElement,
  path: string,
  options: FileTreeViewOptions
): void {
  const currentName = label.textContent ?? ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'cf-tree-rename-input'
  input.value = currentName

  label.replaceChildren(input)
  input.focus()
  input.select()

  let settled = false
  const commit = (): void => {
    if (settled) return
    settled = true
    const newName = input.value.trim()
    if (newName && newName !== currentName) {
      options.onRename(path, newName)
    } else {
      label.textContent = currentName
    }
  }
  const cancel = (): void => {
    if (settled) return
    settled = true
    label.textContent = currentName
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  })
  input.addEventListener('blur', commit)
  input.addEventListener('click', (e) => e.stopPropagation())
}

function buildList(nodes: FileTreeNode[], options: FileTreeViewOptions): HTMLUListElement {
  const list = document.createElement('ul')
  list.className = 'cf-tree-list'

  for (const node of nodes) {
    list.appendChild(buildNode(node, options))
  }

  return list
}

function buildNode(node: FileTreeNode, options: FileTreeViewOptions): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'cf-tree-item'

  if (node.kind === 'directory') {
    const label = document.createElement('div')
    label.className = 'cf-tree-folder'
    label.textContent = node.name
    label.dataset.path = node.path
    label.setAttribute('role', 'button')
    label.tabIndex = 0

    const childList = node.children ? buildList(node.children, options) : null

    const toggle = (): void => {
      item.classList.toggle('cf-tree-collapsed')
    }
    label.addEventListener('click', toggle)
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    })

    item.appendChild(label)
    if (childList) item.appendChild(childList)
  } else {
    const label = document.createElement('div')
    label.className = 'cf-tree-file'
    label.textContent = node.name
    label.dataset.path = node.path

    if (isMarkdownFile(node.name)) {
      label.setAttribute('role', 'button')
      label.tabIndex = 0
      label.classList.add('cf-tree-file-openable')
      if (options.isActive(node.path)) label.classList.add('cf-tree-file-active')

      const open = (): void => options.onOpenFile(node.path)
      label.addEventListener('click', open)
      label.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      })
    } else {
      label.classList.add('cf-tree-file-inert')
    }

    item.appendChild(label)

    // Ticket #19: a just-created file auto-enters rename mode so the
    // user can immediately give it a real name.
    if (options.autoRenamePath && node.path === options.autoRenamePath) {
      queueMicrotask(() => beginInlineRename(label, node.path, options))
    }
  }

  return item
}
