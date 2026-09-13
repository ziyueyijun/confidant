// 远端变更探测(决议 35)。本模块只回答一个问题:**远端条目是否「疑似已变」,
// 需要下载并算内容 hash 确认?**
//
// 判定规则:验证符(ETag)、修改时间、大小**任一不同**即「疑似已变」;三者都
// 无从证明「相同」时才算「未变」(正常跳过,零传输)。
//
// 红线:**本函数绝不回答「内容是否相同」**——内容是否相同只能由 SHA-256 内容
// hash 判定(决议 35)。验证符在真实服务端有已知失真(规格 Further Notes):
//   · Nextcloud(SabreDAV)同一秒内覆盖文件验证符不变;
//   · 内容未变验证符仍会变化;
//   · Apache mod_deflate 改写验证符;
//   · Alist 集合根本不返回验证符;
//   · rclone 的验证符由修改时间与大小拼出。
// 因此验证符只做「变化探测」,绝不作「内容相同」的结论——只看验证符就跳过一次
// 下载确认,就是静默丢内容。
//
// 验证符一律按**不透明字符串**处理:含引号、弱验证符(`W/"..."`)都不解析语义、
// 不做去引号归一化;服务端在两次同步之间改变了引号形态(如去引号),也会被当作
// 「不同」而触发一次下载确认——取保守侧,绝不漏内容。

import type { WebdavEntry } from "./webdav-types";
import type { SyncFileRecord } from "./sync-types";

/**
 * 远端条目相对状态表基准是否「疑似已变」。true ⇒ 调用方必须下载内容并算 hash:
 * hash 相同则只更新状态表(不写盘);hash 不同才写盘(决议 35)。
 */
export function remoteEntryChanged(record: SyncFileRecord, entry: WebdavEntry): boolean {
  return (
    fieldChanged(record.etag, entry.etag) ||
    fieldChanged(record.remoteModified, entry.lastModified) ||
    fieldChanged(record.remoteSize, entry.size)
  );
}

/**
 * 单字段判定:
 * - 两侧都为 null:无从比较 → 不算变(如 Alist 从不返回验证符,自动退化到另两个字段);
 * - 恰一侧为 null:记录里有而远端丢了、或反之 → 算变(无法确认相同,取保守侧);
 * - 两侧都有值:不同即算变(验证符按不透明字符串原样比较)。
 */
function fieldChanged<T>(stored: T | null, current: T | null): boolean {
  if (stored === null && current === null) return false;
  if (stored === null || current === null) return true;
  return stored !== current;
}
