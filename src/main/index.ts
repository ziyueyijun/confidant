import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { promises as fsPromises } from 'fs'
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
import { watchLibrary, computeEtag, type ExternalWatchHandle } from './externalWatch'
import type { ThemeConfig } from '../shared/theme'
import { addRecentLibrary, type LibraryConfig } from '../shared/library'
import type { FileTreeNode } from '../shared/fileTree'
import type { CoalescedEvent } from '../shared/externalWatch'

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

  // Ticket #20: at most one library-folder watcher is active at a time,
  // matching the app's single-window/single-open-library model (ticket
  // #17). Re-opening a library (or opening a different one) tears down
  // the previous watcher before starting a new one.
  let watchHandle: ExternalWatchHandle | null = null

  function startWatchingLibrary(libraryPath: string): void {
    void watchHandle?.close()
    watchHandle = watchLibrary(libraryPath, {
      onExternalChange: (event: CoalescedEvent) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send('watch:externalChange', event)
        }
      }
    })
  }

  ipcMain.handle('file:read', async (_event, filePath: string): Promise<ReadFileResult> => {
    const result = await readFile(filePath)
    // Record this read's on-disk state as "known" so a later chokidar
    // event that merely reflects what we just read (no actual change
    // since) isn't misreported as external (acceptance criterion #3).
    await watchHandle?.noteKnownState(filePath)
    return result
  })

  ipcMain.handle(
    'file:write',
    async (
      _event,
      filePath: string,
      content: string,
      encoding: Pick<FileEncodingInfo, 'hasBOM'>
    ): Promise<void> => {
      await writeMarkdownFile(filePath, content, encoding)
      // Record the etag of what we just wrote *before* chokidar's event
      // for this write arrives, so the debounced handler recognizes it
      // as our own save rather than an external change (criterion #3).
      try {
        const stat = await fsPromises.stat(filePath)
        watchHandle?.noteOwnWrite(filePath, computeEtag(stat))
      } catch {
        // Best-effort - if the stat fails right after a successful
        // write (unlikely), the next external-change check will simply
        // fall back to treating the next event as external.
      }
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
      startWatchingLibrary(rootPath) // ticket #20: (re)start the external-change watcher on every library open
      return listDirectoryTree(rootPath)
    }
  )

  /**
   * Native "Save As" dialog (ticket #20 acceptance criteria #5/#6: the
   * only way forward for a tab whose file was deleted externally, and
   * one of the three conflict-dialog choices). Suggests `defaultPath` so
   * the user starts from the file's original name/location. Returns the
   * chosen path, or null if cancelled.
   */
  ipcMain.handle(
    'file:saveAsDialog',
    async (event, defaultPath: string): Promise<string | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = window
        ? await dialog.showSaveDialog(window, { defaultPath, filters: [{ name: 'Markdown', extensions: ['md'] }] })
        : await dialog.showSaveDialog({ defaultPath, filters: [{ name: 'Markdown', extensions: ['md'] }] })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    }
  )

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
