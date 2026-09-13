// 假 WebDAV 服务端:对外的类型契约(入口点 index.ts 转发,测试与后续票按此对接)。

/** Basic 认证凭据;不设则不做任何认证。 */
export interface WebfakeCredentials {
  username: string;
  password: string;
}

/**
 * 畸形/降级行为开关(规格决议 66)。全部默认关闭,即标准 WebDAV 行为。
 * 每个开关对应一个真实发生过的服务端缺陷(见规格 Further Notes)。
 */
export interface WebfakeQuirks {
  /** 中间层不存在的 MKCOL 返 405(标准为 409)。绿联 NAS 行为。 */
  mkcolMultiLevel405?: boolean;
  /** 对已存在集合的 MKCOL 返 400(标准为 405)。绿联 NAS 行为。 */
  mkcolExisting400?: boolean;
  /** PROPFIND 不返回 getetag(Alist 等)。 */
  omitEtag?: boolean;
  /** PROPFIND 成功码 + 空 multistatus(「上传正常、列举为空」缺陷)。 */
  emptyListing?: boolean;
  /** PROPFIND 强制返回的非成功状态码(如 500)。 */
  listingStatus?: number | null;
  /** 认证失败时返回 401 还是 403(默认 401)。 */
  authFailureStatus?: 401 | 403;
  /** 每个请求先延迟 N 毫秒(用于测客户端超时)。 */
  delayMs?: number;
  /** href 不做百分号编码,改用 XML 实体转义(非标准服务端;测 XML 实体解码)。 */
  rawHrefNames?: boolean;
  /**
   * 忽略 If-Match(不支持条件写的服务端)。用于验证「If-Match 尽力而为、绝不作为
   * 正确性保证」:服务端忽略它时结果仍须正确(决议 48,票 03)。
   */
  ignoreIfMatch?: boolean;
}

/** 布置文件时可钉住的元信息(省略则随机验证符 + 当前时间)。 */
export interface WebfakeFileMeta {
  /** 指定验证符原样返回(如强验证符 `"abc"`、弱验证符 `W/"abc"`、无引号 `abc`)。 */
  etag?: string;
  /** 指定 Last-Modified 原样返回(HTTP-date 字符串)。 */
  lastModified?: string;
}

/** 某文件的元信息快照(用于构造「验证符失真」等畸形态前的取样)。 */
export interface WebfakeFileStat {
  etag: string;
  lastModified: string;
  size: number;
}

export interface WebfakeOptions {
  credentials?: WebfakeCredentials | null;
  quirks?: WebfakeQuirks;
  /**
   * HTTPS 模式(票 02):`true` 用内置自签证书夹具;传 `{ cert, key }` 用自定义证书。
   * 默认不启用(明文 http)。自签证书在完整校验下不可连——用于验证「信任此服务器
   * 的证书」开关(决议 41)。
   */
  tls?: boolean | { cert: string; key: string };
}

export interface WebfakeRequestLogEntry {
  method: string;
  /** 已解码的服务端绝对路径(根为 "")。 */
  path: string;
  /** Depth 请求头(无则 null)。 */
  depth: string | null;
  /** If-Match 请求头(无则 null);用于断言条件写形态。 */
  ifMatch?: string | null;
  /** If-None-Match 请求头(无则 null);用于断言创建保护。 */
  ifNoneMatch?: string | null;
}

/** 内存版假 WebDAV 服务端句柄。 */
export interface WebfakeServer {
  /** http://127.0.0.1:<port> */
  readonly url: string;
  readonly port: number;
  /** 已处理请求日志(顺序即请求顺序;用于断言串行/单层建目录)。 */
  readonly requests: WebfakeRequestLogEntry[];
  close(): Promise<void>;
  /**
   * 直接布置/读取内存表(服务端绝对路径,如 "/dav/notes/a.md";根为 "")。
   * 传 meta 可钉住验证符/修改时间,用于构造畸形态(如「验证符不变、内容已变」)。
   */
  putFile(path: string, data: string | Uint8Array, meta?: WebfakeFileMeta): void;
  getFile(path: string): Uint8Array | undefined;
  /** 读取某文件的元信息(etag/lastModified/大小);不存在或为目录返回 undefined。 */
  stat(path: string): WebfakeFileStat | undefined;
  /** 改写某文件的验证符(内容不动),用于构造「验证符失真」。 */
  setEtag(path: string, etag: string): void;
  /** 改写某文件的 Last-Modified(内容不动)。 */
  setLastModified(path: string, lastModified: string): void;
  mkdirp(path: string): void;
  has(path: string): boolean;
  list(): string[];
}
