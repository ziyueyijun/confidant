# 自研薄 WebDAV 客户端，不使用 `webdav` npm 包

同步所需的 WebDAV 客户端自己实现，只覆盖 `PROPFIND` / `GET` / `PUT` / `DELETE` / `MKCOL` / `MOVE` 六个动词，外加一个小 XML 解析依赖。不使用现成的 `webdav` npm 包（perry-mitchell/webdav-client）。

## Considered Options

- **`webdav` npm 包**：目前最成熟的 Node WebDAV 客户端（v5.10.0，仍在发版）。但它的两个缺陷正好落在本方案的关键路径上——**不支持 `If-Match`**（仓库内搜索零命中，唯一自动发的是 `overwrite: false` 时的 `If-None-Match: *`），以及一个 open 的 High 级缺陷**不解码 XML 实体**（[webdav-client#276](https://github.com/perry-mitchell/webdav-client/issues/276)），文件名含 `&`、`<` 就会解错。它还会把 ETag 的双引号去掉再返回。
- **自己写**：请求用 Node 内置 `fetch`（或 Electron 的 `net.fetch`），只额外引入一个 XML 解析依赖。

## Consequences

- 我们完全掌控 XML 解析、路径编码、条件头这三件事。href → 相对路径的归一化是 WebDAV 客户端 bug 的头号来源，而我们有一手案例证明它的后果有多严重：路径含非 ASCII 时前缀匹配可能永不命中，导致**列举静默清空**——「上传正常、列举为空」，一旦与删除传播相遇就是「本地全删」（见 spec 第 63 条的列举闸门）。把这个环节交给一个我们无法检查、也改不动的黑盒，风险不对称。
- 代价：协议正确性由我们自己负责。这是 spec 第 65–66 条那个内存版假 WebDAV 服务端存在的理由——它必须能模拟多级 `MKCOL` 返 405、对已存在集合返 400、不返回 ETag、XML 实体、列举静默为空这些真实发生过的畸形行为。
- 依赖面保持克制，符合仓库现有的依赖姿态。
