// 预载:contextBridge 暴露类型化桥面(与 shared/ipc.ts 的 ConfidantApi 契约一致)。

import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type ConfidantApi,
  type MenuItemState,
  type MenuItemTemplate,
  type Result,
} from "@shared/ipc";
import type { TreeEntry } from "../../packages/files";

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

  pickFolderDialog: () => ipcRenderer.invoke(IPC.pickFolderDialog) as Promise<string | null>,

  openWorkspace: (path: string) =>
    ipcRenderer.invoke(IPC.workspaceOpen, path) as Promise<Result<TreeEntry[]>>,

  closeWorkspace: () => {
    void ipcRenderer.invoke(IPC.workspaceClose);
  },

  onWorkspaceTree: (cb: (tree: TreeEntry[]) => void) => {
    const listener = (_e: unknown, tree: TreeEntry[]) => cb(tree);
    ipcRenderer.on(IPC.workspaceTreeUpdated, listener);
    return () => {
      ipcRenderer.removeListener(IPC.workspaceTreeUpdated, listener);
    };
  },

  noteOpened: (path: string) => {
    ipcRenderer.send(IPC.fileOpened, path);
  },

  stateGet: (key: string) => ipcRenderer.invoke(IPC.stateGet, key) as Promise<unknown>,

  stateSet: (key: string, value: unknown) => {
    ipcRenderer.send(IPC.stateSet, key, value);
  },
};

contextBridge.exposeInMainWorld("confidant", api);
