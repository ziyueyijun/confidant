// 同步引擎与状态表的类型骨架(入口点 index.ts 转发)。
// 本票只立形状,同步算法由后续票(02–07)在此之上生长。

import type { WebdavClient, WebdavConfig } from "./webdav-types";

/**
 * 引擎的依赖注入形状(工程简报 §1)。生产:createClient 指真地址;测试:指向
 * webfake 起的端口。trashFile 走回收站(与 Cmd.delete 一致)。本地文件系统不注入。
 */
export interface SyncDeps {
  createClient: (config: WebdavConfig) => WebdavClient;
  trashFile: (absPath: string) => Promise<void>;
  /**
   * 熔断确认(决议 27)。一次同步计划删除的文件数超阈值时调用;返回 false ⇒ 整次同步
   * **零删除**。省略 ⇒ 视为拒绝(引擎绝不自行弹窗;主进程接 dialog.showMessageBox)。
   */
  confirmDeletes?: (prompt: DeleteGuardPrompt) => Promise<boolean>;
  /**
   * 遮蔽敏感串(决议 43:日志与错误信息不含密码)。省略 = 原样。生产由主进程注入
   * `redactSecrets`(密码只有主进程掌握,引擎自身不持有凭据)。引擎把它套在**每一条
   * 日志**与**每一个进入报告的错误原因**上。
   */
  redact?: (text: string) => string;
  now?: () => number;
  logger?: (line: string) => void;
}

/** 熔断确认信息(决议 27);供界面展示「要删多少、占比多少」。 */
export interface DeleteGuardPrompt {
  /** 本次同步计划删除的文件总数(本地 + 远端)。 */
  count: number;
  /** 其中进本地回收站的数量(远端已删)。 */
  localDeletes: number;
  /** 其中删除远端文件的数量(本地已删)。 */
  remoteDeletes: number;
  /** 本地当前文件总数。 */
  localTotal: number;
  /** 远端当前文件总数。 */
  remoteTotal: number;
  /** 阈值:绝对数量上限。 */
  maxFiles: number;
  /** 阈值:占该侧文件总数的比例上限。 */
  ratioLimit: number;
  /** 是否由「数量超限」触发。 */
  triggeredByMax: boolean;
  /** 是否由「占比超限」触发。 */
  triggeredByRatio: boolean;
  /** 拟删除文件的相对路径(供界面摘要)。 */
  relPaths: string[];
}

/** 阈值类参数进配置对象(决议 17、27、58;测试传极小值,不造大文件)。 */
export interface SyncThresholds {
  /** 单文件上限(字节),超出跳过并计入报告。 */
  maxFileSizeBytes: number;
  /** 熔断:单次要删除的文件数上限(绝对值)。 */
  deleteGuardMax: number;
  /** 熔断:单次要删除的文件数占该侧总数比例上限。 */
  deleteGuardRatio: number;
}

export interface SyncRetryPolicy {
  /** 单文件失败重试次数(不含首试)。 */
  attempts: number;
  /** 指数退避基准(ms)。 */
  baseDelayMs: number;
}

export interface SyncConfig {
  /** 工作区绝对路径(状态表的键)。 */
  workspacePath: string;
  remoteBaseUrl: string;
  thresholds: SyncThresholds;
  retry: SyncRetryPolicy;
}

/** 进度回调(决议 53);取消经 AbortSignal(决议 64)。 */
export interface SyncProgress {
  done: number;
  total: number;
  /** 当前处理项相对路径;无则 null。 */
  current: string | null;
}

export interface SyncIssue {
  relPath: string;
  reason: string;
}

/** 一次同步的结果摘要(决议 54;跳过的绝不并入成功)。 */
export interface SyncReport {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  deletedRemote: number;
  deletedLocal: number;
  skipped: SyncIssue[];
  failed: SyncIssue[];
  /** 同步期间又被改动的文件数(决议 11,不自动重跑)。 */
  remainingLocalChanges: number;
}

/** 引擎:一次 run = 一次同步。 */
export interface SyncEngine {
  run(signal?: AbortSignal, onProgress?: (p: SyncProgress) => void): Promise<SyncReport>;
}

// ─── 状态表(决议 32–35) ───────────────────────────────────────────────────

/** 状态表里每个文件的基准记录。 */
export interface SyncFileRecord {
  relPath: string;
  /** 上次同步时的内容 hash——判定「谁改过」的唯一权威(决议 35)。 */
  baseHash: string;
  /** 远端验证符原样;只做变化探测,可为 null(Alist 等不返回)。 */
  etag: string | null;
  /** 远端修改时间原样;null 表示未知。 */
  remoteModified: string | null;
  /** 远端字节数;null 表示未知。 */
  remoteSize: number | null;
  /** 删除墓碑:记录保留但标记已删(判定远端删除用)。 */
  tombstone?: boolean;
}

export interface SyncState {
  version: 1;
  /** 工作区绝对路径(键;冗余存一份用于校验)。 */
  workspace: string;
  /** 首次同步完成时刻;null = 从未成功同步(走保守合并)。 */
  initializedAt: number | null;
  /** relPath → 记录。 */
  records: Record<string, SyncFileRecord>;
}

/** 状态表读写。按工作区为键;每完成一个文件写一次(决议 34)。 */
export interface SyncStateStore {
  /**
   * 读。文件不存在 / 不可读 / 解析失败 / 版本或键不符 → null(退化为「无状态表」)。
   * 绝不静默重建为空表,也绝不因读取失败而写盘。
   */
  load(): Promise<SyncState | null>;
  /** 整表原子覆盖写。 */
  save(state: SyncState): Promise<void>;
  /** 写一个文件记录并落盘(每完成一个文件调用一次)。 */
  upsert(relPath: string, rec: SyncFileRecord): Promise<void>;
  /** 标删除墓碑(记录保留,供「远端已删」判定)。 */
  markDeleted(relPath: string): Promise<void>;
  /** 清除记录(远端恢复为「远端新增」判定所需,决议 28)。 */
  forget(relPath: string): Promise<void>;
}
