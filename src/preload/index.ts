import { contextBridge, ipcRenderer } from 'electron'

/**
 * Narrow, explicit API surface exposed to the renderer.
 *
 * Rule (spec.md 3.1 / issue #11 research): never bridge a generic
 * `ipcRenderer.send`/`invoke` passthrough or the `fs` module itself.
 * Every capability gets its own named method so the renderer cannot
 * ask the main process to do anything beyond what's listed here.
 */
const api = {
  /** Read a UTF-8 text file from disk. Read-only for ticket #14. */
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('file:read', filePath),
  /** Absolute path of the file passed on the command line, if any. */
  getInitialFilePath: (): Promise<string | null> => ipcRenderer.invoke('app:initialFilePath')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
