// 地址纯逻辑测试(01b):协议判定与校验;归一化在 @shared/sync 另有测试。

import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, urlScheme, validateBaseUrl } from "./sync-url";

describe("urlScheme", () => {
  it("区分 http / https / 其它,大小写不敏感", () => {
    expect(urlScheme("https://nas:5006/dav")).toBe("https");
    expect(urlScheme("HTTP://nas:5005/dav")).toBe("http");
    expect(urlScheme("nas.local/dav")).toBe("other");
    expect(urlScheme("")).toBe("other");
  });
});

describe("validateBaseUrl", () => {
  it("空地址报错", () => {
    expect(validateBaseUrl("   ")).toBe("请填写远端地址。");
  });

  it("缺协议前缀报错", () => {
    expect(validateBaseUrl("nas.local/dav")).toContain("http://");
  });

  it("合法 http/https 通过", () => {
    expect(validateBaseUrl("https://nas:5006/dav/notes")).toBeNull();
    expect(validateBaseUrl("http://192.168.1.2:5005/dav")).toBeNull();
    expect(validateBaseUrl("https://nas/我的 笔记")).toBeNull();
  });

  it("格式非法报错", () => {
    expect(validateBaseUrl("http://")).not.toBeNull();
  });
});

describe("normalizeBaseUrl(转发自 @shared/sync)", () => {
  it("去尾斜杠与空白", () => {
    expect(normalizeBaseUrl(" https://nas/dav/ ")).toBe("https://nas/dav");
  });
});
