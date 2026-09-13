// multistatus XML 解析:实体解码(& / <)、无 ETag、空 multistatus、命名空间前缀。

import { describe, expect, it } from "vitest";
import { parseMultistatus } from "../client";

const DOC = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/notes/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop>
      <D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/notes/a&amp;b&lt;c.md</D:href>
    <D:propstat><D:prop>
      <D:resourcetype/>
      <D:getcontentlength>12</D:getcontentlength>
      <D:getetag>"abc123"</D:getetag>
      <D:getlastmodified>Mon, 14 Sep 2026 10:00:00 GMT</D:getlastmodified>
    </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
</D:multistatus>`;

describe("parseMultistatus", () => {
  it("解码 XML 实体,并读出集合标记 / 长度 / 验证符 / 修改时间", () => {
    const out = parseMultistatus(DOC);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ href: "/dav/notes/", isCollection: true, size: null });
    expect(out[1]).toMatchObject({
      href: "/dav/notes/a&b<c.md",
      isCollection: false,
      size: 12,
      etag: '"abc123"',
      lastModified: "Mon, 14 Sep 2026 10:00:00 GMT",
    });
  });

  it("无 getetag 的响应 etag 为 null", () => {
    const xml = `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response>
      <D:href>/dav/notes/a.md</D:href>
      <D:propstat><D:prop><D:resourcetype/><D:getcontentlength>3</D:getcontentlength></D:prop>
      <D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`;
    const out = parseMultistatus(xml);
    expect(out[0]!.etag).toBeNull();
    expect(out[0]!.size).toBe(3);
  });

  it("空 multistatus / 非 multistatus / 垃圾输入均返回空数组(不抛)", () => {
    expect(parseMultistatus(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"></D:multistatus>`)).toEqual([]);
    expect(parseMultistatus(`<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"/>`)).toEqual([]);
    expect(parseMultistatus("<html>nope</html>")).toEqual([]);
    expect(parseMultistatus("")).toEqual([]);
  });

  it("不带命名空间前缀的响应也能解析", () => {
    const xml = `<multistatus xmlns="DAV:"><response><href>/dav/a.md</href>
      <propstat><prop><resourcetype/><D:getetag xmlns:D="DAV:">"z"</D:getetag></prop>
      <status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`;
    const out = parseMultistatus(xml);
    expect(out[0]!.href).toBe("/dav/a.md");
    expect(out[0]!.etag).toBe('"z"');
  });
});
