// 网盘同步目录启发式(01b;决议 57)。**只用于提示,不参与任何自动决定。**
// OneDrive 读环境变量(主进程随设置视图下发);其余按路径名判断。
// 纯函数,单测在同目录 cloud-drive.test.ts。

import type { CloudEnv } from "@shared/sync";

export interface CloudDriveHit {
  /** 提供方展示名(OneDrive / Dropbox / …)。 */
  provider: string;
  /** 命中方式:环境变量 / 路径名。 */
  via: "env" | "path";
  /** 命中的路径片段(供文案/排障)。 */
  matched: string;
}

/** 路径名启发式表(片段全小写比较)。 */
const PATH_PROVIDERS: ReadonlyArray<{ provider: string; names: readonly string[] }> = [
  { provider: "OneDrive", names: ["onedrive"] },
  { provider: "Dropbox", names: ["dropbox", "dropbox (personal)", "dropbox (business)"] },
  { provider: "Google Drive", names: ["google drive", "googledrive", "我的云端硬盘"] },
  { provider: "iCloud Drive", names: ["icloud drive", "icloud云盘"] },
  { provider: "坚果云", names: ["nutstore", "坚果云"] },
  { provider: "百度网盘", names: ["baidunetdisk", "百度网盘"] },
  { provider: "微云", names: ["weiyun", "微云"] },
];

function norm(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** workspace 是否位于 root 之下(含相等)。 */
function isUnder(workspace: string, root: string): boolean {
  const r = norm(root);
  if (!r) return false;
  return workspace === r || workspace.startsWith(`${r}/`);
}

/**
 * 检测工作区是否落在常见网盘同步目录内。命中返回描述,否则 null。
 * 结果**只用于提示**(是否给用户一句提醒),调用方不得据此阻止或改变同步行为。
 */
export function detectCloudDrive(workspacePath: string, env: CloudEnv): CloudDriveHit | null {
  const ws = norm(workspacePath);
  if (!ws) return null;

  // 1) 环境变量优先(OneDrive 三种变量;都归为 OneDrive 展示)
  const fromEnv: ReadonlyArray<string | null> = [env.oneDrive, env.oneDriveCommercial, env.oneDriveConsumer];
  for (const root of fromEnv) {
    if (root && isUnder(ws, root)) {
      return { provider: "OneDrive", via: "env", matched: norm(root) };
    }
  }

  // 2) 路径名启发式:任一目录片段命中
  for (const seg of ws.split("/")) {
    if (!seg) continue;
    for (const p of PATH_PROVIDERS) {
      if (p.names.includes(seg)) return { provider: p.provider, via: "path", matched: seg };
    }
  }
  return null;
}
