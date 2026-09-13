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
}

export interface WebfakeOptions {
  credentials?: WebfakeCredentials | null;
  quirks?: WebfakeQuirks;
}

export interface WebfakeRequestLogEntry {
  method: string;
  /** 已解码的服务端绝对路径(根为 "")。 */
  path: string;
  /** Depth 请求头(无则 null)。 */
  depth: string | null;
}

/** 内存版假 WebDAV 服务端句柄。 */
export interface WebfakeServer {
  /** http://127.0.0.1:<port> */
  readonly url: string;
  readonly port: number;
  /** 已处理请求日志(顺序即请求顺序;用于断言串行/单层建目录)。 */
  readonly requests: WebfakeRequestLogEntry[];
  close(): Promise<void>;
  /** 直接布置/读取内存表(服务端绝对路径,如 "/dav/notes/a.md";根为 "")。 */
  putFile(path: string, data: string | Uint8Array): void;
  getFile(path: string): Uint8Array | undefined;
  mkdirp(path: string): void;
  has(path: string): boolean;
  list(): string[];
}
