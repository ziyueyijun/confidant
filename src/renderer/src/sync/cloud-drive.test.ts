// 网盘同步目录启发式测试(01b):环境变量命中 / 路径名命中 / 无关路径不命中。
// 决议 57:结果只用于提示,不参与任何自动决定。

import { describe, expect, it } from "vitest";
import { detectCloudDrive } from "./cloud-drive";
import type { CloudEnv } from "@shared/sync";

const NO_ENV: CloudEnv = { oneDrive: null, oneDriveConsumer: null, oneDriveCommercial: null };

describe("detectCloudDrive", () => {
  it("OneDrive 环境变量命中(大小写/分隔符不敏感)", () => {
    const env: CloudEnv = { ...NO_ENV, oneDrive: "C:\\Users\\me\\OneDrive" };
    const hit = detectCloudDrive("c:/users/me/onedrive/notes", env);
    expect(hit).toMatchObject({ provider: "OneDrive", via: "env" });
    // 与变量根相等也命中
    expect(detectCloudDrive("C:\\Users\\me\\OneDrive", env)?.via).toBe("env");
  });

  it("商业/个人 OneDrive 变量也命中", () => {
    const env: CloudEnv = { ...NO_ENV, oneDriveCommercial: "C:/work/OneDrive - Contoso" };
    expect(detectCloudDrive("C:/work/OneDrive - Contoso/库", env)).toMatchObject({
      provider: "OneDrive",
      via: "env",
    });
  });

  it("环境变量根之外的路径不因子串误命中", () => {
    const env: CloudEnv = { ...NO_ENV, oneDrive: "C:/Users/me/OneDrive" };
    // 「OneDriveBackup」不是变量根的下级
    expect(detectCloudDrive("C:/Users/me/OneDriveBackup/notes", env)).toBeNull();
  });

  it("路径名命中:Dropbox / 坚果云 / 百度网盘", () => {
    expect(detectCloudDrive("D:/Dropbox/notes", NO_ENV)).toMatchObject({ provider: "Dropbox", via: "path" });
    expect(detectCloudDrive("D:/坚果云/笔记", NO_ENV)).toMatchObject({ provider: "坚果云", via: "path" });
    expect(detectCloudDrive("D:/BaiduNetdiskDownload/笔记", NO_ENV)).toBeNull(); // 片段名不等
    expect(detectCloudDrive("D:/BaiduNetdisk/笔记", NO_ENV)).toMatchObject({ provider: "百度网盘" });
  });

  it("无关路径不命中", () => {
    expect(detectCloudDrive("D:/Projects/notes", NO_ENV)).toBeNull();
    expect(detectCloudDrive("", NO_ENV)).toBeNull();
  });
});
