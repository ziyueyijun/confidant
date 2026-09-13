// packages/webfake —— 入口点:内存版假 WebDAV 服务端。
// 挂在真实 http.Server 上;可模拟畸形响应(规格决议 66)。测试与后续票只 import 这里。
// 假服务端只增不减:后续票发现缺行为时补进来,不另起替身。

export { startWebfakeServer } from "./lib/server";
export type {
  WebfakeCredentials,
  WebfakeFileMeta,
  WebfakeFileStat,
  WebfakeOptions,
  WebfakeQuirks,
  WebfakeRequestLogEntry,
  WebfakeServer,
} from "./lib/types";
