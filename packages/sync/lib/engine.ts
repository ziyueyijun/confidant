// 同步引擎本体(票 02)。
//
// 一次 run = 一次同步:
//   1. (可选)取锁 → 2. 读状态表(load() 为 null ⇒ 保守合并)→ 3. 枚举本地(不跟随符号
//   链接)与远端(深度 1 逐层)→ 4. 决策表产出计划 → 5. **串行**执行,每完成一个文件
//   写一次状态表 → 6. 汇总报告。
//
// 红线(决议 33 + 工程简报 §2.5):状态表为空时**绝不删除任何文件**;删除判定交给票 05。
//
// 后续票的插入点(见各函数注释):
//   - 删除判定 / 熔断 / 列举闸门 → 票 05(merge.ts buildPlan 的 hasState 分支、run 里
//     执行前的守卫、scanRemote 之后);
//   - 增量变更探测 → 票 03(已实现:change-detect.ts 的 remoteEntryChanged +
//     resolveBoth 的 hash 确认);
//   - 冲突判定 → 票 04(resolveConflict);
//   - 收尾比对(remainingLocalChanges)→ 票 07;
//   - 关窗/切工作区中断 → 票 06(run 的 signal 已支持取消)。

import type { WebdavClient, WebdavEntry } from "./webdav-types";
import { WebdavError } from "./webdav-types";
import type {
  SyncConfig,
  SyncDeps,
  SyncEngine,
  SyncFileRecord,
  SyncProgress,
  SyncReport,
  SyncStateStore,
} from "./sync-types";
import { scanLocal, readLocalBytes, writeLocalAtomic, type LocalSnapshot } from "./fs-local";
import { scanRemote, type RemoteSnapshot } from "./remote";
import { actionableItems, buildPlan, type PlanItem } from "./merge";
import { remoteEntryChanged } from "./change-detect";
import { uniqueConflictCopyRelPath } from "./conflict";
import { sha256Hex } from "./hash";
import { acquireLock, SyncBusyError, type SyncLock } from "./lock";
import { parentOfRelPath } from "./paths";

/** 取消(AbortSignal):已完成的操作保留,run 返回已完成的报告。 */
export class SyncAbortedError extends Error {
  constructor() {
    super("同步已取消");
    this.name = "SyncAbortedError";
  }
}

/** 整体失败(决议 59/60:认证失败、列举失败等 → 停下并提示,不回退为部分成功)。 */
export class SyncFatalError extends Error {
  readonly kind: string;
  constructor(message: string, kind = "fatal") {
    super(message);
    this.name = "SyncFatalError";
    this.kind = kind;
  }
}

export interface SyncEngineOptions {
  config: SyncConfig;
  deps: SyncDeps;
  store: SyncStateStore;
  /** 锁目录(本机 userData 侧)。省略则不取锁(测试可省略)。 */
  lockDir?: string;
}

function emptyReport(): SyncReport {
  return {
    uploaded: 0,
    downloaded: 0,
    conflicts: 0,
    deletedRemote: 0,
    deletedLocal: 0,
    skipped: [],
    failed: [],
    remainingLocalChanges: 0,
  };
}

function isAuthError(err: unknown): boolean {
  return err instanceof WebdavError && err.kind === "auth";
}

function describeError(err: unknown): string {
  return (err as { message?: string })?.message ?? String(err);
}

