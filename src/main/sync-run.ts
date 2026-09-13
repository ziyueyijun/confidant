// 跑一次同步的手脚(主进程侧;票 02 起)。
// 读该工作区的配置与凭据 → 建注入式传输层的 WebDAV 客户端 → 建状态表(userData,
// 工作区键先归一化)→ 跑引擎。日志写本机滚动文件,不含密码(决议 43)。
//
// 多工作区串行(决议 12):经模块级 promise 链排队,一次只跑一个。
// 凭据只在本进程内解密;绝不进渲染层、绝不进日志。

import { app, BrowserWindow, dialog, shell } from "electron";
import { join } from "node:path";
import {
  createSyncEngine,
  createSyncStateStore,
  DEFAULT_SYNC_RETRY,
  DEFAULT_SYNC_THRESHOLDS,
  probeRemoteChanges,
  SyncBusyError,
  type SyncProgress,
} from "../../packages/sync";
import { createWebdavClient } from "../../packages/sync/client";
import { normalizeWorkspaceKey, redactSecrets, type SyncOutcome, type SyncProbeOutcome } from "@shared/sync";
import { readWorkspaceSyncConfig } from "./sync-settings";
import { createSyncFetch } from "./sync-fetch";
import { createSyncLogger } from "./sync-log";
import { buildDeleteGuardMessage } from "./sync-interrupt";

/** 进行中的同步的中止控制器(取消通道用)。 */
let activeAbort: AbortController | null = null;
/** 进行中同步的最新进度(关窗确认要报「已完成 123 / 540」)。 */
let activeProgress: SyncProgress = { done: 0, total: 0, current: null };
/** 串行队列:多个工作区的同步任务一次一个(决议 12)。 */
let chain: Promise<unknown> = Promise.resolve();

/** 取消进行中的同步;已完成的操作保留。 */
export function cancelSyncRun(): void {
  activeAbort?.abort();
}

/** 是否有同步在跑。 */
export function isSyncRunning(): boolean {
  return activeAbort !== null;
}

/** 进行中同步的最新进度(无同步时为 0 / 0)。 */
export function getSyncProgress(): SyncProgress {
  return activeProgress;
}

/**
 * 排队跑一次同步。返回该次的最终结果(ok / cancelled / error)。
 * `onProgress` 在同步进行中被反复调用(done/total/current)。
 */
