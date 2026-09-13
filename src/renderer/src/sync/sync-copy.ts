// 同步设置对话框的界面文案判定(01b;纯函数,单测在同目录 sync-copy.test.ts)。
// 每条文案对应规格里的一条决议,注释写明决议号。

import type {
  SyncConnectionResult,
  SyncPasswordStatus,
  SyncSettingsView,
} from "@shared/sync";
import { urlScheme } from "./sync-url";
import type { CloudDriveHit } from "./cloud-drive";

/** 决议 4:远端内容明文,界面必须显示这句话。 */
export const PLAINTEXT_NOTICE = "远端以明文存储,请确认你信任该服务器。";

/** 决议 16:硬排除名单(不可关闭),含「用户自己的点开头目录不会被同步」这句。 */
export const EXCLUSION_NOTICE =
  "同步会跳过所有点开头条目(一次覆盖 .git、.DS_Store 与应用自己的临时文件),以及 Thumbs.db、desktop.ini。" +
  "因此你自己的点开头目录不会被同步。";

/** 决议 41:开启「信任此服务器的证书」时的警告。 */
export const TRUST_CERT_WARNING =
  "已信任此服务器的证书:将接受自签或无效的证书,连接可能被窃听或劫持,只应对你自己的服务器开启。";

/**
 * 决议 40:地址为 http 时提示密码明文过网;https 或非法地址返回 null。
 */
export function httpPasswordWarning(url: string): string | null {
  return urlScheme(url) === "http"
    ? "地址使用 http:用户名与密码会以明文经过网络,建议改用 https。"
    : null;
}

/** 决议 41:自签证书开关默认关闭,开启时给出警告。 */
export function trustCertWarning(enabled: boolean): string | null {
  return enabled ? TRUST_CERT_WARNING : null;
}

/**
 * 决议 30:远端目录非空时的**首次**同步说明,必须写明「不会删除任何文件」。
 * `firstConfig` = 本机第一次为该工作区配置(决议 31);非首次或远端为空返回 null。
 */
export function firstSyncMergeNotice(entryCount: number, firstConfig: boolean): string | null {
  if (!firstConfig || entryCount <= 0) return null;
  return (
    "远端目录已有内容。首次同步会执行保守合并:同名同内容视为已同步,同名不同内容两份都保留," +
    "只在一侧存在的文件补到另一侧。不会删除任何文件。"
  );
}

/** 决议 57:工作区落在网盘同步目录内的提示(只提示,不阻止)。 */
export function cloudDriveNotice(hit: CloudDriveHit | null): string | null {
  if (!hit) return null;
  return (
    `该工作区位于「${hit.provider}」同步目录内。两个同步系统同时改同一批文件可能互相打架,` +
    "建议把工作区放在网盘目录之外。"
  );
}

/** 决议 56:工作区被移动或改名 → 明确提示「未找到该工作区」。 */
export function workspaceStateMessage(view: Pick<SyncSettingsView, "workspacePath" | "workspaceExists">): string | null {
  if (!view.workspacePath) return "尚未打开工作区。请先在「文件」菜单打开文件夹,再配置同步。";
  if (!view.workspaceExists) return "未找到该工作区:它可能已被移动或改名。";
  return null;
}

/** 决议 36:凭据解密失败(换机器、换 Windows 账户)→ 提示重新输入,不静默失败。 */
export function passwordStatusMessage(status: SyncPasswordStatus): string | null {
  return status === "undecryptable"
    ? "已保存的密码无法解密(可能更换了电脑或 Windows 账户),请重新输入密码。"
    : null;
}

export interface ConnectionCopy {
  tone: "ok" | "error";
  text: string;
}

/** 三种测试连接结果(可达 / 认证失败 / 目录不存在)与其它错误的文案判定(决议 59)。 */
export function connectionCopy(result: SyncConnectionResult): ConnectionCopy {
  switch (result.kind) {
    case "reachable": {
      const n = result.entryCount ?? 0;
      return {
        tone: "ok",
        text: n > 0 ? `连接成功:远端目录可达(已有 ${n} 个条目)。` : "连接成功:远端目录可达(当前为空)。",
      };
    }
    case "auth-failed":
      return { tone: "error", text: "认证失败:用户名或密码错误。请核对后重试。" };
    case "not-found":
      return { tone: "error", text: "目录不存在:地址指向的远端目录不存在,请检查地址。" };
    case "error":
      return { tone: "error", text: `连接失败:${result.detail || "未知错误"}` };
  }
}
