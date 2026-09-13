// 同步引擎本体(票 02;删除传播/熔断/列举闸门＝票 05)。
//
// 一次 run = 一次同步:
//   1. (可选)取锁 → 2. 读状态表(load() 为 null ⇒ 保守合并)→ 3. 枚举本地(不跟随符号
//   链接)与远端(深度 1 逐层)→ 4. 列举闸门 → 5. 决策表产出计划 → 6. 熔断守卫 →
//   7. **串行**执行,每完成一个文件写一次状态表 → 8. 汇总报告。
//
// 红线(决议 26/27/33/63 + 工程简报 §2.5):
//   · load() 为 null(无状态表)⇒ 保守合并,**绝不删除任何文件**;删除判定只允许出现
//     在 hasState 分支里;
//   · 远端删除必须靠基准版本:状态表有记录且本地内容仍等于基准,才认定「远端删除」;
//     本地已改 ⇒ 改 vs 删冲突,绝不删本地;
//   · 本地删除永远走 deps.trashFile(主进程 = shell.trashItem),绝不用不可恢复删除;
//   · 远端根列举返回 0 条而状态表非空 ⇒ 立即报错停止(列举闸门,决议 63);
//   · 一次同步要删除的文件数超阈值 ⇒ 先经 deps.confirmDeletes 确认,拒绝则零删除。
//
// 票 07:执行循环之后的收尾比对(remainingLocalChanges)已落地,见 countRemainingLocalChanges。
// 关窗/切工作区中断 → 票 06(run 的 signal 已支持取消)。


