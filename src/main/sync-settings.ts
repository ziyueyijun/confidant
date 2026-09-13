// WebDAV 同步设置与凭据(01b;主进程侧)。两件事:
//   1) 按工作区(归一化绝对路径为键)存放地址/用户名/信任证书开关;
//   2) 密码经 Electron safeStorage(Windows 走 DPAPI)加密后写本机状态文件
//      (`userData/sync-settings.json`)——不进工作区、不进远端、不进任何日志或错误信息。
// 纯逻辑(路径/地址归一化、密码遮蔽、连接结果分类)在 @shared/sync,单测在其同目录。
//
// 密码的读取只发生在主进程内部:渲染层永远拿不到明文,「测试连接」也是把工作区路径
// 交给主进程、由主进程补上已存密码。

import { app, safeStorage } from "electron";
import { join } from "node:path";
import { access, mkdir, readFile } from "node:fs/promises";
import { writeTextFileAtomic } from "../../packages/files";
import { createWebdavClient } from "../../packages/sync/client";
import {
  connectionResultFromError,
  normalizeBaseUrl,
  normalizeWorkspaceKey,
  type CloudEnv,
  type SyncConnectionInput,
  type SyncConnectionResult,
  type SyncSettingsInput,
  type SyncPasswordStatus,
  type SyncSettingsView,
} from "@shared/sync";

/** 单工作区的已存配置(落盘形态)。 */
interface StoredWorkspaceSync {
  baseUrl: string;
  username: string;
  trustSelfSignedCert: boolean;
  /** safeStorage 加密后的 base64;null = 无密码。**绝不写日志**。 */
  passwordCipher: string | null;
}

interface SyncSettingsFileV1 {
  version: 1;
  /** 归一化工作区键(normalizeWorkspaceKey)→ 配置。 */
  workspaces: Record<string, StoredWorkspaceSync>;
}

const FILE_VERSION = 1;

let cached: SyncSettingsFileV1 | null = null;

function settingsPath(): string {
  return join(app.getPath("userData"), "sync-settings.json");
}

async function loadFile(): Promise<SyncSettingsFileV1> {
  if (cached) return cached;
  try {
    const raw = JSON.parse(await readFile(settingsPath(), "utf8")) as Partial<SyncSettingsFileV1>;
    if (raw?.version === FILE_VERSION && raw.workspaces && typeof raw.workspaces === "object") {
      cached = { version: FILE_VERSION, workspaces: raw.workspaces };
    }
  } catch {
    // 首次启动 / 无文件 / 损坏 → 空
  }
  cached ??= { version: FILE_VERSION, workspaces: {} };
  return cached;
}

async function persist(): Promise<void> {
  const file = await loadFile();
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeTextFileAtomic(settingsPath(), JSON.stringify(file, null, 2));
}

/** 明文密码 → safeStorage 密文(base64)。不可用时抛错,绝不退化为明文落盘(决议 42)。 */
function encryptPassword(password: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw Object.assign(new Error("本机安全存储不可用,无法加密保存密码"), {
      code: "SYNC_CRED_UNAVAILABLE",
    });
  }
  return safeStorage.encryptString(password).toString("base64");
}

/** 密文 → 明文;解密失败(换机器、换 Windows 账户)→ null(决议 36:提示重新输入,不静默失败)。 */
function decryptPassword(cipher: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(cipher, "base64"));
  } catch {
    return null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 网盘同步目录启发式所需的环境变量(**只用于提示**,决议 57)。
 * 主进程读环境后随设置视图下发;判定逻辑在渲染层(可单测)。
 */
function readCloudEnv(): CloudEnv {
  return {
    oneDrive: process.env["OneDrive"] ?? null,
    oneDriveConsumer: process.env["OneDriveConsumer"] ?? null,
    oneDriveCommercial: process.env["OneDriveCommercial"] ?? null,
  };
}

/** 某工作区的设置视图(不含密码明文,也不含密文)。 */
export async function readSyncSettingsView(workspacePath: string): Promise<SyncSettingsView> {
  const key = normalizeWorkspaceKey(workspacePath);
  const file = await loadFile();
  const entry = file.workspaces[key] ?? null;

  let passwordStatus: SyncPasswordStatus = "none";
  if (entry?.passwordCipher) {
    passwordStatus = decryptPassword(entry.passwordCipher) === null ? "undecryptable" : "available";
  }

  return {
    workspacePath,
    workspaceKey: key,
    workspaceExists: await pathExists(workspacePath),
    hasSavedConfig: entry !== null,
    baseUrl: entry?.baseUrl ?? "",
    username: entry?.username ?? "",
    trustSelfSignedCert: entry?.trustSelfSignedCert ?? false,
    passwordStatus,
    cloudEnv: readCloudEnv(),
  };
}

/**
 * 保存某工作区的设置。`input.password` 省略 = 保留已存密码;空串 = 清除;非空 = 覆盖。
 * 地址与用户名做归一化后再落盘。
 */
export async function writeSyncSettings(
  workspacePath: string,
  input: SyncSettingsInput,
): Promise<void> {
  const key = normalizeWorkspaceKey(workspacePath);
  const file = await loadFile();
  const prev = file.workspaces[key] ?? null;

  let passwordCipher = prev?.passwordCipher ?? null;
  if (input.password !== undefined) {
    passwordCipher = input.password === "" ? null : encryptPassword(input.password);
  }

  file.workspaces[key] = {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    username: input.username.trim(),
    trustSelfSignedCert: input.trustSelfSignedCert,
    passwordCipher,
  };
  await persist();
}

/** 取某工作区的已存密码明文;无配置 / 解密失败返回空串(只在本模块内用)。 */
async function loadStoredPassword(workspacePath: string | null | undefined): Promise<string> {
  if (!workspacePath) return "";
  const file = await loadFile();
  const entry = file.workspaces[normalizeWorkspaceKey(workspacePath)];
  if (!entry?.passwordCipher) return "";
  return decryptPassword(entry.passwordCipher) ?? "";
}

/**
 * 测试连接:PROPFIND 远端根(depth 1)。
 * 结果分三类——可达(带远端直接子项数,供「远端目录非空」提示)/ 认证失败 / 目录不存在;
 * 其它错误归为 error 且 detail 已遮蔽密码(决议 43、59)。
 * 密码来源:input.password 优先,省略则用已存密码。渲染层不掌握明文。
 *
 * 注:`trustSelfSignedCert` 按 01a 契约透传给客户端;真正的 TLS 接受路径由注入的
 * 传输层承担(v1 走默认 fetch,自签证书的真机验证见票 08)。
 */
export async function testSyncConnection(input: SyncConnectionInput): Promise<SyncConnectionResult> {
  let password = input.password;
  if (password === undefined) password = await loadStoredPassword(input.workspacePath);

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!baseUrl) return { kind: "error", detail: "请先填写远端地址。" };

  const client = createWebdavClient({
    baseUrl,
    username: input.username.trim(),
    password,
    trustSelfSignedCert: input.trustSelfSignedCert,
  });

  try {
    const entries = await client.list("");
    return { kind: "reachable", entryCount: entries.length, detail: "" };
  } catch (err) {
    return connectionResultFromError(err, password);
  }
}
