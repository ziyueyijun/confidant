// 同步跨侧纯逻辑测试(01b):工作区键归一化、地址归一化、密码遮蔽、连接结果分类。

import { describe, expect, it } from "vitest";
import {
  connectionResultFromError,
  normalizeBaseUrl,
  normalizeWorkspaceKey,
  redactSecrets,
} from "./sync";

describe("normalizeWorkspaceKey", () => {
  it("大小写不敏感、反斜杠等同正斜杠、去尾分隔符", () => {
    expect(normalizeWorkspaceKey("C:\\Notes\\")).toBe("c:/notes");
    expect(normalizeWorkspaceKey("c:/notes")).toBe("c:/notes");
    expect(normalizeWorkspaceKey("C:/Notes/sub/")).toBe("c:/notes/sub");
    expect(normalizeWorkspaceKey("C:\\Notes")).toBe(normalizeWorkspaceKey("c:/notes/"));
  });

  it("保留中文与空格,只做分隔符与大小写归一", () => {
    expect(normalizeWorkspaceKey("D:\\我的 笔记\\子目录")).toBe("d:/我的 笔记/子目录");
  });

  it("空串与首尾空白", () => {
    expect(normalizeWorkspaceKey("  ")).toBe("");
    expect(normalizeWorkspaceKey("  C:/x  ")).toBe("c:/x");
  });
});

describe("normalizeBaseUrl", () => {
  it("去首尾空白与尾斜杠,保留协议/主机/路径", () => {
    expect(normalizeBaseUrl("  https://nas:5006/dav/notes/  ")).toBe("https://nas:5006/dav/notes");
    expect(normalizeBaseUrl("http://nas:5005/dav")).toBe("http://nas:5005/dav");
    expect(normalizeBaseUrl("https://nas")).toBe("https://nas");
  });

  it("空串原样", () => {
    expect(normalizeBaseUrl("   ")).toBe("");
  });
});

describe("redactSecrets", () => {
  it("原样与 URL 编码两种形态都替换,空 secret 忽略", () => {
    expect(redactSecrets("密码是 p@ss w0rd 哦", ["p@ss w0rd"])).toBe("密码是 *** 哦");
    const encoded = redactSecrets("url=p%40ss%20w0rd", ["p@ss w0rd"]);
    expect(encoded).not.toContain("p%40ss%20w0rd");
    expect(encoded).toContain("***");
    expect(redactSecrets("keep", [null, undefined, ""])).toBe("keep");
  });
});

describe("connectionResultFromError", () => {
  it("auth → 认证失败(detail 为空)", () => {
    const err = Object.assign(new Error("WebDAV PROPFIND https://nas 失败: auth (401)"), {
      kind: "auth",
    });
    expect(connectionResultFromError(err, "topsecret")).toEqual({
      kind: "auth-failed",
      detail: "",
    });
  });

  it("not-found → 目录不存在(detail 为空)", () => {
    const err = Object.assign(new Error("404"), { kind: "not-found" });
    expect(connectionResultFromError(err, "topsecret")).toEqual({
      kind: "not-found",
      detail: "",
    });
  });

  it("其它错误:detail 遮蔽密码,序列化结果也不含密码", () => {
    const password = "s3cr3t-pw";
    const err = Object.assign(
      new Error(`PROPFIND https://nas/dav?u=bob&p=${password} 失败: network`),
      { kind: "network" },
    );
    const res = connectionResultFromError(err, password);
    expect(res.kind).toBe("error");
    expect(res.detail).not.toContain(password);
    expect(res.detail).toContain("***");
    // 决议 43:错误信息与序列化结果里都不含密码
    expect(JSON.stringify(res)).not.toContain(password);
  });

  it("认证失败错误里即便带密码,返回也不含密码", () => {
    const password = "leaky-pw";
    const err = Object.assign(new Error(`basic bob:${password}`), { kind: "auth" });
    expect(JSON.stringify(connectionResultFromError(err, password))).not.toContain(password);
  });
});