export function runSync(
  workspacePath: string,
  onProgress: (p: SyncProgress) => void,
): Promise<SyncOutcome> {
  const task = chain.then(() => doRunSync(workspacePath, onProgress));
  chain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function doRunSync(
  workspacePath: string,
  onProgress: (p: SyncProgress) => void,
): Promise<SyncOutcome> {
  const cfg = await readWorkspaceSyncConfig(workspacePath);
  if (!cfg) {
    return { status: "error", message: "尚未配置同步:请在「文件 → 同步设置…」填写远端地址与凭据。" };
  }
  if (!cfg.baseUrl) {
    return { status: "error", message: "尚未填写远端地址:请在「文件 → 同步设置…」中配置。" };
  }
  if (cfg.passwordUndecryptable) {
    return {
      status: "error",
      message: "已存密码无法解密(可能换了机器或 Windows 账户),请在同步设置中重新输入密码。",
    };
  }

  const logger = createSyncLogger([cfg.password]); // 决议 43:每行再兜底遮蔽密码
  const redact = (text: string): string => redactSecrets(text, [cfg.password]);
  const abort = new AbortController();
  activeAbort = abort;
  activeProgress = { done: 0, total: 0, current: null };
  logger(`[sync-run] 开始 workspace=${workspacePath} remote=${redact(cfg.baseUrl)}`);

  try {
    const store = createSyncStateStore({
      dir: join(app.getPath("userData"), "sync-state"),
      // 工程简报 §2.5:工作区键先归一化(大小写/分隔符),否则状态表看起来「没生效」。
      workspacePath: normalizeWorkspaceKey(workspacePath),
    });
    const engine = createSyncEngine({
      config: {
        workspacePath,
        remoteBaseUrl: cfg.baseUrl,
        thresholds: DEFAULT_SYNC_THRESHOLDS,
        retry: DEFAULT_SYNC_RETRY,
      },
      deps: {
        // 引擎不掌握凭据:createClient 闭包注入地址/用户名/密码/信任开关与传输层。
        createClient: () =>
          createWebdavClient({
            baseUrl: cfg.baseUrl,
            username: cfg.username,
            password: cfg.password,
            trustSelfSignedCert: cfg.trustSelfSignedCert,
            fetch: createSyncFetch({ trustSelfSignedCert: cfg.trustSelfSignedCert }),
          }),
        trashFile: async (absPath) => {
          await shell.trashItem(absPath); // 本地删除永远走回收站(决议 25;票 05 用)
        },
        // 决议 43:引擎的日志与错误原因经此遮蔽,密码绝不进报告/日志。
        redact,
        // 决议 27:熔断确认接到主进程对话框(票 05 遗留,票 06 接线)。
        confirmDeletes: confirmDeletesViaDialog,
        logger,
      },
      store,
      lockDir: join(app.getPath("userData"), "sync-locks"),
    });

    const report = await engine.run(abort.signal, (p) => {
      activeProgress = p;
      onProgress(p);
    });
    const status = abort.signal.aborted ? "cancelled" : "ok";
    logger(
      `[sync-run] 结束 status=${status} 上传 ${report.uploaded} / 下载 ${report.downloaded} ` +
        `/ 冲突 ${report.conflicts} / 跳过 ${report.skipped.length} / 失败 ${report.failed.length}`,
    );
    return { status, report };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = redact(raw); // 决议 43:错误信息遮蔽密码
    logger(`[sync-run] 失败:${message}`);
    if (err instanceof SyncBusyError) return { status: "error", message: err.message };
    return { status: "error", message };
  } finally {
    activeAbort = null;
  }
}

/**
 * 启动只读探测(决议 8;主进程侧)。对远端根做**一次**列目录,回报有无本机未知变更。
 *
 * - 未配置同步(无配置 / 无地址 / 密码解密失败)→ 直接返回,**零网络请求**;
 * - 探测本身只读:只 load 状态表 + list 远端,绝不写状态表 / 远端 / 本地;
 * - 任何失败(离线、认证失败、目录不可达)都静默降级为 false,绝不打断启动、绝不抛。
 */
export async function probeSyncRun(workspacePath: string): Promise<SyncProbeOutcome> {
  try {
    const cfg = await readWorkspaceSyncConfig(workspacePath);
    // 未配置 / 未填地址 / 密码无法解密 → 不发任何请求(验收:「未配置同步 → 零请求」)。
    if (!cfg || !cfg.baseUrl || cfg.passwordUndecryptable) return { hasUnknownChanges: false };

    const store = createSyncStateStore({
      dir: join(app.getPath("userData"), "sync-state"),
      workspacePath: normalizeWorkspaceKey(workspacePath),
    });
    const result = await probeRemoteChanges({
      remoteBaseUrl: cfg.baseUrl,
      store,
      createClient: () =>
        createWebdavClient({
          baseUrl: cfg.baseUrl,
          username: cfg.username,
          password: cfg.password,
          trustSelfSignedCert: cfg.trustSelfSignedCert,
          fetch: createSyncFetch({ trustSelfSignedCert: cfg.trustSelfSignedCert }),
        }),
      maxFileSizeBytes: DEFAULT_SYNC_THRESHOLDS.maxFileSizeBytes,
      logger: createSyncLogger(),
    });
    return { hasUnknownChanges: result.hasUnknownChanges };
  } catch {
    // 探测失败 / 配置读取异常 → 静默降级(不显示圆点,不打断启动)。
    return { hasUnknownChanges: false };
  }
}

/**
 * 熔断确认(决议 27):弹主进程原生对话框。返回 true = 用户确认继续删除。
 * 默认按钮为「取消」,用户不主动确认即零删除(引擎侧未确认即 SyncFatalError)。
 */
async function confirmDeletesViaDialog(prompt: Parameters<typeof buildDeleteGuardMessage>[0]): Promise<boolean> {
  const { message, detail, buttons } = buildDeleteGuardMessage(prompt);
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  const opts: Electron.MessageBoxOptions = {
    type: "warning",
    title: "同步删除确认",
    message,
    detail,
    buttons: [...buttons],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  return res.response === 1;
}
