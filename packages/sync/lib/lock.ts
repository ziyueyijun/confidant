// 同步锁(决议 37):防止两个应用实例同时同步同一工作区。
// 锁文件放本机 userData(调用方给的 lockDir),**不写进工作区、不写进远端**。
// 崩溃遗留的锁用 pid 存活探测 + 起始时间兜底判定为陈旧并接管。

import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

/** 另一个同步任务持锁时抛此错(调用方据此提示「已有同步在进行」)。 */
export class SyncBusyError extends Error {
  constructor(message = "另一个同步任务正在运行。") {
    super(message);
    this.name = "SyncBusyError";
  }
}

interface LockPayload {
  pid: number;
  startedAt: number;
}

/** 同进程持锁超过此时长视为陈旧(pid 复用/崩溃兜底)。默认 6 小时。 */
const STALE_MS = 6 * 60 * 60 * 1000;

function lockFileName(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  const readable = basename(key.replace(/\\/g, "/")).replace(/[^\w.-]+/g, "_").slice(0, 40) || "ws";
  return `${readable}.${hash}.sync.lock`;
}

async function isStale(file: string, now: number): Promise<boolean> {
  let info: LockPayload;
  try {
    info = JSON.parse(await readFile(file, "utf8")) as LockPayload;
  } catch {
    return true; // 不可读/损坏 → 视为陈旧
  }
  if (typeof info.pid === "number" && info.pid !== process.pid) {
    try {
      process.kill(info.pid, 0); // 存活探测:抛错表示进程不在
      return false;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "ESRCH";
    }
  }
  const started = typeof info.startedAt === "number" ? info.startedAt : 0;
  return now - started > STALE_MS;
}

export interface SyncLock {
  release(): Promise<void>;
}

/**
 * 获取某工作区的同步锁。`wx` 独占创建;已存在时若陈旧则接管,否则抛 SyncBusyError。
 * `now` 可注入(测试用)。
 */
export async function acquireLock(
  lockDir: string,
  key: string,
  now: () => number = Date.now,
): Promise<SyncLock> {
  await mkdir(lockDir, { recursive: true });
  const file = join(lockDir, lockFileName(key));
  const payload = JSON.stringify({ pid: process.pid, startedAt: now() } satisfies LockPayload);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, payload, { flag: "wx" });
      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          try {
            await unlink(file);
          } catch {
            // 已不在(被接管/删除):忽略
          }
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (await isStale(file, now())) {
        try {
          await unlink(file);
        } catch {
          // 竞态:别人先接管;下一轮重试
        }
        continue;
      }
      throw new SyncBusyError();
    }
  }
  throw new SyncBusyError("无法获取同步锁。");
}
