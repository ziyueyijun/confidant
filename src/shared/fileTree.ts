/**
 * Ticket #17 scope: pure types/helpers for the library sidebar's file
 * tree. Kept dependency-free (no `electron`, no `fs`, no DOM) so the
 * sort/filter logic can be unit tested in isolation and imported from
 * both the main process (which walks the real filesystem) and the
 * renderer (which only needs the types + filter for display decisions).
 */

export type FileTreeNodeKind = 'directory' | 'file'

export interface FileTreeNode {
  /** Absolute filesystem path. */
  path: string
  /** Basename (file or directory name), used for display and sorting. */
  name: string
  kind: FileTreeNodeKind
  /** Present only for kind: 'directory'. Already sorted/filtered. */
  children?: FileTreeNode[]
}

/**
 * Extensions the sidebar shows (acceptance criterion #2: ".md/.txt/图片/PDF").
 * Everything else on disk is filtered out of the tree entirely - this
 * ticket has no "show all files" mode.
 */
const VISIBLE_FILE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.pdf'
])

export function isVisibleFileName(name: string): boolean {
  if (isHiddenName(name)) return false
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false // no extension, or a dotfile like ".gitignore" (dot === 0)
  const ext = name.slice(dot).toLowerCase()
  return VISIBLE_FILE_EXTENSIONS.has(ext)
}

/** Hidden = dotfiles/dotfolders, matching the acceptance criterion "过滤隐藏文件". */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Sorts sibling nodes: directories before files, then case-insensitive
 * alphabetical within each group (acceptance criterion #2: "文件夹优先于
 * 文件排序"). Returns a new array; does not mutate the input.
 */
export function sortFileTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/**
 * Filters a flat list of raw directory-entry names down to the ones the
 * sidebar should show: directories are always kept (so the tree can be
 * navigated even if a subfolder's own contents are all hidden/filtered),
 * hidden entries are dropped, and files are kept only if their extension
 * is in the visible set.
 */
export function shouldIncludeEntry(name: string, kind: FileTreeNodeKind): boolean {
  if (isHiddenName(name)) return false
  if (kind === 'directory') return true
  return isVisibleFileName(name)
}

export function isMarkdownFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return ext === '.md' || ext === '.markdown'
}

/**
 * Ticket #21: flattens the recursive file tree into a flat list of
 * markdown files, for the Ctrl+P quick switcher's fuzzy matching (which
 * needs a flat "all files in the library" list, not a tree). Only
 * markdown files are included - the quick switcher opens files into
 * editor tabs, and (per #17) only markdown files are openable that way;
 * images/PDFs/txt would just error out if selected.
 */
export function flattenMarkdownFiles(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = []
  for (const node of nodes) {
    if (node.kind === 'directory') {
      if (node.children) result.push(...flattenMarkdownFiles(node.children))
    } else if (isMarkdownFile(node.name)) {
      result.push(node)
    }
  }
  return result
}
