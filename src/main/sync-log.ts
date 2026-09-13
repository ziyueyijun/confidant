// 同步滚动日志(决议 43:日志写本机滚动文件以便排查,**不含密码**)。
// 落在 userData/logs/sync.log;超过上限则轮转为 sync.log.1 … sync.log.keep(旧者丢弃)。
// 写入器对**每一行**再套一次 redactSecrets,即使调用方漏了遮蔽也不会把密码写进日志。

import { app } from "electron";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { redactSecrets } from "@shared/sync";
import { rotationSteps } from "./log-rotate";

const MAX_BYTES = 1 * 1024 * 1024;
/** 保留的备份份数(不含当前 sync.log)。 */
const KEEP = 3;

async function rotateIfNeeded(dir: string, file: string): Promise<void> {
  try {
    const st = await stat(file);
    if (st.size <= MAX_BYTES) return;
    for (const step of rotationSteps(file, KEEP)) {
      try {
        await rename(step.from, step.to);
      } catch {
        // 源不存在(首次轮转)或改名失败:跳过该步,继续。
      }
    }
  } catch {
    // 文件不存在 / stat 失败:无需轮转
  }
}

/**
 * 建同步日志写入器。写入串行进行;任何写日志失败都不得影响同步本身。
 * `secrets` 中的每个串(**原样与 URL 编码**)在每一行里都替换为 `***`。
 */
export function createSyncLogger(
  secrets: Array<string | null | undefined> = [],
): (line: string) => void {
  const dir = join(app.getPath("userData"), "logs");
  const file = join(dir, "sync.log");
  let queue: Promise<void> = Promise.resolve();

  return (line: string): void => {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    const safe = redactSecrets(stamped, secrets);
    queue = queue.then(async () => {
      try {
        await mkdir(dir, { recursive: true });
        await appendFile(file, safe, "utf8");
        await rotateIfNeeded(dir, file);
      } catch {
        // 日志失败不影响同步
      }
    });
  };
}