import type { WebdavClient, WebdavEntry } from "./webdav-types";
import { WebdavError } from "./webdav-types";
import type {
  DeleteGuardPrompt,
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
import { buildPlan, type PlanItem } from "./merge";
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
/** 整体失败的分类(界面据此区分提示与重试入口;决议 59–60)。 */
export type SyncFatalKind = "fatal" | "auth" | "delete-guard" | "listing-guard";

export class SyncFatalError extends Error {
  readonly kind: SyncFatalKind;
  constructor(message: string, kind: SyncFatalKind = "fatal") {
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

function rawDescribe(err: unknown): string {
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
  // 决议 43:日志与错误原因一律先过注入的遮蔽器(生产 = redactSecrets,含密码)。
  const redact = deps.redact ?? ((text: string): string => text);
  const sink = deps.logger;
  const log = (line: string): void => sink?.(redact(line));
  const describe = (err: unknown): string => redact(rawDescribe(err));

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
          log(`[sync] 重试 ${attempt + 1}/${config.retry.attempts}:${describe(err)}`);
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
     * 熔断守卫(决议 27)。统计计划中的删除项(deleteLocal + deleteRemote);数量
     * **超过** deleteGuardMax,或**超过**该侧文件总数的 deleteGuardRatio → 先经
     * deps.confirmDeletes 请用户确认。拒绝(或未注入回调)→ SyncFatalError,整次
     * 同步零删除。注意:「恰好等于阈值」不触发(边界取「超过」)。
     */
    async function enforceDeleteGuard(items: PlanItem[]): Promise<void> {
      const deletes = items.filter(
        (i): i is Extract<PlanItem, { type: "deleteLocal" | "deleteRemote" }> =>
          i.type === "deleteLocal" || i.type === "deleteRemote",
      );
      if (deletes.length === 0) return;

      const localDeletes = deletes.filter((i) => i.type === "deleteLocal").length;
      const remoteDeletes = deletes.length - localDeletes;
      const localTotal = local.files.size;
      const remoteTotal = remote.files.size;
      const maxFiles = config.thresholds.deleteGuardMax;
      const ratioLimit = config.thresholds.deleteGuardRatio;
      const localRatio = localTotal > 0 ? localDeletes / localTotal : 0;
      const remoteRatio = remoteTotal > 0 ? remoteDeletes / remoteTotal : 0;
      const triggeredByMax = deletes.length > maxFiles;
      const triggeredByRatio = localRatio > ratioLimit || remoteRatio > ratioLimit;
      if (!triggeredByMax && !triggeredByRatio) return;

      const prompt: DeleteGuardPrompt = {
        count: deletes.length,
        localDeletes,
        remoteDeletes,
        localTotal,
        remoteTotal,
        maxFiles,
        ratioLimit,
        triggeredByMax,
        triggeredByRatio,
        relPaths: deletes.map((i) => i.relPath),
      };
      log(
        `[sync] 熔断:计划删除 ${deletes.length} 个(本地 ${localDeletes} / 远端 ${remoteDeletes})` +
          `,阈值 ${maxFiles} 个 / ${Math.round(ratioLimit * 100)}%`,
      );
      const confirmed = deps.confirmDeletes ? await deps.confirmDeletes(prompt) : false;
      if (!confirmed) {
        throw new SyncFatalError(
          `本次同步计划删除 ${deletes.length} 个文件(本地 ${localDeletes} 个 / 远端 ${remoteDeletes} 个),` +
            `超过安全阈值(超过 ${maxFiles} 个,或超过该侧文件总数的 ${Math.round(ratioLimit * 100)}%)。` +
            `已停止,未删除任何文件。请确认后重试。`,
          "delete-guard",
        );
      }
      log(`[sync] 熔断已确认:继续,将删除 ${deletes.length} 个文件`);
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

    /**
     * 改 vs 删冲突(决议 26):本地内容已离开基准、远端已删。保留本地(绝不删除),
     * 并把本地版本恢复回远端——「修改胜过删除」,内容不因删除而丢。计入 conflicts。
     */
    async function resolveModifyDeleteConflict(
      rel: string,
      localBytes: Uint8Array,
      localHash: string,
    ): Promise<void> {
      report.conflicts++;
      // 远端已无该文件 → createOnly 创建,避免覆盖同步期间被别处恢复的内容。
      const entry = await putAndVerify(rel, localBytes, { createOnly: true });
      if (!entry) {
        report.failed.push({ relPath: rel, reason: "改/删冲突:本地版本已保留,但恢复远端未完成" });
        log(`[sync] 冲突(本地已改/远端已删):${rel} → 本地保留,远端恢复失败`);
        return;
      }
      await store.upsert(rel, makeRecord(rel, localHash, entry));
      log(`[sync] 冲突(本地已改/远端已删):${rel} → 保留本地并恢复远端`);
    }

    /**
     * 计划项 deleteLocal(远端已删候选)。红线(决议 26):只有本地内容**仍等于基准**
     * 才认定「远端删除」→ 本地进回收站(决议 25:deps.trashFile,绝不不可恢复删除);
     * 本地已改 ⇒ 改 vs 删冲突,保留本地。
     */
    async function runDeleteLocal(rel: string): Promise<void> {
      const entry = local.files.get(rel);
      const record = records[rel];
      if (!entry || !record) return; // 计划项只在两侧状态齐备时产出;防御式早退
      const bytes = await readLocalBytes(entry.absPath);
      const hash = sha256Hex(bytes);
      if (hash !== record.baseHash) {
        await resolveModifyDeleteConflict(rel, bytes, hash);
        return;
      }
      await deps.trashFile(entry.absPath);
      report.deletedLocal++;
      await store.forget(rel); // 记录清除 ⇒ 远端若恢复该文件,下次同步按「远端新增」拉回(决议 28)
      log(`[sync] 删除本地(远端已删):${rel} → 回收站`);
    }

    /**
     * 计划项 deleteRemote(本地已删候选)。红线(决议 26 的对称判定 + 决议 35):
     * 远端 DELETE 不可恢复,所以**下载并算内容 hash**,只有内容仍等于基准才认定
     * 「本地删除是唯一改动」→ 删除远端;远端已改 ⇒ 删 vs 改冲突,保留远端内容。
     */
    async function runDeleteRemote(rel: string): Promise<void> {
      const record = records[rel];
      const remoteEntry = remote.files.get(rel);
      if (!record || !remoteEntry) return; // 防御式早退
      const remoteBytes = await retry(() => client.get(rel));
      const remoteHash = sha256Hex(remoteBytes);
      if (remoteHash !== record.baseHash) {
        // 删 vs 改:远端已改 → 冲突,把远端内容恢复到本地;绝不删远端。
        report.conflicts++;
        await writeLocalAtomic(joinRoot(rel), remoteBytes);
        await store.upsert(rel, makeRecord(rel, remoteHash, remoteEntry));
        log(`[sync] 冲突(本地已删/远端已改):${rel} → 保留远端内容并恢复到本地,不删远端`);
        return;
      }
      await retry(() => client.remove(rel));
      report.deletedRemote++;
      await store.forget(rel); // 远端恢复该文件时按「远端新增」处理(决议 28)
      log(`[sync] 删除远端(本地已删):${rel}`);
    }

    /**
     * 收尾比对(决议 11):同步期间被再次改动的本地文件数。
     *
     * 判定:重扫本地;与本次 run 开始时元数据(大小/修改时间)不同的文件(含同步期间
     * 新增的),再算内容 hash 与**同步后的基准**比较——hash ≠ 基准才算「未同步的改动」。
     * 这样引擎自己写的文件(下载落盘、冲突副本,基准已对齐)不会被误计。
     *
     * 只数数,不重跑同步(决议 11:不自动重跑,否则用户持续输入会形成循环)。
     */
    async function countRemainingLocalChanges(): Promise<number> {
      throwIfAborted(); // 取消时不长扫本地
      const after = await scanLocal(config.workspacePath, {
        maxFileSizeBytes: config.thresholds.maxFileSizeBytes,
      });
      const finalState = await store.load(); // 只读:拿同步后的基准 hash
      const baseByRel = finalState?.records ?? {};
      let remaining = 0;
      for (const [rel, entry] of after.files) {
        const before = local.files.get(rel);
        // 元数据未变 ⇒ 本次 run 期间没被碰过,跳过(不必读内容算 hash)。
        if (before && before.mtimeMs === entry.mtimeMs && before.size === entry.size) continue;
        let hash: string;
        try {
          hash = sha256Hex(await readLocalBytes(entry.absPath));
        } catch {
          continue; // 读不到:不误报(下次同步自会处理)
        }
        if (hash !== (baseByRel[rel]?.baseHash ?? null)) remaining++;
      }
      return remaining;
    }

    async function runItem(item: PlanItem): Promise<void> {
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
        case "deleteLocal": {
          await runDeleteLocal(item.relPath);
          return;
        }
        case "deleteRemote": {
          await runDeleteRemote(item.relPath);
          return;
        }
        case "forgetRecord": {
          // 两侧皆无 → 只清记录,不碰任何文件(不是删除)。
          await store.forget(item.relPath);
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
      // 凭据由注入的 createClient 在自己的闭包里持有,引擎不掌握密码。
      client = deps.createClient();
      remote = await scanRemote(client, {
        maxFileSizeBytes: config.thresholds.maxFileSizeBytes,
        localRootAbs: config.workspacePath,
        signal,
        throwIfAborted,
      });
      report.skipped.push(...remote.skipped);

      // 被跳过的条目(决议 61)在 files 表里是缺失的;缺失 **不等于**「对方已删」。
      // 把它们交给决策表排除,防止「跳过」退化成「把另一侧的文件当删除处理掉」。
      const unmanaged = new Set<string>([
        ...local.skipped.map((s) => s.relPath),
        ...remote.skipped.map((s) => s.relPath),
      ]);

      // ── 列举闸门(决议 63):某目录列举返回 0 条,而状态表在该目录下仍有历史记录 ──
      // 立即报错停止,不做任何删除。依据:存在「上传正常、列举静默为空」的客户端
      // 编码缺陷,它一旦与删除传播相遇就是「本地全删」。无状态表时无历史 → 不触发。
      //
      // **逐目录判定,不只护根**:子目录列举静默为空会让其中的文件被判成「远端已删」
      // 而进本地回收站;根闸门看不见它,仅靠熔断兜底(阈值以下就放过了)。某目录列举
      // 出 0 条、而状态表里还有 `该目录/…` 的记录 —— 这是「列举不可信」而非「内容已删」。
      const recordCount = Object.keys(records).length;
      if (hasState && recordCount > 0) {
        const recordPaths = Object.keys(records);
        const suspicious = [...remote.rawCounts].find(([dir, raw]) => {
          if (raw !== 0) return false;
          const prefix = dir === "" ? "" : `${dir}/`;
          return recordPaths.some((p) => p.startsWith(prefix));
        });
        if (suspicious) {
          const [dir] = suspicious;
          const where = dir === "" ? "远端根目录" : `远端目录「${dir}」`;
          throw new SyncFatalError(
            `${where}列举返回 0 条,但本机状态表里还有该目录下的历史记录(共 ${recordCount} 条)。` +
              `为避免把「列举异常」当成「远端已清空」而删光本地笔记,已停止,未做任何删除。`,
            "listing-guard",
          );
        }
      }

      // ── 计划(删除组合只在 hasState && record 时产出 deleteLocal/deleteRemote/forget) ──
      const plan = buildPlan({
        localFiles: local.files,
        localDirs: local.dirs,
        remoteFiles: remote.files,
        remoteDirs: remote.dirs,
        records,
        hasState,
        unmanaged,
      });

      // ── 熔断守卫(决议 27):执行循环**之前**。检查完再做任何删除。 ──
      await enforceDeleteGuard(plan);

      const work: PlanItem[] = plan;

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
          report.failed.push({ relPath: item.relPath, reason: describe(err) });
          log(`[sync] 失败 ${item.relPath}:${describe(err)}`);
        }
        done++;
        emit(item.relPath);
      }

      // 收尾比对(决议 11):统计同步期间又被改动的文件数;**绝不自动重跑**。
      report.remainingLocalChanges = await countRemainingLocalChanges();
      log(
        `[sync] 完成:上传 ${report.uploaded} / 下载 ${report.downloaded} / 冲突 ${report.conflicts} ` +
          `/ 跳过 ${report.skipped.length} / 失败 ${report.failed.length}` +
          (report.remainingLocalChanges > 0
            ? ` / 还有 ${report.remainingLocalChanges} 个文件的改动未同步(不自动重跑)`
            : ""),
      );
      return report;
    } catch (err) {
      if (err instanceof SyncAbortedError) {
        log(
          `[sync] 已取消:已完成 上传 ${report.uploaded} / 下载 ${report.downloaded} / 冲突 ${report.conflicts}`,
        );
        return report; // 取消:已完成的操作保留
      }
      // 决议 59:认证失败在**任何阶段**(含枚举)都单独识别、立即停下、绝不重试,
      // 以免触发服务端登录失败锁定。转成统一的致命错误,供界面提示「用户名或密码错误」。
      if (isAuthError(err)) {
        log("[sync] 认证失败:立即停止(不重试)");
        throw new SyncFatalError("用户名或密码错误。", "auth");
      }
      throw err;
    } finally {
      await lock?.release();
    }
  }

  return { run };
}
