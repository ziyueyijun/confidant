import type { Api } from './index'
export type { FileEncodingInfo, ReadFileResult } from './index'

declare global {
  interface Window {
    api: Api
  }
}
