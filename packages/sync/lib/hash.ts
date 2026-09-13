// 内容 hash(决议 35:内容 hash 才是权威,远端验证符只做变化探测)。

import { createHash } from "node:crypto";

/** 字节内容的 SHA-256 十六进制摘要。 */
export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
