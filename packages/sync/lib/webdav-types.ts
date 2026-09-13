// WebDAV 客户端的公共类型契约(入口点 client.ts 转发)。后续票按此对接。

/** 可注入的传输层;默认全局 fetch。测试指向 webfake 起的真 http.Server。 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WebdavConfig {
  /** 完整远端目录 URL(如 https://nas:5006/dav/notes);可含非 ASCII 与空格。 */
  baseUrl: string;
  username: string;
  password: string;
  /**
   * 信任自签证书(默认 false)。本包不自行处置 TLS——真正接受证书的传输层由
   * 注入的 fetch 承担(Electron 侧将来注入 net.fetch 时消费者在此开关上决策)。
   */
  trustSelfSignedCert?: boolean;
  /** 单请求超时(ms)。默认 30000。 */
  timeoutMs?: number;
  /** 可注入传输层;默认全局 fetch。 */
  fetch?: FetchLike;
}

/** 列目录返回的一条远端条目。 */
export interface WebdavEntry {
  /** 相对 base 的路径(正斜杠;根下第一层为裸名;集合不带尾斜杠)。 */
  relPath: string;
  /** 名字(relPath 最后一段)。 */
  name: string;
  isCollection: boolean;
  /** 服务端返回的验证符原样(含引号);无则 null。只做变化探测,不作内容权威。 */
  etag: string | null;
  /** Last-Modified 原样字符串;无则 null。 */
  lastModified: string | null;
  /** 字节数;集合或无长度时为 null。 */
  size: number | null;
}

export interface WebdavPutOptions {
  /** 带 `If-None-Match: *` 保护创建(目标已存在则服务端回 412)。 */
  createOnly?: boolean;
  /** 尽力而为的 `If-Match`;**绝不作为正确性保证**(服务端支持度参差)。 */
  ifMatch?: string | null;
}

/** 错误分类:认证失败可与其他失败区分(规格决议 59)。 */
export type WebdavErrorKind =
  | "auth" // 401 / 403
  | "not-found" // 404
  | "conflict" // 409
  | "precondition" // 412
  | "timeout" // 请求超时
  | "network" // 传输层抛错
  | "http"; // 其它非 2xx

export class WebdavError extends Error {
  readonly kind: WebdavErrorKind;
  readonly status: number | null;
  readonly method: string;
  readonly url: string;

  constructor(kind: WebdavErrorKind, method: string, url: string, status: number | null, message?: string) {
    super(message ?? `WebDAV ${method} ${url} 失败: ${kind}${status ? ` (${status})` : ""}`);
    this.name = "WebdavError";
    this.kind = kind;
    this.status = status;
    this.method = method;
    this.url = url;
  }
}

/** 六个动词 + 逐级建目录辅助。请求由调用方串行(客户端不做池,规格决议 14)。 */
export interface WebdavClient {
  /** PROPFIND + `Depth: 1`。返回该目录直接子项(不含自身);由调用方逐层遍历。 */
  list(relPath: string): Promise<WebdavEntry[]>;
  /** GET 文件字节(原样,不经过编辑引擎)。 */
  get(relPath: string): Promise<Uint8Array>;
  /** PUT 整个文件;返回服务端验证符(无则 null)。 */
  put(relPath: string, data: Uint8Array, opts?: WebdavPutOptions): Promise<{ etag: string | null }>;
  /** DELETE 文件或集合。 */
  remove(relPath: string): Promise<void>;
  /** MKCOL 单层;201→"created",400/405→"exists"(400 与 405 都当已存在,决议 46)。 */
  mkcol(relPath: string): Promise<"created" | "exists">;
  /** MOVE 改名/移动(带 Destination 头)。 */
  move(fromRelPath: string, toRelPath: string): Promise<void>;
  /** 逐级建目录,一次一层(对已存在的层不报错)。 */
  ensureDir(relPath: string): Promise<void>;
}
