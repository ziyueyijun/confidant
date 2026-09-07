// 预载:contextBridge 暴露类型化桥面(与 shared/ipc.ts 的 ConfidantApi 契约一致)。

import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  IPC,
  type ConfidantApi,
  type MenuItemState,
  type MenuItemTemplate,
  type Result,
  type TreeEntry,
  type WorkspaceSearchFileHit,
  type WorkspaceTreeUpdate,
} from "@shared/ipc";

const api: ConfidantApi = {
  openNoteDialog: () => ipcRenderer.invoke(IPC.openNoteDialog) as Promise<string | null>,

  readTextFile: (path: string) => ipcRenderer.invoke(IPC.readTextFile, path) as Promise<Result<string>>,

  writeTextFile: (path: string, content: string) =>
    ipcRenderer.invoke(IPC.writeTextFile, path, content) as Promise<Result<void>>,

  onOpenFile: (cb: (path: string) => void) => {
    const listener = (_e: unknown, path: string) => cb(path);
    ipcRenderer.on(IPC.openFileRequest, listener);
    return () => {
      ipcRenderer.removeListener(IPC.openFileRequest, listener);
    };
  },

  onOpenWorkspace: (cb: (path: string) => void) => {
    const listener = (_e: unknown, path: string) => cb(path);
    ipcRenderer.on(IPC.openWorkspaceRequest, listener);
    return () => {
      ipcRenderer.removeListener(IPC.openWorkspaceRequest, listener);
    };
  },

  onFlushRequest: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.flushRequest, listener);
    return () => {
      ipcRenderer.removeListener(IPC.flushRequest, listener);
    };
  },

  flushAck: () => {
    ipcRenderer.send(IPC.flushAck);
  },

  setMenuTemplate: (template: MenuItemTemplate[]) => {
    ipcRenderer.send(IPC.menuSetTemplate, template);
  },

  updateMenuItems: (states: MenuItemState[]) => {
    ipcRenderer.send(IPC.menuUpdateItems, states);
  },

  onMenuCommand: (cb: (id: string) => void) => {
    const listener = (_e: unknown, id: string) => cb(id);
    ipcRenderer.on(IPC.menuCommand, listener);
    return () => {
      ipcRenderer.removeListener(IPC.menuCommand, listener);
    };
  },

  showAbout: () => ipcRenderer.invoke(IPC.aboutDialog) as Promise<void>,

  closeWindow: () => {
    ipcRenderer.send(IPC.closeWindow);
  },

  toggleFullscreen: () => {
    ipcRenderer.send(IPC.fullscreenToggle);
  },

  openPreferences: () => {
    ipcRenderer.send(IPC.preferencesOpen);
  },

  onStateChanged: (cb: (key: string, value: unknown) => void) => {
    const listener = (_e: unknown, key: string, value: unknown) => cb(key, value);
    ipcRenderer.on(IPC.stateChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC.stateChanged, listener);
    };
  },

  pickFolderDialog: () => ipcRenderer.invoke(IPC.pickFolderDialog) as Promise<string | null>,

  openWorkspace: (path: string) =>
    ipcRenderer.invoke(IPC.workspaceOpen, path) as Promise<Result<TreeEntry[]>>,

  closeWorkspace: () => {
    void ipcRenderer.invoke(IPC.workspaceClose);
  },

  onWorkspaceTree: (cb: (update: WorkspaceTreeUpdate) => void) => {
    const listener = (_e: unknown, update: WorkspaceTreeUpdate) => cb(update);
    ipcRenderer.on(IPC.workspaceTreeUpdated, listener);
    return () => {
      ipcRenderer.removeListener(IPC.workspaceTreeUpdated, listener);
    };
  },

  newNoteIn: (dirAbs: string) =>
    ipcRenderer.invoke(IPC.fsNewNote, dirAbs) as Promise<Result<{ path: string }>>,

  newFolderIn: (dirAbs: string, name: string) =>
    ipcRenderer.invoke(IPC.fsNewFolder, dirAbs, name) as Promise<Result<void>>,

  renamePath: (path: string, newName: string) =>
    ipcRenderer.invoke(IPC.fsRenamePath, path, newName) as Promise<Result<{ path: string }>>,

  movePath: (path: string, targetDir: string, newName?: string) =>
    ipcRenderer.invoke(IPC.fsMovePath, path, targetDir, newName) as Promise<Result<{ path: string }>>,

  searchWorkspace: (root: string, query: string) =>
    ipcRenderer.invoke(IPC.workspaceSearch, root, query) as Promise<Result<WorkspaceSearchFileHit[]>>,

  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>,

  printExport: (mode: 'pdf' | 'print', payload: { notePath: string; head: string | null; bodyMd: string }) =>
    ipcRenderer.invoke(IPC.printExport, mode, payload) as Promise<Result<{ pdfPath?: string }>>,

  getPrintData: () =>
    ipcRenderer.invoke(IPC.printDataGet) as Promise<{ head: string | null; bodyMd: string } | null>,

  printReady: (ok: boolean) => {
    ipcRenderer.send(IPC.printReady, ok);
  },

  noteOpened: (path: string) => {
    ipcRenderer.send(IPC.fileOpened, path);
  },

  stateGet: (key: string) => ipcRenderer.invoke(IPC.stateGet, key) as Promise<unknown>,

  stateSet: (key: string, value: unknown) => {
    ipcRenderer.send(IPC.stateSet, key, value);
  },

  saveClipboardImage: (params: {
    dirAbs: string;
    noteStem: string;
    mime: string;
    bytes: Uint8Array;
  }) =>
    ipcRenderer.invoke(IPC.imageSaveBytes, params) as Promise<
      Result<{ fileName: string }>
    >,

  copyImageFromPath: (params: { dirAbs: string; noteStem: string; sourcePath: string }) =>
    ipcRenderer.invoke(IPC.imageSaveCopy, params) as Promise<Result<{ fileName: string }>>,

  pickImageFile: () => ipcRenderer.invoke(IPC.imagePickDialog) as Promise<string | null>,

  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },

  showContextMenu: (items: MenuItemTemplate[]) =>
    ipcRenderer.invoke(IPC.showContextMenu, items) as Promise<string | null>,

  showItemInFolder: (targetPath: string) => ipcRenderer.invoke(IPC.showItemInFolder, targetPath) as Promise<void>,

  copyImageToClipboard: (path: string) =>
    ipcRenderer.invoke(IPC.imageCopyToClipboard, path) as Promise<Result<void>>,

  trashItem: (path: string) => ipcRenderer.invoke(IPC.trashItem, path) as Promise<Result<void>>,

  confirmDialog: (message: string, detail?: string) =>
    ipcRenderer.invoke(IPC.confirmDialog, message, detail ?? "") as Promise<boolean>,

  infoDialog: (message: string, detail?: string) =>
    ipcRenderer.invoke(IPC.infoDialog, message, detail ?? "") as Promise<void>,

  pathExists: (path: string) => ipcRenderer.invoke(IPC.pathExists, path) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("confidant", api);
