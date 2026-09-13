// PROPFIND multistatus 解析(ADR-0003:XML 实体必须正确解码,否则含 `&`、`<`
// 的文件名会解错——webdav-client#276 就是不自研的代价)。

import { XMLParser } from "fast-xml-parser";

export interface DavResponseRaw {
  /** 服务端返回的原始 href(实体已解码;可能仍是百分号编码)。 */
  href: string;
  isCollection: boolean;
  etag: string | null;
  lastModified: string | null;
  size: number | null;
}

type XmlObject = Record<string, unknown>;

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => name === "response" || name.endsWith(":response") || name === "propstat" || name.endsWith(":propstat"),
});

function asObject(v: unknown): XmlObject | null {
  return v !== null && typeof v === "object" ? (v as XmlObject) : null;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const o = asObject(v);
  if (o && typeof o["#text"] === "string") return o["#text"];
  return "";
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

/**
 * 解析 multistatus。非 multistatus / 空 multistatus / 解析失败一律返回空数组。
 * 调用方据「空数组 vs 抛错」区分「列举为空」与「列举失败」(规格决议 63)。
 */
export function parseMultistatus(xml: string): DavResponseRaw[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const ms = asObject(asObject(doc)?.["multistatus"]);
  if (!ms) return [];
  const out: DavResponseRaw[] = [];
  for (const rawResp of toArray(ms["response"])) {
    const r = asObject(rawResp);
    if (!r) continue;
    const href = asText(r["href"]);
    if (!href) continue;
    let isCollection = false;
    let etag: string | null = null;
    let lastModified: string | null = null;
    let size: number | null = null;
    for (const rawPs of toArray(r["propstat"])) {
      const prop = asObject(asObject(rawPs)?.["prop"]);
      if (!prop) continue;
      const rt = asObject(prop["resourcetype"]);
      if (rt && "collection" in rt) isCollection = true;
      if (prop["getetag"] !== undefined && prop["getetag"] !== null) etag = asText(prop["getetag"]);
      if (prop["getlastmodified"] !== undefined && prop["getlastmodified"] !== null) {
        lastModified = asText(prop["getlastmodified"]);
      }
      if (prop["getcontentlength"] !== undefined && prop["getcontentlength"] !== null) {
        const n = Number(asText(prop["getcontentlength"]));
        if (Number.isFinite(n)) size = n;
      }
    }
    out.push({ href, isCollection, etag, lastModified, size });
  }
  return out;
}
