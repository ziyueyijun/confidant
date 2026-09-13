// @vitest-environment node
// 远端变更探测判定矩阵(决议 35):纯函数逐字段穷举。
// 只经入口点 import(dep-cruiser:测试不得触包内部)。
//
// 本文件证明的命题:**判定只回答「疑似已变 / 需不需要下载确认」,绝不回答
// 「内容是否相同」**;且验证符一律按不透明字符串处理。

import { describe, expect, it } from "vitest";
import { remoteEntryChanged, type SyncFileRecord } from "../index";
import type { WebdavEntry } from "../client";

function entry(over: Partial<WebdavEntry> = {}): WebdavEntry {
  return {
    relPath: "a.md",
    name: "a.md",
    isCollection: false,
    etag: '"E1"',
    lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
    size: 3,
    ...over,
  };
}

function record(over: Partial<SyncFileRecord> = {}): SyncFileRecord {
  return {
    relPath: "a.md",
    baseHash: "hash",
    etag: '"E1"',
    remoteModified: "Mon, 01 Jan 2024 00:00:00 GMT",
    remoteSize: 3,
    ...over,
  };
}

describe("remoteEntryChanged:三个信号任一不同 ⇒ 疑似已变", () => {
  it("三者全等 → 未变(false,正常跳过)", () => {
    expect(remoteEntryChanged(record(), entry())).toBe(false);
  });

  it("仅验证符不同 → 变", () => {
    expect(remoteEntryChanged(record(), entry({ etag: '"E2"' }))).toBe(true);
  });

  it("仅修改时间不同 → 变", () => {
    expect(remoteEntryChanged(record(), entry({ lastModified: "Tue, 02 Jan 2024 00:00:00 GMT" }))).toBe(true);
  });

  it("仅大小不同 → 变", () => {
    expect(remoteEntryChanged(record(), entry({ size: 4 }))).toBe(true);
  });

  it("验证符与大小都不同 → 变", () => {
    expect(remoteEntryChanged(record(), entry({ etag: '"E2"', size: 4 }))).toBe(true);
  });
});

describe("remoteEntryChanged:字段缺失(null)的处理", () => {
  it("验证符两侧都 null(Alist)→ 该字段不参与,靠时间与大小判定", () => {
    const rec = record({ etag: null });
    // 时间与大小也一致 → 未变
    expect(remoteEntryChanged(rec, entry({ etag: null }))).toBe(false);
    // 大小变了 → 变
    expect(remoteEntryChanged(rec, entry({ etag: null, size: 4 }))).toBe(true);
  });

  it("记录有验证符、远端为 null → 变(无法确认相同,取保守侧)", () => {
    expect(remoteEntryChanged(record(), entry({ etag: null }))).toBe(true);
  });

  it("记录验证符为 null、远端有 → 变(取保守侧)", () => {
    expect(remoteEntryChanged(record({ etag: null }), entry())).toBe(true);
  });

  it("三个字段两侧全 null → 未变(没有任何可比信号)", () => {
    const rec = record({ etag: null, remoteModified: null, remoteSize: null });
    expect(remoteEntryChanged(rec, entry({ etag: null, lastModified: null, size: null }))).toBe(false);
  });

  it("记录缺大小、远端有大小 → 变", () => {
    expect(remoteEntryChanged(record({ remoteSize: null }), entry())).toBe(true);
  });
});

describe("remoteEntryChanged:验证符按不透明字符串处理", () => {
  it("弱验证符原样相等 → 未变", () => {
    const rec = record({ etag: 'W/"abc"' });
    expect(remoteEntryChanged(rec, entry({ etag: 'W/"abc"' }))).toBe(false);
  });

  it("弱验证符与同名强验证符 → 变(不解析 W/ 语义)", () => {
    expect(remoteEntryChanged(record({ etag: 'W/"abc"' }), entry({ etag: '"abc"' }))).toBe(true);
  });

  it("引号形态变化(服务端去引号)→ 变(不做去引号归一化)", () => {
    expect(remoteEntryChanged(record({ etag: '"abc"' }), entry({ etag: "abc" }))).toBe(true);
    expect(remoteEntryChanged(record({ etag: "abc" }), entry({ etag: '"abc"' }))).toBe(true);
  });
});
