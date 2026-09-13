// 假服务端的 XML 输出辅助:转义与文档包装(最小,只够本包响应使用)。

/** XML 文本节点转义(与 fast-xml-parser 的实体解码互为往返)。 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function xmlDocument(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>${body}`;
}
