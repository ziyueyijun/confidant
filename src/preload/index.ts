import { contextBridge, ipcRenderer } from 'electron'
import type { ThemeConfig } from '../shared/theme'
import type { LibraryConfig } from '../shared/library'
import type { FileTreeNode } from '../shared/fileTree'
import type { RenameResult } from '../main/fileSystem'
import type { CoalescedEvent } from '../shared/externalWatch'
import type { GroupedFileResult, SearchOptions } from '../shared/search'
export type { FileTreeNode } from '../shared/fileTree'
export type { RenameResult } from '../main/fileSystem'
export type { CoalescedEvent } from '../shared/externalWatch'
export type { GroupedFileResult, LineMatch, SearchOptions } from '../shared/search'

/**
 * Result of `file:read`. `warning` is set when the main process detects
 * a large document (ticket #14 perf budget: ~100k-character docs should
 * still load, but the renderer should be told so it can warn the user
 * in a later ticket). `encoding` (added in #15) is the BOM/line-ending
 * info the renderer must hand back unchanged on `file:write`.
 *
 * Ticket #27: now includes error handling for large files, binary files,
 * encoding issues, and permission problems.
 */
export interface FileEncodingInfo {
  hasBOM: boolean
  lineEnding: 'CRLF' | 'LF'
}

export type ReadFileError =
  | 'FILE_TOO_LARGE'
  | 'BINARY_FILE'
  | 'ENCODING_ERROR'
  | 'ACCESS_DENIED'

export interface ReadFileResult {
  success: true
  content: string
  warning?: string
  encoding: FileEncodingInfo
  detectedEncoding?: string
}

export interface ReadFileErrorResult {
  success: false
  error: ReadFileError
  message: string
}

export type ReadFileResultOrError = ReadFileResult | ReadFileErrorResult

/**
 * Ticket #27: write operation result with error handling.
 */
export type WriteFileError = 'READ_ONLY' | 'PERMISSION_DENIED' | 'DISK_FULL'

export interface WriteFileSuccess {
  success: true
}

export interface WriteFileErrorResult {
  success: false
  error: WriteFileError
  message: string
}

export type WriteFileResult = WriteFileSuccess | WriteFileErrorResult

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
  readFile: (filePath: string): Promise<ReadFileResultOrError> => ipcRenderer.invoke('file:read', filePath),
  /**
   * Atomically writes markdown content back to `filePath`, re-applying
   * the BOM detected at read time (ticket #15). Line endings are not
   * passed separately: the renderer sends the exact document text
   * (which already carries whatever line endings it was loaded with),
   * so the main process never re-normalizes/rewrites lines the user
   * didn't touch (minimal-diff requirement).
   *
   * Ticket #27: now returns a result indicating success or error.
   */
  writeFile: (filePath: string, content: string, encoding: Pick<FileEncodingInfo, 'hasBOM'>): Promise<WriteFileResult> =>
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
   * Creates a new empty markdown file inside `dirPath`, auto-numbering
   * the default name if it collides with an existing file (ticket #19).
   * Resolves with the created file's absolute path.
   */
  createFile: (dirPath: string): Promise<string> => ipcRenderer.invoke('fs:createFile', dirPath),
  /**
   * Renames `oldPath` to `newName` (sibling in the same directory).
   * Refuses (does not overwrite) if the destination already exists.
   */
  renameEntry: (oldPath: string, newName: string): Promise<RenameResult> =>
    ipcRenderer.invoke('fs:rename', oldPath, newName),
  /** Moves `path` to the OS trash/recycle bin (ticket #19 - never a permanent delete). */
  deleteToTrash: (path: string): Promise<void> => ipcRenderer.invoke('fs:deleteToTrash', path),
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
  },

  /**
   * Ticket #22: starts a streamed full-text search identified by
   * `sessionId` (minted by the renderer per debounced query - see
   * sidebar/searchPanelView.ts). Fire-and-forget: results/completion/
   * errors arrive asynchronously via `onSearchResult`/`onSearchDone`/
   * `onSearchError` below, not as this call's return value.
   */
  startSearch: (sessionId: string, libraryPath: string, text: string, options: SearchOptions): void => {
    ipcRenderer.send('search:start', sessionId, libraryPath, { text, options })
  },
  /** Cancels an in-flight search session (acceptance criterion #6). */
  cancelSearch: (sessionId: string): void => {
    ipcRenderer.send('search:cancel', sessionId)
  },
  /** Subscribes to streamed per-file results. Returns an unsubscribe function. */
  onSearchResult: (callback: (sessionId: string, result: GroupedFileResult) => void): (() => void) => {
    const listener = (_event: unknown, sessionId: string, result: GroupedFileResult): void =>
      callback(sessionId, result)
    ipcRenderer.on('search:result', listener)
    return () => ipcRenderer.removeListener('search:result', listener)
  },
  /** Subscribes to search-session completion. Returns an unsubscribe function. */
  onSearchDone: (callback: (sessionId: string) => void): (() => void) => {
    const listener = (_event: unknown, sessionId: string): void => callback(sessionId)
    ipcRenderer.on('search:done', listener)
    return () => ipcRenderer.removeListener('search:done', listener)
  },
  /** Subscribes to search-session errors (e.g. invalid regex). Returns an unsubscribe function. */
  onSearchError: (
    callback: (sessionId: string, error: { type: string; message: string }) => void
  ): (() => void) => {
    const listener = (
      _event: unknown,
      sessionId: string,
      error: { type: string; message: string }
    ): void => callback(sessionId, error)
    ipcRenderer.on('search:error', listener)
    return () => ipcRenderer.removeListener('search:error', listener)
  },

  /**
   * Ticket #24: saves a clipboard image (screenshot paste, Ctrl+V) as PNG
   * to the library's attachments folder. Returns the filename.
   */
  saveImageFromClipboard: (libraryPath: string, imageData: string): Promise<string> =>
    ipcRenderer.invoke('image:saveFromClipboard', libraryPath, imageData),

  /**
   * Ticket #24: copies a local image file (drag-and-drop from file system)
   * to the library's attachments folder. Returns the filename.
   */
  copyImageFile: (libraryPath: string, sourcePath: string): Promise<string> =>
    ipcRenderer.invoke('image:copyFile', libraryPath, sourcePath),

  /**
   * Ticket #24: downloads an image from a URL (drag-and-drop from browser)
   * and saves it to the library's attachments folder. Returns the filename.
   */
  downloadImage: (libraryPath: string, url: string): Promise<string> =>
    ipcRenderer.invoke('image:downloadFromUrl', libraryPath, url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
