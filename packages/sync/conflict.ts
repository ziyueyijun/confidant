// packages/sync —— 入口点:冲突副本的命名与识别(纯逻辑,无 IO,不依赖 Node/Electron)。
//
// 单独成一个入口点(同 client.ts 的做法),因为**渲染层**要用 `isConflictCopyName`
// 给文件树里的冲突副本加标记(决议 55)。`lib/conflict.ts` 只依赖 `lib/paths.ts`,
// 是纯字符串逻辑;若走 index.ts 入口会把引擎的 Node 依赖(fs/crypto)拉进渲染包,
// 故不从 index.ts 转出。
//
// 命名与识别共用同一份模式(单一事实源),避免两端各写字面量而漂移。

export {
  CONFLICT_COPY_INFIX,
  conflictCopyRelPath,
  formatConflictStamp,
  isConflictCopyName,
} from "./lib/conflict";
