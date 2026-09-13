// 界面文案判定测试(01b):三种连接结果、http/https 警告、自签证书开关、
// 首次合并说明、工作区缺失、解密失败提示。

import { describe, expect, it } from "vitest";
import {
  connectionCopy,
  cloudDriveNotice,
  firstSyncMergeNotice,
  httpPasswordWarning,
  passwordStatusMessage,
  trustCertWarning,
  workspaceStateMessage,
  EXCLUSION_NOTICE,
  PLAINTEXT_NOTICE,
} from "./sync-copy";

describe("connectionCopy(可达 / 认证失败 / 目录不存在)", () => {
  it("可达:带条目数/空目录两种文案,均为 ok", () => {
    const nonEmpty = connectionCopy({ kind: "reachable", entryCount: 3, detail: "" });
    expect(nonEmpty.tone).toBe("ok");
    expect(nonEmpty.text).toContain("3");
    const empty = connectionCopy({ kind: "reachable", entryCount: 0, detail: "" });
    expect(empty.tone).toBe("ok");
    expect(empty.text).toContain("为空");
  });

  it("认证失败:明确写出用户名或密码错误", () => {
    const c = connectionCopy({ kind: "auth-failed", detail: "" });
    expect(c.tone).toBe("error");
    expect(c.text).toContain("用户名或密码错误");
  });

  it("目录不存在:明确写出目录不存在", () => {
    const c = connectionCopy({ kind: "not-found", detail: "" });
    expect(c.tone).toBe("error");
    expect(c.text).toContain("目录不存在");
  });

  it("其它错误:带上已遮蔽的 detail", () => {
    const c = connectionCopy({ kind: "error", detail: "网络失败: timeout" });
    expect(c.tone).toBe("error");
    expect(c.text).toContain("timeout");
    expect(connectionCopy({ kind: "error", detail: "" }).text).toContain("未知错误");
  });
});

describe("http/https 警告开关", () => {
  it("http 出现密码明文过网警告,https 消失", () => {
    expect(httpPasswordWarning("http://nas:5005/dav")).toContain("明文");
    expect(httpPasswordWarning("https://nas:5006/dav")).toBeNull();
    expect(httpPasswordWarning("")).toBeNull();
  });
});

describe("自签证书开关", () => {
  it("默认关闭无警告,开启时出现警告", () => {
    expect(trustCertWarning(false)).toBeNull();
    expect(trustCertWarning(true)).toContain("证书");
  });
});

describe("首次同步保守合并说明(决议 30)", () => {
  it("首次配置且远端非空 → 说明里明确「不会删除任何文件」", () => {
    const notice = firstSyncMergeNotice(5, true);
    expect(notice).toContain("不会删除任何文件");
    expect(notice).toContain("保守合并");
  });

  it("非首次配置、或远端为空 → 不出现", () => {
    expect(firstSyncMergeNotice(5, false)).toBeNull();
    expect(firstSyncMergeNotice(0, true)).toBeNull();
  });
});

describe("工作区状态提示(决议 56)", () => {
  it("无工作区 → 空态提示", () => {
    expect(workspaceStateMessage({ workspacePath: "", workspaceExists: false })).toContain("尚未打开工作区");
  });

  it("工作区被移动/改名 → 未找到该工作区", () => {
    expect(workspaceStateMessage({ workspacePath: "C:/gone", workspaceExists: false })).toContain(
      "未找到该工作区",
    );
  });

  it("正常时无提示", () => {
    expect(workspaceStateMessage({ workspacePath: "C:/notes", workspaceExists: true })).toBeNull();
  });
});

describe("解密失败提示(决议 36)", () => {
  it("undecryptable → 提示重新输入;none/available 无提示", () => {
    expect(passwordStatusMessage("undecryptable")).toContain("重新输入密码");
    expect(passwordStatusMessage("none")).toBeNull();
    expect(passwordStatusMessage("available")).toBeNull();
  });
});

describe("固定说明文案", () => {
  it("明文说明含「明文存储」与「信任」", () => {
    expect(PLAINTEXT_NOTICE).toContain("明文");
    expect(PLAINTEXT_NOTICE).toContain("信任该服务器");
  });

  it("排除名单说明覆盖点开头、Thumbs.db、desktop.ini 与点开头目录", () => {
    expect(EXCLUSION_NOTICE).toContain("点开头");
    expect(EXCLUSION_NOTICE).toContain("Thumbs.db");
    expect(EXCLUSION_NOTICE).toContain("desktop.ini");
    expect(EXCLUSION_NOTICE).toContain("点开头目录不会被同步");
  });
});

describe("网盘提示", () => {
  it("命中时给出提示且不阻止;未命中无提示", () => {
    expect(cloudDriveNotice({ provider: "OneDrive", via: "env", matched: "c:/users/me/onedrive" })).toContain(
      "OneDrive",
    );
    expect(cloudDriveNotice(null)).toBeNull();
  });
});
