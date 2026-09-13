// 启动只读探测(决议 8)。应用启动后对远端根做**一次**探测:若远端存在本机状态表里
// 没有的变更,页脚状态条显示一个小圆点(提示用户该同步了)。
//
// 红线:
//   · **只读**——`store.load()` 是唯一的状态表访问,绝不 `upsert`/`save`/`markDeleted`/
//     `forget`;绝不 PUT/DELETE 远端;绝不写本地文件;
//   · **不做轮询**——本模块只做一次 `scanRemote`,没有定时器、没有重试、没有循环;
//   · **失败静默降级**——离线 / 认证失败 / 目录不可达等一律 catch,返回非 checked 结果,
//     绝不抛给启动路径;
//   · **未配置不发请求**——`remoteBaseUrl` 为空时在**建客户端之前**返回,零网络请求。
//
// 「本机未知变更」的判定**复用 `remoteEntryChanged`**(票 03 导出),不另写一套:
//   · 状态表里没有该条目的记录 → 本机未知(新出现);
//   · 有记录 → `remoteEntryChanged` 判「疑似已变」(验证符/修改时间/大小任一不同)。
// 「无状态表」时 records 为空,于是每个远端条目都算「本机未知」——正是圆点该亮的条件。

import type { WebdavClient, WebdavConfig } from "./webdav-types";
import type { SyncStateStore } from "./sync-types";
import { scanRemote } from "./remote";
import { remoteEntryChanged } from "./change-detect";
import { DEFAULT_SYNC_THRESHOLDS } from "./sync-types";

export interface SyncProbeOptions {
  /**
   * 远端根地址。空 / 空白 / null = 该工作区未配置同步 → **在创建客户端之前返回**,
   * 不发生任何网络请求(决议 8 的「未配置不发请求」)。
   */
  remoteBaseUrl: string | null | undefined;
  /** 状态表(只读:`load()`)。启动探测绝不写状态表。 */
  store: SyncStateStore;
  /** 客户端工厂(生产:真地址;测试:webfake 端口)。未配置时**不会被调用**。
   *  不收参数:凭据由注入方在自己的闭包里持有(与引擎一致)。 */
  createClient: () => WebdavClient;
  maxFileSizeBytes?: number;
  logger?: (line: string) => void;
}

export type SyncProbeStatus = "checked" | "not-configured" | "failed";

export interface SyncProbeResult {
  /** checked = 探测成功;not-configured = 未配置(零请求);failed = 探测失败(静默降级)。 */
  status: SyncProbeStatus;
  /** 仅 status="checked" 时可信;其它状态恒 false(失败不显示圆点)。 */
  hasUnknownChanges: boolean;
  /** 本机未知的远端条目数;仅 checked 时有意义(供日志/排障)。 */
  changeCount: number;
}

/**
 * 对远端根做一次只读探测。**任何失败都不抛**:返回 `status:"failed"`,
 * `hasUnknownChanges:false`(离线、认证失败、目录不可达都走这条)。
 */
export async function probeRemoteChanges(opts: SyncProbeOptions): Promise<SyncProbeResult> {
  const baseUrl = opts.remoteBaseUrl?.trim();
  // 未配置同步 → 不建客户端、不发任何请求(验收:「该工作区未配置同步时不发起请求」)。
  if (!baseUrl) return { status: "not-configured", hasUnknownChanges: false, changeCount: 0 };

  const log = opts.logger ?? ((): void => undefined);
  try {
    // 状态表只读:load() 从不写盘(见 state-store.ts)。
    const state = await opts.store.load();
    const records = state?.records ?? {};

    const client = opts.createClient();
    // 一次深度 1 逐层遍历;不做任何轮询/重试。
    const remote = await scanRemote(client, {
      maxFileSizeBytes: opts.maxFileSizeBytes ?? DEFAULT_SYNC_THRESHOLDS.maxFileSizeBytes,
      throwIfAborted: (): void => undefined,
    });

    let changeCount = 0;
    for (const [relPath, entry] of remote.files) {
      const record = records[relPath];
      // 状态表里没有记录 → 本机未知;有记录 → 复用「疑似已变」判定(不另写一套)。
      if (!record || remoteEntryChanged(record, entry)) changeCount++;
    }
    // 对称的一半:**记录仍在、远端已无** = 远端删除,也是一种「本机不知道的变更」。
    // 只遍历远端条目会漏掉它,圆点就永远不亮(决议 8 的「远端存在本机状态表里没有的
    // 变更」,用户故事 15)。这里只做「有没有」的粗判,不复制引擎的删/改冲突判定 ——
    // 引擎仍会在真正同步时用本地 hash 与基准比对,决定是删本地还是保留双份。
    for (const [relPath, record] of Object.entries(records)) {
      if (record.tombstone) continue;
      if (!remote.files.has(relPath)) changeCount++;
    }

    log(
      `[sync-probe] 完成:远端 ${remote.files.size} 个文件,本机未知变更 ${changeCount} 个` +
        `${state ? "" : "(无状态表)"}`,
    );
    return { status: "checked", hasUnknownChanges: changeCount > 0, changeCount };
  } catch (err) {
    // 只读探测失败(离线 / 认证失败 / 目录不可达等)→ 静默降级,不打断启动。
    log(`[sync-probe] 探测失败(静默降级):${(err as { message?: string })?.message ?? String(err)}`);
    return { status: "failed", hasUnknownChanges: false, changeCount: 0 };
  }
}
