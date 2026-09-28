import type { Api } from './index'
export type { FileEncodingInfo, ReadFileResult } from './index'
export type { FileTreeNode, FileTreeNodeKind } from '../shared/fileTree'
export type { LibraryConfig } from '../shared/library'

declare global {
  interface Window {
    api: Api
  }
}
