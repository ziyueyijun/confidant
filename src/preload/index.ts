// 预载:contextBridge 暴露类型化桥面(与 shared/ipc.ts 的 ConfidantApi 契约一致)。

import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ConfidantApi, type Result } from "@shared/ipc";

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
};

contextBridge.exposeInMainWorld("confidant", api);
