// 同步滚动日志(决议 43:日志写本机滚动文件以便排查,**不含密码**)。
// 落在 userData/logs/sync.log;超过上限则改名为 sync.log.1(单份轮转)。
// 调用方负责传入的每一行都不含密码(引擎的 logger 只记路径与动作;错误信息经遮蔽)。

import { app } from "electron";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_BYTES = 1 * 1024 * 1024;

async function rotateIfNeeded(dir: string, file: string): Promise<void> {
  try {
    const st = await stat(file);
    if (st.size <= MAX_BYTES) return;
    await rename(file, join(dir, "sync.log.1"));
  } catch {
    // 文件不存在 / 改名失败:忽略(下次写入继续)
  }
}

/** 建同步日志写入器。写入串行进行;任何写日志失败都不得影响同步本身。 */
export function createSyncLogger(): (line: string) => void {
  const dir = join(app.getPath("userData"), "logs");
  const file = join(dir, "sync.log");
  let queue: Promise<void> = Promise.resolve();

  return (line: string): void => {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    queue = queue.then(async () => {
      try {
        await mkdir(dir, { recursive: true });
        await appendFile(file, stamped, "utf8");
        await rotateIfNeeded(dir, file);
      } catch {
        // 日志失败不影响同步
      }
    });
  };
}
