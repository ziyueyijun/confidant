import { contextBridge, ipcRenderer } from 'electron'
import type { ThemeConfig } from '../shared/theme'
import type { LibraryConfig } from '../shared/library'
import type { FileTreeNode } from '../shared/fileTree'
import type { CoalescedEvent } from '../shared/externalWatch'
export type { FileTreeNode } from '../shared/fileTree'
export type { CoalescedEvent } from '../shared/externalWatch'

/**
 * Result of `file:read`. `warning` is set when the main process detects
 * a large document (ticket #14 perf budget: ~100k-character docs should
 * still load, but the renderer should be told so it can warn the user
 * in a later ticket). `encoding` (added in #15) is the BOM/line-ending
 * info the renderer must hand back unchanged on `file:write`.
 */
export interface FileEncodingInfo {
  hasBOM: boolean
  lineEnding: 'CRLF' | 'LF'
}

export interface ReadFileResult {
  content: string
  warning?: string
  encoding: FileEncodingInfo
}

/**
 * Narrow, explicit API surface exposed to the renderer.
 *
 * Rule (spec.md 3.1 / issue #11 research): never bridge a generic
 * `ipcRenderer.send`/`invoke` passthrough or the `fs` module itself.
 * Every capability gets its own named method so the renderer cannot
 * ask the main process to do anything beyond what's listed here.
 */
const api = {
  /** Read a UTF-8 text file from disk. */
  readFile: (filePath: string): Promise<ReadFileResult> => ipcRenderer.invoke('file:read', filePath),
  /**
   * Atomically writes markdown content back to `filePath`, re-applying
   * the BOM detected at read time (ticket #15). Line endings are not
   * passed separately: the renderer sends the exact document text
   * (which already carries whatever line endings it was loaded with),
   * so the main process never re-normalizes/rewrites lines the user
   * didn't touch (minimal-diff requirement).
   */
  writeFile: (filePath: string, content: string, encoding: Pick<FileEncodingInfo, 'hasBOM'>): Promise<void> =>
    ipcRenderer.invoke('file:write', filePath, content, encoding),
  /**
   * Opens a native "Save As" dialog pre-filled with `defaultPath`
   * (ticket #20: the only path forward for a tab whose file was deleted
   * externally, and one of the three conflict-dialog choices). Resolves
   * with the chosen absolute path, or `null` if cancelled.
   */
  saveAsDialog: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('file:saveAsDialog', defaultPath),
  /** Absolute path of the file passed on the command line, if any. */
  getInitialFilePath: (): Promise<string | null> => ipcRenderer.invoke('app:initialFilePath'),
  /** Reads the persisted theme config, or defaults if none was saved yet. */
  getTheme: (): Promise<ThemeConfig> => ipcRenderer.invoke('theme:get'),
  /** Persists the theme config (ticket #18: light/dark + editor width). */
  setTheme: (config: ThemeConfig): Promise<void> => ipcRenderer.invoke('theme:set', config),
  /** Reads the persisted "recently opened libraries" list (ticket #17, max 5). */
  getRecentLibraries: (): Promise<LibraryConfig> => ipcRenderer.invoke('library:getRecent'),
  /**
   * Opens a native folder-picker dialog. Resolves with the chosen
   * absolute path (and records it as most-recently-opened), or `null` if
   * the user cancelled.
   */
  openLibraryDialog: (): Promise<string | null> => ipcRenderer.invoke('library:openDialog'),
  /** Records `libraryPath` as most-recently-opened (used when reopening from the recents list). */
  recordLibraryOpened: (libraryPath: string): Promise<void> =>
    ipcRenderer.invoke('library:recordOpened', libraryPath),
  /** Recursively lists a library folder's visible file tree (ticket #17). */
  listDirectoryTree: (rootPath: string): Promise<FileTreeNode[]> =>
    ipcRenderer.invoke('fs:listDirectoryTree', rootPath),
  /**
   * Subscribes to external file-change events pushed by the main
   * process's chokidar watcher (ticket #20). This is a main-process-
   * initiated push (`ipcRenderer.on`), not a renderer-initiated request,
   * since the renderer has no way to know in advance when an external
   * edit will happen. Returns an unsubscribe function.
   */
  onExternalChange: (callback: (event: CoalescedEvent) => void): (() => void) => {
    const listener = (_event: unknown, payload: CoalescedEvent): void => callback(payload)
    ipcRenderer.on('watch:externalChange', listener)
    return () => ipcRenderer.removeListener('watch:externalChange', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
