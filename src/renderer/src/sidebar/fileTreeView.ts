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
 */
export interface FileTreeViewOptions {
  /** Called when a markdown file entry is clicked. */
  onOpenFile: (path: string) => void
  /** Returns true if `path` is the currently active tab, for highlighting. */
  isActive: (path: string) => boolean
}

export function renderFileTree(
  container: HTMLElement,
  nodes: FileTreeNode[],
  options: FileTreeViewOptions
): void {
  container.replaceChildren()
  const root = buildList(nodes, options)
  container.appendChild(root)
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
  }

  return item
}