function makeRecord(relPath: string, baseHash: string, entry: WebdavEntry | null): SyncFileRecord {
  return {
    relPath,
    baseHash,
    etag: entry?.etag ?? null,
    remoteModified: entry?.lastModified ?? null,
    remoteSize: entry?.size ?? null,
  };
}

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const { config, deps, store } = opts;
  const now = deps.now ?? ((): number => Date.now());
  const log = deps.logger ?? ((): void => undefined);

  async function run(
    signal?: AbortSignal,
    onProgress?: (p: SyncProgress) => void,
  ): Promise<SyncReport> {
    const report = emptyReport();
    let lock: SyncLock | null = null;

    // 单次 run 的共享状态(嵌套辅助函数以闭包访问)。
    let client: WebdavClient;
    let local: LocalSnapshot;
    let remote: RemoteSnapshot;
    let records: Record<string, SyncFileRecord> = {};
    let hasState = false;

    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new SyncAbortedError();
    };

    function sleepAbortable(ms: number): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new SyncAbortedError());
          return;
        }
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(new SyncAbortedError());
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }

    async function retry<T>(fn: () => Promise<T>): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        throwIfAborted();
        try {
          return await fn();
        } catch (err) {
          if (isAuthError(err)) throw new SyncFatalError("用户名或密码错误。", "auth");
          if (attempt >= config.retry.attempts) throw err;
          const delay = config.retry.baseDelayMs * 2 ** attempt;
          log(`[sync] 重试 ${attempt + 1}/${config.retry.attempts}:${describeError(err)}`);
          if (delay > 0) await sleepAbortable(delay);
        }
      }
    }

    async function readback(rel: string): Promise<WebdavEntry | null> {
      const entries = await retry(() => client.list(parentOfRelPath(rel)));
      return entries.find((e) => e.relPath === rel) ?? null;
    }

    /** ensureDir + put + 回读校验大小(决议 47)。不一致/缺失返回 null。 */
    async function putAndVerify(
      rel: string,
      bytes: Uint8Array,
      putOpts: { createOnly?: boolean; ifMatch?: string | null },
    ): Promise<WebdavEntry | null> {
      await retry(() => client.ensureDir(parentOfRelPath(rel)));
      await retry(() =>
        client.put(rel, bytes, { createOnly: putOpts.createOnly, ifMatch: putOpts.ifMatch ?? undefined }),
      );
      const entry = await readback(rel);
      if (!entry) return null;
      if (entry.size !== null && entry.size !== bytes.length) return null;
      return entry;
    }

    function joinRoot(rel: string): string {
      const root = config.workspacePath.replace(/[\\/]+$/, "");
      const sep = root.includes("\\") ? "\\" : "/";
      return `${root}${sep}${rel.replace(/\//g, sep)}`;
    }

    function isTaken(candidate: string): boolean {
      return (
        local.files.has(candidate) ||
        remote.files.has(candidate) ||
        local.dirs.includes(candidate) ||
        remote.dirs.has(candidate)
      );
    }

    /**
     * 只本地改 → 上传并记基准。上传后回读校验失败则计失败(决议 47)。
     * 用于两条路径:远端无变化信号时,以及远端验证符失真但内容仍等于基准时。
     */
    async function uploadLocal(
      rel: string,
      localBytes: Uint8Array,
      localHash: string,
      ifMatch: string | null,
    ): Promise<void> {
      const entry = await putAndVerify(rel, localBytes, { ifMatch });
      if (!entry) {
        report.failed.push({ relPath: rel, reason: "上传后校验失败(大小不一致或条目缺失)" });
        return;
      }
      report.uploaded++;
      await store.upsert(rel, makeRecord(rel, localHash, entry));
    }

    /**
     * 冲突处置 = 保留双份(决议 22–23):本地文件保持不动;远端版本落成本地冲突副本;
     * 副本作为普通文件上传到远端;本地版本覆盖远端主名(远端版本已存于副本,内容不丢)。
     * 终态:两侧都是「主名=本地版本 + 副本=远端版本」,下一次同步稳定无操作。
     *
     * 覆盖远端主名是票 02 的裁决,票 04 独立复核后维持(见票 04 Answer):
     * 若改成「远端主名不动」,则基准 hash 要么记本地(下次同步会把本地版本覆盖掉 =
     * 丢内容),要么记远端(远端主名此后一直落后于本地,要再同步一次才收敛,第二台
     * 机器也看不到冲突)。覆盖方案在一次同步内收敛,且远端那份内容先落副本再被替换,
     * 不丢任何版本。
     */
    async function resolveConflict(
      rel: string,
      localBytes: Uint8Array,
      localHash: string,
      remoteBytes: Uint8Array,
      remoteHash: string,
      remoteEntry: WebdavEntry,
    ): Promise<void> {
      const copyRel = uniqueConflictCopyRelPath(rel, new Date(now()), isTaken);
      await writeLocalAtomic(joinRoot(copyRel), remoteBytes);
      const copyEntry = await putAndVerify(copyRel, remoteBytes, { createOnly: true });
      const primaryEntry = await putAndVerify(rel, localBytes, { ifMatch: remoteEntry.etag });
      report.conflicts++;
      log(`[sync] 冲突:${rel} → 保留双份,副本 ${copyRel}`);
      if (!copyEntry || !primaryEntry) {
        // 本地副本已落盘,内容未丢;远端未完全落地,状态表不记基准,下次重判。
        report.failed.push({ relPath: rel, reason: "冲突副本已保留本地,但上传远端未完成" });
        return;
      }
      await store.upsert(rel, makeRecord(rel, localHash, primaryEntry));
      await store.upsert(copyRel, makeRecord(copyRel, remoteHash, copyEntry));
    }

    async function runResolveBoth(rel: string): Promise<void> {
      const localEntry = local.files.get(rel)!;
      const remoteEntry = remote.files.get(rel)!;
      const record = records[rel];
      const localBytes = await readLocalBytes(localEntry.absPath);
      const localHash = sha256Hex(localBytes);

      if (hasState && record) {
        // 增量变更探测(票 03):验证符/修改时间/大小任一不同 ⇒ 下载算 hash 确认。
        // 内容 hash 才是权威;验证符只做变化探测(决议 35,见 change-detect.ts)。
        const remoteChanged = remoteEntryChanged(record, remoteEntry);
        const localChanged = localHash !== record.baseHash;
        if (!remoteChanged && !localChanged) return; // 未变更:不产生传输
        if (!remoteChanged && localChanged) {
          // 远端无变化信号、本地内容不等于基准 ⇒ 只本地改 → 上传。
          await uploadLocal(rel, localBytes, localHash, record.etag);
          return;
        }
        // 远端疑似已变:下载并算 hash 确认(决议 35;验证符只做变化探测)。
        const remoteBytes = await retry(() => client.get(rel));
        const remoteHash = sha256Hex(remoteBytes);
        if (remoteHash === localHash) {
          // 两侧内容一致:含「两侧都改且内容相同」(不冲突)与「仅验证符/时间/大小
          // 失真」⇒ 只把基准对齐到该内容,不写盘。
          await store.upsert(rel, makeRecord(rel, localHash, remoteEntry));
          return;
        }
        // 内容不一致:按「谁的内容真的离开了基准版本」判定(决议 21)。
        // 依据是 hash,**绝不**用验证符 —— 验证符会失真(票 03 A4/A5)。
        // 把远端 hash 与基准比较这一步是必要的:验证符变了但内容仍等于基准,
        // 只是「仅本地改」,不是冲突。
        const remoteLeftBase = remoteHash !== record.baseHash;
        if (!localChanged) {
          // 仅远端内容变化 → 下载。
          await writeLocalAtomic(joinRoot(rel), remoteBytes);
          report.downloaded++;
          await store.upsert(rel, makeRecord(rel, remoteHash, remoteEntry));
          return;
        }
        if (!remoteLeftBase) {
          // 远端内容其实仍等于基准(被验证符/时间/大小失真误报)→ 仅本地改 → 上传。
          // If-Match 用**本次观测到的**远端验证符(record.etag 已因失真而过时)。
          await uploadLocal(rel, localBytes, localHash, remoteEntry.etag);
          return;
        }
        // 两侧内容都离开基准且互不相同 → 冲突:保留双份。
        await resolveConflict(rel, localBytes, localHash, remoteBytes, remoteHash, remoteEntry);
        return;
      }

      // 无记录(保守合并,首次同步):下载内容比对(决议 29)。
      const remoteBytes = await retry(() => client.get(rel));
      const remoteHash = sha256Hex(remoteBytes);
      if (remoteHash === localHash) {
        // 同名同内容 → 视为已同步,只记基准。
        await store.upsert(rel, makeRecord(rel, localHash, remoteEntry));
        return;
      }
      // 同名不同内容 → 两份都保留(远端版本落成冲突副本)。
      await resolveConflict(rel, localBytes, localHash, remoteBytes, remoteHash, remoteEntry);
    }

    async function runItem(item: Exclude<PlanItem, { type: "defer" }>): Promise<void> {
      switch (item.type) {
        case "ensureDir": {
          await retry(() => client.ensureDir(item.relPath));
          return;
        }
        case "upload": {
          const entry = local.files.get(item.relPath)!;
          const bytes = await readLocalBytes(entry.absPath);
          const hash = sha256Hex(bytes);
          // 决议 48:创建用 If-None-Match: * 保护(不覆盖同步期间被别处创建的文件)。
          const remoteEntry = await putAndVerify(item.relPath, bytes, { createOnly: true });
          if (!remoteEntry) {
            report.failed.push({ relPath: item.relPath, reason: "上传后校验失败(大小不一致或条目缺失)" });
            return;
          }
          report.uploaded++;
          await store.upsert(item.relPath, makeRecord(item.relPath, hash, remoteEntry));
          return;
        }
        case "download": {
          const bytes = await retry(() => client.get(item.relPath));
          const hash = sha256Hex(bytes);
          await writeLocalAtomic(joinRoot(item.relPath), bytes);
          report.downloaded++;
          await store.upsert(item.relPath, makeRecord(item.relPath, hash, remote.files.get(item.relPath) ?? null));
          return;
        }
        case "resolveBoth": {
          await runResolveBoth(item.relPath);
          return;
        }
      }
    }

    try {
      throwIfAborted();
      if (opts.lockDir) lock = await acquireLock(opts.lockDir, config.workspacePath, now);

      // ── 状态表:null ⇒ 保守合并(决议 29/33) ──
      const state = await store.load();
      hasState = state !== null;
      records = state?.records ?? {};

      // ── 枚举本地(独立实现,不跟随符号链接;决议 18) ──
      local = await scanLocal(config.workspacePath, {
        maxFileSizeBytes: config.thresholds.maxFileSizeBytes,
      });
      report.skipped.push(...local.skipped);

      throwIfAborted();

      // ── 远端客户端 + 枚举(决议 45:深度 1 逐层;列举失败按整体失败抛出) ──
      // 凭据由注入的 createClient 提供,引擎不掌握密码。
      client = deps.createClient({ baseUrl: config.remoteBaseUrl, username: "", password: "" });
      remote = await scanRemote(client, {
        maxFileSizeBytes: config.thresholds.maxFileSizeBytes,
        signal,
        throwIfAborted,
      });
      report.skipped.push(...remote.skipped);

      // ── 计划(删除相关组合产出 defer;票 05 在此改判) ──
      const plan = buildPlan({
        localFiles: local.files,
        localDirs: local.dirs,
        remoteFiles: remote.files,
        remoteDirs: remote.dirs,
        records,
        hasState,
      });
      // 票 05 的熔断守卫插入点:此处对 plan 里的删除项做阈值判定。
      const work = actionableItems(plan);

      const total = work.length;
      let done = 0;
      const emit = (current: string | null): void => onProgress?.({ done, total, current });
      emit(null);
      log(
        `[sync] 开始:本地 ${local.files.size} 个文件,远端 ${remote.files.size} 个,` +
          `待处理 ${total} 项${hasState ? "" : "(无状态表:保守合并,不删任何文件)"}`,
      );

      // ── 串行执行(决议 14:并发数为 1);每完成一个文件写一次状态表(决议 34) ──
      for (const item of work) {
        throwIfAborted();
        emit(item.relPath);
        try {
          await runItem(item);
        } catch (err) {
          if (
            err instanceof SyncAbortedError ||
            err instanceof SyncFatalError ||
            err instanceof SyncBusyError
          ) {
            throw err;
          }
          if (isAuthError(err)) throw new SyncFatalError("用户名或密码错误。", "auth");
          report.failed.push({ relPath: item.relPath, reason: describeError(err) });
          log(`[sync] 失败 ${item.relPath}:${describeError(err)}`);
        }
        done++;
        emit(item.relPath);
      }

      // 票 07 的收尾比对插入点:统计同步期间又被改动的文件数(remainingLocalChanges)。
      report.remainingLocalChanges = 0;
      log(
        `[sync] 完成:上传 ${report.uploaded} / 下载 ${report.downloaded} / 冲突 ${report.conflicts} ` +
          `/ 跳过 ${report.skipped.length} / 失败 ${report.failed.length}`,
      );
      return report;
    } catch (err) {
      if (err instanceof SyncAbortedError) {
        log(
          `[sync] 已取消:已完成 上传 ${report.uploaded} / 下载 ${report.downloaded} / 冲突 ${report.conflicts}`,
        );
        return report; // 取消:已完成的操作保留
      }
      throw err;
    } finally {
      await lock?.release();
    }
  }

  return { run };
}
