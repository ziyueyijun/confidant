import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  readFile,
  writeMarkdownFile,
  listDirectoryTree,
  type ReadFileResult,
  type FileEncodingInfo
} from './fileSystem'
import { findMarkdownPathInArgv } from './cli'
import { readThemeConfig, writeThemeConfig } from './themeStore'
import { readLibraryConfig, writeLibraryConfig } from './libraryStore'
import { runLibrarySearch, type SearchQuery } from './search'
import type { ThemeConfig } from '../shared/theme'
import { addRecentLibrary, type LibraryConfig } from '../shared/library'
import type { FileTreeNode } from '../shared/fileTree'
import type { GroupedFileResult } from '../shared/search'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.confidant.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('file:read', async (_event, filePath: string): Promise<ReadFileResult> => {
    return readFile(filePath)
  })

  ipcMain.handle(
    'file:write',
    async (
      _event,
      filePath: string,
      content: string,
      encoding: Pick<FileEncodingInfo, 'hasBOM'>
    ): Promise<void> => {
      return writeMarkdownFile(filePath, content, encoding)
    }
  )

  const initialFilePath = findMarkdownPathInArgv(process.argv)
  ipcMain.handle('app:initialFilePath', () => initialFilePath)

  ipcMain.handle('theme:get', async (): Promise<ThemeConfig> => {
    return readThemeConfig(app.getPath('userData'))
  })

  ipcMain.handle('theme:set', async (_event, config: ThemeConfig): Promise<void> => {
    await writeThemeConfig(app.getPath('userData'), config)
  })

  ipcMain.handle('library:getRecent', async (): Promise<LibraryConfig> => {
    return readLibraryConfig(app.getPath('userData'))
  })

  /**
   * Opens a native "choose folder" dialog and, if the user picked one,
   * records it as the most-recently-opened library (acceptance criterion
   * #1: recent-5 list persisted in userData). Returns null if the user
   * cancelled, so the renderer can no-op instead of trying to open an
   * empty library path.
   */
  ipcMain.handle('library:openDialog', async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null

    const libraryPath = result.filePaths[0]
    const userDataDir = app.getPath('userData')
    const current = await readLibraryConfig(userDataDir)
    const updated: LibraryConfig = {
      recentLibraryPaths: addRecentLibrary(current.recentLibraryPaths, libraryPath)
    }
    await writeLibraryConfig(userDataDir, updated)
    return libraryPath
  })

  /**
   * Records `libraryPath` as most-recently-opened without showing a
   * dialog - used when a library is reopened from the "recent
   * libraries" list rather than picked fresh.
   */
  ipcMain.handle('library:recordOpened', async (_event, libraryPath: string): Promise<void> => {
    const userDataDir = app.getPath('userData')
    const current = await readLibraryConfig(userDataDir)
    const updated: LibraryConfig = {
      recentLibraryPaths: addRecentLibrary(current.recentLibraryPaths, libraryPath)
    }
    await writeLibraryConfig(userDataDir, updated)
  })

  ipcMain.handle(
    'fs:listDirectoryTree',
    async (_event, rootPath: string): Promise<FileTreeNode[]> => {
      return listDirectoryTree(rootPath)
    }
  )

  /**
   * Ticket #22: full-text search, streamed. `search:start` kicks off a
   * scan identified by `sessionId` (minted by the renderer, one per
   * debounced query) and returns immediately - results/completion/errors
   * arrive later via `search:result`/`search:done`/`search:error` pushed
   * to the same webContents, all tagged with `sessionId` so the renderer
   * can drop anything that isn't its latest session (superseded by a
   * newer query, or already cancelled).
   *
   * One `AbortController` per in-flight session, keyed by sessionId, is
   * how `search:cancel` stops the walk: aborting the controller makes
   * `runLibrarySearch`'s per-file loop check `signal.aborted` and stop
   * picking up new files (see search.ts doc comment - cancellation is
   * checked between files, not mid-read, which is precise enough since
   * individual file reads are small and fast).
   */
  const activeSearchControllers = new Map<string, AbortController>()

  ipcMain.on(
    'search:start',
    (event, sessionId: string, libraryPath: string, query: SearchQuery): void => {
      const controller = new AbortController()
      activeSearchControllers.set(sessionId, controller)

      void runLibrarySearch(libraryPath, query, controller.signal, (result: GroupedFileResult) => {
        if (controller.signal.aborted) return
        event.sender.send('search:result', sessionId, result)
      })
        .then(({ error }) => {
          activeSearchControllers.delete(sessionId)
          if (controller.signal.aborted) return
          if (error) {
            event.sender.send('search:error', sessionId, error)
          } else {
            event.sender.send('search:done', sessionId)
          }
        })
        .catch((err) => {
          activeSearchControllers.delete(sessionId)
          if (controller.signal.aborted) return
          event.sender.send('search:error', sessionId, {
            type: 'invalid-regex',
            message: err instanceof Error ? err.message : String(err)
          })
        })
    }
  )

  ipcMain.on('search:cancel', (_event, sessionId: string): void => {
    activeSearchControllers.get(sessionId)?.abort()
    activeSearchControllers.delete(sessionId)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
