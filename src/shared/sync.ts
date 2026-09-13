// WebDAV 同步的跨侧**纯逻辑与类型**(主进程与渲染层共用;与 ipc.ts 解耦,
// 本文件不反向依赖 ipc.ts,也不依赖 Electron/网络)。
// 这里只放可单测的纯函数,单测在同目录 sync.test.ts。
//
// 分流原则(票 01b 分层):跨进程都要用的纯逻辑(路径/地址归一化、密码遮蔽、
// 连接结果分类)放这里;只在渲染层用的界面文案判定与网盘启发式放
// src/renderer/src/sync/。

import type { SyncProgress, SyncReport } from "../../packages/sync";

// ─── 同步运行(票 02:主进程执行 → 渲染层展示进度与结果) ────────────────────

/** 进行中的进度(主进程 → 渲染层推送;形状即引擎的 SyncProgress)。 */
export type { SyncProgress };

/** 一次同步的最终结果(经 IPC 返回渲染层)。 */
export interface SyncOutcome {
  status: "ok" | "cancelled" | "error";
  /** ok / cancelled 时的计数报告。 */
  report?: SyncReport;
  /** error 时的摘要(**已遮蔽密码**,决议 43/60)。 */
  message?: string;
}

// ─── 配置归一化 ──────────────────────────────────────────────────────────

/**
 * 工作区路径 → 同步配置表 / 状态表的键。
 *
 * Windows 路径大小写不敏感、反斜杠与正斜杠等价,故统一为**小写 + 正斜杠 +
 * 去尾分隔符**。主进程把工作区绝对路径交给状态表/配置表之前**必须先过此函数**
 * (工程简报 §2.5:`C:\Notes` 与 `c:\notes` 若不一致,状态表会判为「键不符 →
 * 无状态表 → 保守合并」,状态表看起来「没生效」而不丢内容)。
 */
export function normalizeWorkspaceKey(workspacePath: string): string {
  return workspacePath.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** 远端地址归一化:去首尾空白、去尾斜杠(保留协议、主机与路径)。空串原样返回。 */
export function normalizeBaseUrl(url: string): string {
  const t = url.trim();
  if (!t) return "";
  return t.replace(/\/+$/, "");
}

// ─── 密码遮蔽(决议 43:日志与错误信息中密码必须遮蔽) ──────────────────────

const REDACTED = "***";

/**
 * 把 `text` 中出现的每个 secret(**原样与 URL 编码两种形态**)替换为 `***`。
 * 空 / null secret 忽略。用于任何可能进入日志、错误信息或 IPC 返回值的字符串。
 */
export function redactSecrets(text: string, secrets: Array<string | null | undefined>): string {
  let out = text;
  for (const s of secrets) {
    if (!s) continue;
    const variants = new Set<string>([s]);
    try {
      variants.add(encodeURIComponent(s));
    } catch {
      // 编码失败(极端非法字符)忽略,原样已覆盖
    }
    for (const v of variants) {
      if (v.length > 0) out = out.split(v).join(REDACTED);
    }
  }
  return out;
}

// ─── 连接结果分类(决定「可达 / 认证失败 / 目录不存在 / 其它错误」) ─────────

export type SyncConnectionKind = "reachable" | "auth-failed" | "not-found" | "error";

export interface SyncConnectionResult {
  kind: SyncConnectionKind;
  /** 可达时的远端直接子项数(供「远端目录非空」提示,决议 30);非可达时缺省。 */
  entryCount?: number;
  /** 错误详情(**已遮蔽密码**,决议 43);auth-failed / not-found 时为空串。 */
  detail: string;
}

/**
 * 把 01a 客户端抛出的错误(依 `WebdavError.kind`)归类为连接结果,并遮蔽 detail 里的密码。
 * 认证失败与目录不存在单独归类(决议 59:认证失败要能单独识别)。
 * `kind` 取字符串比较,故本函数不依赖 packages/sync 的类型。
 */
export function connectionResultFromError(err: unknown, password?: string | null): SyncConnectionResult {
  const e = err as { kind?: string; message?: string } | null;
  const kind = e?.kind ?? "";
  if (kind === "auth") return { kind: "auth-failed", detail: "" };
  if (kind === "not-found") return { kind: "not-found", detail: "" };
  const raw = e?.message ?? String(err);
  return { kind: "error", detail: redactSecrets(raw, [password]) };
}

// ─── 设置视图 / 输入类型(经 IPC 传递;密码只出渲染层、只进主进程,绝不回传) ──

/** 已存凭据的可解密状态。 */
export type SyncPasswordStatus = "none" | "available" | "undecryptable";

/** 网盘同步目录启发式所需的环境变量(渲染层只用于提示,决议 57)。 */
export interface CloudEnv {
  oneDrive: string | null;
  oneDriveConsumer: string | null;
  oneDriveCommercial: string | null;
}

/** 主进程 → 渲染层:某工作区的同步设置只读视图。**不含密码明文,也不含密文**。 */
export interface SyncSettingsView {
  workspacePath: string;
  /** 归一化后的键(normalizeWorkspaceKey);仅作展示/排障。 */
  workspaceKey: string;
  /** 工作区当前是否存在(决议 56:被移动或改名 → false)。 */
  workspaceExists: boolean;
  /** 本工作区是否已存过配置(用于「首次配置」判定,决议 31)。 */
  hasSavedConfig: boolean;
  baseUrl: string;
  username: string;
  trustSelfSignedCert: boolean;
  passwordStatus: SyncPasswordStatus;
  cloudEnv: CloudEnv;
}

/** 渲染层 → 主进程:保存设置。 */
export interface SyncSettingsInput {
  baseUrl: string;
  username: string;
  /** 省略 = 保留已存密码;空串 = 清除;非空 = 覆盖。 */
  password?: string;
  trustSelfSignedCert: boolean;
}

/** 渲染层 → 主进程:「测试连接」(可复用已存密码,渲染层不掌握明文)。 */
export interface SyncConnectionInput {
  workspacePath?: string | null;
  baseUrl: string;
  username: string;
  /** 省略 = 用已存密码尝试。 */
  password?: string;
  trustSelfSignedCert: boolean;
}
