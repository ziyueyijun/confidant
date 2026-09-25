# WebDAV 同步的技术事实

> 本文件是 wayfinder 票 [#2](https://github.com/ziyueyijun/confidant/issues/2) 的产物，供票 [#3](https://github.com/ziyueyijun/confidant/issues/3)「WebDAV 同步的冲突处理策略」决策。
>
> 它只记录**查证过的事实**与**明确标注的推断**，不做决策。决策在 issue 上，术语在 `CONTEXT.md`。事实基座的前半部分（Electron、编辑器内核、中文检索）见 `0001-技术事实基础.md`，本文件不重复。
>
> 调研日期：2026-09-25。
>
> **方法说明**：标注**已实测**的结论由本次调研在本机运行代码或发出网络请求得到，可复现。标注**源码级**的结论来自阅读项目仓库源码原文。标注**推断**的是本报告的判断，非一手来源。凡公开来源中确实不存在的，列入 §9「未确证事项」，**不要在未重新调研前当成事实引用**。

---

## 0. 一句话结论

**票面第 1 问的假设（「只能 PROPFIND 拉全量 + getlastmodified 比对」）在标准层面是错的，在工程层面是对的。**

标准层面存在一个**专门解决这个问题的标准**：RFC 6578（WebDAV Collection Synchronization），定义了 `DAV:sync-collection` REPORT + `DAV:sync-token`，服务端维护变更日志，客户端带着 token 问「自我上次离开后变了什么」。它 2012 年就是 Standards Track。

但**没有任何主流文件型 WebDAV 服务端实现它**。sabre/dav（Nextcloud / ownCloud 的底座）的文件实现不实现它；Nextcloud 文件目录不实现它；我实测的 iCloud 端点里只有 CardDAV 有它、CalDAV 没有、文件端点根本不存在。它是为 CalDAV/CardDAV 这类**条目数少、变更稀疏、服务端本来就存全量历史**的资源设计的，不是为几千个文件的目录树设计的。

所以工程现实就是票面描述的那样：**PROPFIND 拉全量 + 属性比对**。并且比对能用的属性比票面预想的更弱——见 §1.3。

---

## 1. WebDAV 的并发控制能力

### 1.1 `ETag` / `If-Match` 能做乐观锁 —— 标准支持，语义明确

RFC 4918（WebDAV，2007，Standards Track）的定位很明确：

> §8.6：`ETags are necessary along with locks to avoid the lost-update problem.`
> §8.6：`ETags are required for the client to be able to distinguish this case. Otherwise, the client is forced to ask the user whether to overwrite the resource on the server without even being able to tell the user if it has changed. **Timestamps do not solve this problem nearly as well as ETags.**`
> §7.2：`HTTP 1.1 clients can be good citizens, avoiding overwriting other clients' changes, by using entity tags in If-Match headers with any requests that would modify resources.`
> §8.6：`Strong ETags are much more useful for authoring use cases than weak ETags ... weak ETags have certain restrictions in HTTP, e.g., these cannot be used in If-Match headers.`

即 **ETag + `If-Match` 是本标准明确设计的乐观锁机制**，而且是唯一被明确推荐的机制（胜过时间戳）。失败时返回 `412 Precondition Failed`（§12.1）。

RFC 4918 还定义了 `If` 头（§10.4），它能表达 `If-Match` 表达不了的形式（`Not`、多个 state list 的 or 关系），且同时承载 ETag 和锁 token。

### 1.2 ETag 的**存在性**是弱保证 —— 这是关键

RFC 4918 §15.6 对 `DAV:getetag` 的定义：

> `The getetag property MUST be defined on any DAV-compliant resource **that returns the Etag header**.`

即**条件式 MUST**：服务端只要不返回 `Etag` 响应头，就完全不必提供 `getetag` 属性。RFC 4918 **没有任何条款要求服务端必须生成 ETag**。

对照 `DAV:getcontentlength`（§15.4）的措辞完全不同：

> `The DAV:getcontentlength property MUST be defined on any DAV-compliant resource that returns the Content-Length header in response to a GET.`

`getcontentlength` 的可靠性同样来自「几乎必然返回 Content-Length」这个工程事实，而不是规范强制。**已实测**：`getcontentlength` 在 remotely-save 的 WebDAV 实现里被用作核心判定字段（`sizeRaw`/`sizeEnc`，见 §4.3），说明实践中它是可靠的。

而 `DAV:creationdate` 官方明确禁止用于同步：

> §15.1：`Some servers allow DAV:creationdate to be changed to reflect the time the document was created if that is more meaningful to the user (rather than the time it was uploaded). Thus, **clients SHOULD NOT use this property in synchronization logic (use DAV:getetag instead)**.`

**ETag 稳定性是 SHOULD，不是 MUST**：

> §8.6：`Because clients may be forced to prompt users or throw away changed content if the ETag changes, a WebDAV server **SHOULD NOT** change the ETag (or the Last-Modified time) for a resource that has an unchanged body and location. The ETag represents the state of the body or contents of the resource. **There is no similar way to tell if properties have changed.**`

只约束了「不应当变」，没有保证「内容变了就一定变」。（正确的方向由 §8.8 给出：`For any given URL, an 'ETag' value MUST NOT be reused for different representations returned by GET.` —— 这是**防重放**约束，不是**防漏检**约束。）

同一节末段还有一条对同步设计非常不利的坦白：

> §8.6：`Note that the meaning of an ETag in a PUT response is not clearly defined either in this document or in RFC 2616 (i.e., whether the ETag means that the resource is octet-for-octet equivalent to the body of the PUT request, or whether the server could have made minor changes in the formatting or content of the document upon storage). This is an HTTP issue, not purely a WebDAV issue.`

**即 PUT 之后拿到的 ETag 不保证等于「服务端存的就是你刚发的那串字节」**——服务端可能在存储时做了修改。对纯 Markdown 来说，这意味着「上传后立刻回读验证」不能靠 ETag 比对，得真的 GET 一次比对内容。

### 1.3 比票面预想更弱：**ETag 在真实 WebDAV 客户端里几乎没人用**

这是本次调研最反直觉的发现。所有被检查的现成实现都**只读 `getlastmodified`，不读 `getetag`**：

**Joplin 的 WebDAV 驱动**（`packages/lib/file-api-driver-webdav.js`，源码级）：

```js
let lastModifiedString = null;
try {
    lastModifiedString = this.api().resourcePropByName(resource, 'string', 'd:getlastmodified');
} catch (error) { ... }
// Note: Not all WebDAV servers return a getlastmodified date (eg. Seafile, which doesn't return the
// property for folders) so we can only throw an error if it's a file.
if (!lastModifiedString && !isDir) throw new Error(`Could not get lastModified date for resource: ...`);
const lastModifiedDate = lastModifiedString ? new Date(lastModifiedString) : new Date();
if (isNaN(lastModifiedDate.getTime())) throw new Error(`Invalid date: ${lastModifiedString}`);

return { path: path, updated_time: lastModifiedDate.getTime(), isDir: isDir };
```

驱动里 `getetag` 一次都没出现。它读 `d:resourcetype`（判目录）和 `d:getlastmodified`（取时间），**不读 `getetag`、不读 `getcontentlength`**。

**remotely-save 的 WebDAV 实现**（`src/fsWebdav.ts`，源码级）：

```ts
const fromWebdavItemToEntity = (x: FileStat, remoteBaseDir: string): Entity => {
  let key = getNormPath(x.filename, remoteBaseDir);
  if (x.type === "directory" && !key.endsWith("/")) { key = `${key}/`; }
  const mtimeSvr = Date.parse(x.lastmod).valueOf();
  return {
    key, keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeSvr, // TODO: no universal way to set mtime in webdav
    size: x.size, sizeRaw: x.size,
  };
};
```

它用的是 `x.lastmod` 和 `x.size`。`Entity` 类型里**留了 `etag?: string` 字段，但没有任何代码填它或读它**——是个预留的坑。

它底层的 `webdav-client`（perry-mitchell）**确实会解析 `getetag`**（`source/types.ts` 的 `FileStat.etag: string | null`，`source/tools/dav.ts` 里 `getetag: etag = null`），所以取 ETag 在库层面是现成的；只是**上层同步算法没用它**。

**Joplin 的一手经验**（`packages/lib/Synchronizer.ts` 注释，源码级）：

```
// Note: in order to know the real updated_time value, we need to load the content. In theory we could
// rely on the file timestamp (in remote.updated_time) but in practice it's not accurate enough and
// can lead to conflicts (for example when the file timestamp is slightly ahead of its real
// updated_time). updated_time is set and managed by clients so it's always accurate.
```

**这是「WebDAV 文件时间戳不可靠」的一手证据，来自一个真实运营了多年的同步实现。**

### 1.4 服务端确实有「变更日志」标准 —— RFC 6578 —— 但文件集合没人实现

**RFC 6578, "Collection Synchronization for Web Distributed Authoring and Versioning (WebDAV)"**，2012-03，Standards Track，作者 Cameron Daboo（**Apple Inc.**）与 Arnaud Quillaud（Oracle）。

核心机制：

- 客户端对集合发 `DAV:sync-collection` REPORT（§3.2）。
- 请求带一个 `DAV:sync-token`，是服务端在上次响应里给的不透明字符串；服务端返回「自那个 token 以来的增删改」。
- 用 `DAV:sync-level` 指定范围（§3.3）：`1` = 直接子项，`infinite` = 全深度递归。
- `DAV:sync-token` 同时可以当普通属性取（§4）。

**关键限制一：服务端只维护有限历史。**

> §3.1：`In some cases, a server might only wish to maintain a limited amount of history about changes to a collection. In that situation, it will return an error to the client when the client presents a token that is "out of date". At that point, **the client has to fall back to synchronizing the entire collection by re-running the report request using an empty token value**.`

即「增量」是**尽力而为**，随时可能被打回全量。

**关键限制二：Depth 必须为 0。**

> §3.3：`Servers MUST support only Depth:0 behavior with the DAV:sync-collection report, i.e., the report targets only the collection being synchronized in a single request.`

深度靠 `sync-level` 表达，而且 `infinite` 要求子集合**自己**也支持 sync-collection，不支持的要逐个子集合单独发：

> §3.3：`Note that when a server supports a DAV:sync-level XML element with a value of "infinite", it might not be possible to synchronize some child collections ... the server MUST include a DAV:response element for the child collection with status 403 (Forbidden).`

**关键限制三：规范不引入新的 DAV compliance class。** RFC 6578 全文没提 DAV 头或 compliance class（**已核对**：`grep -i "DAV header|compliance"` 于 RFC 6578 全文，零命中）。发现只能靠 `DAV:supported-report-set` 属性或直接试。

### 1.5 实现度：**只有 CalDAV/CardDAV 有，文件没有**（源码级 + 已实测）

**sabre/dav**（Nextcloud、ownCloud、Nextcloud 系的自建服务端的底座）的实现：

- 有 `Sabre\DAV\Sync\Plugin`（`lib/DAV/Sync/Plugin.php`），注册 `{DAV:}sync-collection` REPORT。
- 但它只对实现 `Sabre\DAV\Sync\ISyncCollection` 接口的集合生效：

```php
public function syncCollection($uri, SyncCollectionReport $report) {
    $node = $this->server->tree->getNodeForPath($uri);
    if (!$node instanceof ISyncCollection) {
        throw new DAV\Exception\ReportNotSupported('The {DAV:}sync-collection REPORT is not supported on this url.');
    }
    ...
}
public function getSupportedReportSet($uri): array {
    $node = $this->server->tree->getNodeForPath($uri);
    if ($node instanceof ISyncCollection && $node->getSyncToken()) {
        return ['{DAV:}sync-collection'];
    }
    return [];
}
```

- **sabre/dav 仓库内实现 `ISyncCollection` 的类只有两个**（**已核对**，GitHub 代码搜索 `repo:sabre-io/dav` → `lib/CalDAV/Calendar.php`、`lib/CardDAV/AddressBook.php`）。文件系统节点不实现。

**Nextcloud**：

- `apps/dav/lib/Server.php` 确实注册了插件：`$this->server->addPlugin(new \Sabre\DAV\Sync\Plugin());`
- 但**文件目录节点不实现接口**。`apps/dav/lib/Connector/Sabre/Directory.php`：

```php
class Directory extends Node implements
	\Sabre\DAV\ICollection,
	\Sabre\DAV\IQuota,
	\Sabre\DAV\IMoveTarget,
	\Sabre\DAV\ICopyTarget,
	INodeByPath {
```

**没有 `ISyncCollection`。** 代码搜索 `repo:nextcloud/server ISyncCollection` 返回 **0** 条（**已核对**）；`getSyncToken` 只出现在 CalDAV 与 federation 相关文件里（**已核对**）。

**ownCloud**：同样。`apps/dav/lib/Connector/Sabre/Directory.php` 是 `implements ICollection, IQuota, IMoveTarget`，代码搜索 `repo:owncloud/core ISyncCollection` 返回 **0** 条。

**iCloud（已实测，本机 `OPTIONS` 请求）**：

| 端点 | 结果 |
|---|---|
| `https://caldav.icloud.com/` | `200`，`DAV: 1, access-control, calendar-access, calendar-schedule, ...`（**无** `sync-collection`，CalDAV 用自己的 REPORT） |
| `https://contacts.icloud.com/` | `200`，`DAV: 1, 2, access-control, addressbook, addressbook-proxy, extended-mkcol, **sync-collection**` |
| `https://webdav.icloud.com/` | 连接失败 |
| `https://files.icloud.com/` | 连接失败 |
| `https://p01-webdav.icloud.com/` | 连接失败 |
| `https://p01-files.icloud.com/` | 连接失败 |
| `https://drive.icloud.com/` | `200` 但 `Content-Type: text/html`、返回 iCloud.com 的网页（带 CSP `frame-ancestors 'self' *.icloud.com`），是前端页面不是 WebDAV 端点 |

**结论：`sync-collection` 在 iCloud 上是 CardDAV 独有的。文件（iCloud Drive）没有 WebDAV 端点。**

### 1.6 结论：变更日志在文件场景事实上不存在，代价是「全量 PROPFIND + 属性比对」

**查证到的事实**：标准有（RFC 6578），实现没有（Nextcloud / ownCloud / sabre / iCloud 文件侧全都不是 `ISyncCollection`）。

**代价**（推断 + 已实测的机制约束）：

1. **每次同步必须遍历整个目录树**，对每个目录发一次 PROPFIND（`Depth: 1`；`Depth: infinity` 常被禁，见 §2.2）。
2. **请求数与目录数成正比，与变更数无关**。「什么都没改」和「改了 10 篇」的代价一样。
3. **坚果云上这直接撞频率上限**（§2.1：免费版 600 次 / 30 分钟）。目录数一旦超过几百个，一轮全量扫描就吃掉大半配额。
4. **响应体是下载流量**，撞坚果云的流量配额（§2.1）。这是比请求数更硬的墙——见 §2.3 的量化。

---

## 2. 坚果云的实际限制

### 2.1 官方数字（一手，官方帮助中心）

来源：[坚果云第三方应用授权WebDAV开启方法](https://help.jianguoyun.com/?p=2064)，原文摘录：

> **访问频率**：`免费版用户限制访问频率为每30分钟不超过600次请求。`
> `付费用户限制访问频率为每30分钟不超过1500次请求。`
> 理由：`由于WebDAV协议比较占用系统资源`
>
> **上传大小**：`文件上传大小限制：当前 WebDAV 客户端和网页端上传大小的限制是一致的，默认为 500M（私有云可以通过相关设置调整）。`
>
> **单次请求数量**：`目前坚果云的WebDAV协议单次请求文件数（包含文件和文件夹）为750个，支持分多页多次加载。`
>
> **分页警告**：`如果您使用WebDAV的三方工具未实现按分页多次加载，可能会出现文件同步不完整的情况，建议您使用坚果云客户端进行直接同步。`

**流量配额**（定价页 [jianguoyun.com/s/pricing](https://www.jianguoyun.com/s/pricing)，本机抓取页面文本）：

| | 免费版 | 专业版 | 高级专业版 |
|---|---|---|---|
| 空间 | `受限于上传流量` | 30 GB（年付 42 GB） | 72 GB（年付 96 GB） |
| 可上传 | **`1 GB / 月`** | 30 GB 空间；半年及以上加享 1 GB/月 | 72 GB 空间；半年及以上加享 2 GB/月 |
| 可下载 | **`3 GB / 月`** | 同左述加享 | — |
| 文件历史版本 | 1 个月内 | 3 个月内 | 3 个月内 |

**注意**：这是**账号级总配额**，不是 WebDAV 专属；坚果云客户端与 WebDAV 共享同一份流量。**「可上传 1 GB/月、可下载 3 GB/月」是免费版最硬的天花板。**

### 2.2 被报告过的兼容性问题（源码级证据）

**remotely-save 在源码里对坚果云做了四处硬编码特判**（`src/fsWebdav.ts`，源码级）——这是目前能找到的最强的第三方实测证据：

**特判一：坚果云不支持 `Depth: infinity` 的 PROPFIND，强制改走 BFS。**

```ts
if (
  this.webdavConfig.depth === "auto" || ... ||
  this.webdavConfig.depth === "manual_1" ||
  this.webdavConfig.address.includes("jianguoyun.com") ||
  this.webdavConfig.address.includes("teracloud.jp")
) {
  // the remote doesn't support infinity propfind,
  // we need to do a bfs here
  const q = new Queue([`/${this.remoteBaseDir}`]);
  const CHUNK_SIZE = 10;
  ...
```

注意 `teracloud.jp` 与坚果云并列，且 `depth: "auto_*"` 在初始化时被**无条件降级**为 `manual_1`：

```ts
if (this.webdavConfig.depth === "auto" || ... "auto_infinity" || "auto_unknown") {
  this.webdavConfig.depth = "manual_1";
  this.webdavConfig.manualRecursive = true;
  ...
}
```

且 walk 分支的条件里带注释 `/* don't trust auto now */` ——**「不要相信自动探测」**。

**特判二：单目录超过 749 项直接抛错终止同步。**

```ts
if (
  this.webdavConfig.address.includes("jianguoyun.com") &&
  r4.length >= 749
) {
  // https://help.jianguoyun.com/?p=2064
  // no more than 750 per request
  throw Error(
    `出错：坚果云 api 有限制，文件列表加载不全。终止同步！`
  );
}
```

这段紧跟着官方文档 URL 和 `no more than 750 per request` 的注释。**它选择的是抛错而不是分页**——说明分页在这个客户端里没有实现，与官方文档的警告（§2.1）完全对应。

**特判三：`isNextcloud` / partial upload 的探测**（与坚果云无关，但反映了服务端碎片化）：

```ts
// taken from https://github.com/perry-mitchell/webdav-client/blob/master/source/operations/partialUpdateFileContents.ts
if (compliance.server.includes("Apache") &&
    compliance.compliance.includes("<http://apache.org/dav/propset/fs/1>")) {
  this.supportApachePartial = true;
}
if (compliance.compliance.includes("sabredav-partialupdate")) {
  this.supportSabrePartial = true;
}
```

**特判四：Digest auth 与递归 PROPFIND 不兼容。**

```ts
// the sync algorithm should do recursive manually already.
// if we set recursive: true here, Digest auth will return some error inside the PROPFIND
await this.client.createDirectory(key, { recursive: false });
```

**其他已报告的问题**（remotely-save issue 区，第三方二手）：

- [#1182](https://github.com/remotely-save/remotely-save/issues/1182)（2026-08-09，**open**）：Obsidian 1.13.4 + `dav.jianguoyun.com`，同步 `返回 503，0 文件上传`。
- [#1070](https://github.com/remotely-save/remotely-save/issues/1070)（**open**）：NextCloud WebDAV，同步完成后报 `URI malformed`。
- [#663](https://github.com/remotely-save/remotely-save/issues/663)（closed）：**NextCloud 会把 tab 缩进改写成空格**——`- Text\n\t![[Image]]` 变成 `- Text ![[Image]]`，导致「即使没有任何修改也会产生大量 diffs」。这是**服务端改写文件内容**的直接证据，与 RFC 4918 §8.6 关于「PUT 的 ETag 语义不明确、服务端可能修改存储内容」的坦白互相印证。
- [#445](https://github.com/remotely-save/remotely-save/issues/445)：Digest auth 配置不生效，报 401。
- [#17](https://github.com/remotely-save/remotely-save/issues/17)：Nginx WebDAV `403 with depth infinity`——引用了 nginx 源码里 RFC 4918 §9.1.1 的 `propfind-finite-depth` 注释，**这是「拒绝 infinity」的标准做法**。
- [#190](https://github.com/remotely-save/remotely-save/issues/190)：WebDAV 502，只同步了文件夹没同步文件。
- README 自述：自动同步与保存时同步模式下，错误 `"fail silently"`——**错误静默会掩盖冲突**。

remotely-save 的 README 还为坚果云单列了一篇教程（`JianGuoYun/NutStore`），说明它是被支持的目标之一，但如上所述靠的是特判。

### 2.3 「几千个小 Markdown 文件」做 PROPFIND 全量扫描：可行性与代价

**已实测约束**：单次 PROPFIND 最多返回 750 项（官方数字）。**推断的量化模型**：

设库有 N 个文件、D 个目录（不含根）。一次全量扫描需要：

- **请求数**：`D` 次 PROPFIND（每次 `Depth: 1`）。BFS 每层可以并行，remotely-save 用 `CHUNK_SIZE = 10` 并发。

| 场景 | 目录数 D | 请求数 | 免费版（600/30min）一轮占比 |
|---|---|---|---|
| 平坦（全部在根目录） | 0–1 | 1（+ 分页：⌈N/750⌉） | 0.2% |
| 每目录 50 文件，N=3000 | 60 | 60 | 10% |
| 每目录 10 文件，N=3000 | 300 | 300 | **50%** |
| 每天记一个文件、按月分目录，N=3000 | ~110 | 110 | 18% |

**请求数通常不是最先撞墙的**——除非库的目录结构非常碎（每目录 <10 文件），600 次配额对「每 30 分钟一轮」是够的（没人会 30 分钟同步一次全量）。

**流量才是。** PROPFIND 的响应体计入下载流量（3 GB/月，免费版）。每个 `<response>` 元素含 href + resourcetype + getlastmodified + getcontentlength + getetag，保守估计 400–600 字节。**推断**：

| N | 响应体估算（500 B/项） | 免费版 3 GB/月能跑多少轮 |
|---|---|---|
| 1000 | ~0.5 MB | ~6000 轮 |
| 3000 | ~1.5 MB | ~2000 轮 |
| 10000 | ~5 MB | ~600 轮 |
| 50000 | ~25 MB | ~120 轮 |

**所以 PROPFIND 全量扫描本身在流量上完全可行**（每天同步几次，一年也用不掉几 GB）。

**真正的流量风险在「同步动作」而不在「扫描」**：

- **每台机器都要下载全部内容至少一次**（初始同步）。一个含附件的库若有 2 GB 附件，**免费版 3 GB/月的下载配额一次初始同步就爆**，且要连续上传 1 GB（超出上传配额，需跨月）。
- **附件是流量的主项，Markdown 正文不是**。3000 篇 2 KB 的笔记总计仅 6 MB，可以忽略。但 `assets/` 单目录（#1 已定的立场）会以时间戳命名堆成大目录——**这对 §2.2 特判二的 750 项上限是直接威胁**：附件数超过 750 就单次 PROPFIND 拿不全。
- 注意 #1 已定「附件与正文分离」(`assets/`)，且 `.confidant/trash/` 也在库内——**两者都会被 PROPFIND 扫到**。

**推断的设计含义**：把「一轮全量扫描的请求数和响应字节数」当成一个需要监控的量。可行做法是**用目录自身的 ETag / getlastmodified 做剪枝**——这不是标准保证的，但见 §3.1 的 Nextcloud 源码证据，它是**真实存在的服务端行为**，值得一试（但要写成「探测到有用才用」而不是「假定有用」）。

---

## 3. 其他服务端差异

### 3.1 Nextcloud 的 ETag 语义（源码级）

**文件的 ETag 是 `md5(mtime . ino . dev . size)`。** `lib/private/Files/Storage/Local.php`：

```php
private function calculateEtag(string $path, array $stat): string|false {
    if ($stat['mode'] & 0x4000 && !($stat['mode'] & 0x8000)) { // is_dir & not socket
        return parent::getETag($path);
    } else {
        if ($stat === false) { return md5(''); }
        $toHash = '';
        if (isset($stat['mtime'])) { $toHash .= $stat['mtime']; }
        if (isset($stat['ino'])) { $toHash .= $stat['ino']; }
        if (isset($stat['dev'])) { $toHash .= $stat['dev']; }
        if (isset($stat['size'])) { $toHash .= $stat['size']; }
        return md5($toHash);
    }
}
```

**推断的语义**：

- **内容变 → size 变或 mtime 变 → ETag 变。** 正常路径下是可靠的变更哨兵。
- **只 touch 不改内容 → ETag 变**（mtime 参与哈希）。这会**产生假阳性**（「文件变了」实际没变），对同步是安全方向（多同步一次而已），不丢数据。
- **理论上「内容变了但 size 和 mtime 都不变」→ ETag 不变**。极端罕见（等同长度改写且能伪造 mtime），实际不构成风险。
- **rename / move**：`Local.php` 的 `rename()` 是 `copy + remove`（跨存储时），`MoveFromCacheTrait` 处理缓存迁移。ETag 由 inode 参与，**move 到同存储通常会换 inode 或至少重算** → **ETag 会变**。这是「重命名一个文件 → 同步器认为它变了」的根源（对同步安全的假阳性，但会让重命名产生额外的传输）。

**目录的 ETag 是随机 `uniqid()`**（`lib/private/Files/Cache/Propagator.php`）：

```php
$parentHashes = array_map('md5', $parents);
sort($parentHashes); // Ensure rows are always locked in the same order
$etag = uniqid(); // since we give all folders the same etag we don't ask the storage for the etag

$builder->update('filecache')
    ->set('mtime', $builder->func()->greatest('mtime', ...))
    ->where(...);
if (!$this->storage->instanceOfStorage(IReliableEtagStorage::class)) {
    $builder->set('etag', $builder->createNamedParameter($etag, IQueryBuilder::PARAM_STR));
}
```

**每有一个子项变化 → 所有祖先目录的 ETag 都被重新生成为随机值。** `propagateChange` 的名字就说明了这一点。

**推断的用处**：这个「目录 ETag 会随子树变化而变」的行为，**语义上恰好等价于 Git 的 tree hash**（只是它是个不透明随机串，不是内容哈希）。它是做剪枝的理想信号：

> 「根目录 ETag 没变 → 整棵树没变 → 跳过本轮扫描」

**但这不是标准保证的**，Nextcloud 自己也没把它写成同步契约。所以**推断的正确用法**是：把它当优化，检测到就启用，检测不到就退回全量。绝不能把它当正确性依据。

**注意这条与 remotely-save 的保守态度冲突**——remotely-save 甚至不敢信自动探测的 `Depth`，注释写着 `/* don't trust auto now */`。

**Nextcloud 的外部修改**：官方文档明确说 server 的 data 目录 `exclusive to Nextcloud and must not be modified manually`，否则 `undetected changes from database caching`（[排障文档](https://docs.nextcloud.com/server/latest/admin_manual/issues/general_troubleshooting.html)）。**这不影响本项目**——本项目的「外部编辑器改文件」是在**本地磁盘**改，改完由应用通过 WebDAV PUT 上传，走的是正常路径。

### 3.2 Nextcloud 的其他怪癖

- **`OC-Etag` / `OC-FileId` 响应头**：`On creation, move and copy, the response contain the etag of the file.`（[官方 WebDAV 文档](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/basic.html)）。`oc:fileid` 是 `The unique id for the file within the instance`，`oc:id` 是 `The fileid namespaced by the instance id. Globally unique.`。
  - **`fileid` 是稳定寻址的理想材料**（改名/移动不变），比 URL 稳定。**推断**：如果要跟踪「同一篇笔记被改名」，服务端 fileid 比路径可靠；但它不是标准的、canonical 名字可能在别处。
- **`nc:metadata_etag`** 是独立的一个：`An etag covering the file's metadata. Changes when metadata (not content), is updated.` ——**证明确实存在「内容没变但 ETag 变」的独立通路**（元数据变更），进一步说明 ETag 对「内容是否变化」是**有假阳性**的信号。
- **官方文档不给「内容 ETag 何时变」的规则**（**已核对**：该页只给属性和头，不给变更规则），也没有「列出某时间后的变更」的 API。唯一的批量查询机制是 `REPORT`，示例是 favorites 过滤（`oc:filter-rules` / `oc:favorite`），**不是时间戳 feed**。
- **分块上传**用独立端点 `<server>/remote.php/dav/uploads/<userid>`。remotely-save 专门为它写了一个方法 `_getnextcloudUploadServerAddress()`，并检测 `sabredav-partialupdate` 能力。

### 3.3 ownCloud 与 Nextcloud 的差异

- **ownCloud 的冲突文件不带用户名，Nextcloud 带**（源码级对比）：
  - ownCloud `src/common/utility.cpp`：`conflictMarker = " (conflicted copy "` + `dt.toString("yyyy-MM-dd hhmmss")` + `")"`
  - Nextcloud `src/common/utility.cpp`：中间插了 `conflictMarker += userName + ' '`，并为此把用户名里的 `(` `)` 替换成 `_`（`// Don't allow parens in the user name, to ensure we can find the beginning and end of the conflict tag.`）
  - 两家的 `isConflictFile` 都认两个模式：旧式 `_conflict-` 和新式 `(conflicted copy`。**新文件统一用新式**。
- **rclone 的 vendor 差异表**（[rclone.org/webdav](https://rclone.org/webdav/)）反映的碎片化：
  - `nextcloud` / `owncloud` / `owncloud-infinite-scale` / `sharepoint` / `sharepoint-ntlm` 是五个独立 vendor。
  - `ownCloud supports modified times using the X-OC-Mtime header.` ——**修改时间靠私有 header 设置**，标准 WebDAV 没有这个能力（见 §4.3 的 `TODO: no universal way to set mtime in webdav`）。
  - `Nextcloud initially did not support streaming of files (rcat) whereas ownCloud did`（2020-11-27 后修复）。
  - 有 `--webdav-nextcloud-chunk-size` 这种 vendor 专属开关。
  - ownCloud/Nextcloud 支持 SHA1 / MD5 哈希查询（`Depending on the exact version of ownCloud or Nextcloud hashes may differ`）——**这是难得的「内容哈希」能力**，可用来避免下载整文件做比对。需实测确认。

### 3.4 Synology

**未确证**。Synology 的 Knowledge Center 页面在本机抓取时只返回导航外壳（正文由 JS 渲染），没能取到一手的技术细节。公开可确认的只有 remotely-save 的 README 列了 Synology 的配置教程、issue [#1040](https://github.com/remotely-save/remotely-save/issues/1040) 报告了「同地址 RaiDrive 能挂载但插件识别不了 / 换 http 就成功」（**疑似 TLS 证书问题**，非协议问题）。

**推断**：DSM 的 WebDAV Server 是自研实现（不是 sabre），**不应假定它支持 `sync-collection`**；应假定它和坚果云、Teracloud 一样**不支持 `Depth: infinity`**（remotely-save 把所有 `auto_*` 都降级为 `manual_1` 的理由）。需要实测才能确认。

### 3.5 iCloud 是否支持 WebDAV

**票面的理解正确：不支持（就文件而言）。**

**已实测**（本机对端点发 `OPTIONS`）：

- `caldav.icloud.com` → `200`，`DAV: 1, access-control, calendar-access, ...` → **CalDAV 存在**。
- `contacts.icloud.com` → `200`，`DAV: 1, 2, access-control, addressbook, addressbook-proxy, extended-mkcol, sync-collection` → **CardDAV 存在**（且**是这三类资源里唯一暴露 `sync-collection` 的**，正好印证 §1.5 的结论：RFC 6578 是为这类资源造的）。
- `webdav.icloud.com` / `files.icloud.com` / `p01-webdav.icloud.com` / `p01-files.icloud.com` / `p01-ccme.icloud.com` → **全部连接失败**（DNS 无记录或拒绝连接）。
- `drive.icloud.com` → `200` 但 `Content-Type: text/html` + CSP 头 + `X-Frame-Options: SAMEORIGIN`，是 iCloud.com 的**网页前端**，不是 WebDAV 端点。

**即：iCloud 提供 CalDAV（日历）与 CardDAV（通讯录），不提供面向文件的 WebDAV。** 想把 iCloud Drive 当 WebDAV 后端在技术上不可行。（Apple 官方文档以其一贯风格不列「不支持」清单，所以这是「实测证伪」而非「文档确认」——但连不上就是连不上。）

**附带价值**：`contacts.icloud.com` 的 DAV 头里 `sync-collection` 的存在，是 §1.5 结论的一个干净反例证据——**说明「WebDAV 有变更日志标准」是真的、可用，只是恰好不用在文件上。**

---

## 4. 现有应用怎么做同步与冲突（重点）

### 4.1 Obsidian Sync（官方文档）

来源：[Obsidian Help → Sync → Troubleshoot](https://obsidian.md/help/sync/troubleshoot)（`help.obsidian.md` 301 到此）。

**策略（按文件类型分）**：

| 类型 | 策略 | 原文 |
|---|---|---|
| Markdown | **Google diff-match-patch 合并** | `Obsidian Sync merges the changes using Google's diff-match-patch algorithm.` |
| 其他（含 Canvas） | **last modified wins** | `For all other files, including canvases, Obsidian uses a "last modified wins" approach.` / `The most recently modified version replaces earlier versions.` |
| 设置 / 插件设置 JSON | 键级合并 | `Obsidian Sync merges the JSON files` / `It applies keys from the local JSON on top of the remote JSON.` |

**用户可选（Obsidian 1.9.7+，Settings → Sync → Conflict resolution）**：

- `Automatically merge`（**默认**）：把两台设备的变化合进一个文件，保留全部编辑，但**可能产生重复文本或格式问题**，需手工修（原文提到 `duplicate text or formatting problems` / `fix these manually`）。
- `Create conflict file`：`creates a separate conflict file instead of merging automatically`，让用户 `review both versions and merge them yourself`。

**关键缺陷（原文）**：`Conflict resolution settings are device-specific.` / `You must configure your preferred option on each of your devices.` ——**配置不跨设备同步**。

**冲突以什么形式呈现**：

- 文件命名：`original-note-name (Conflicted copy device-name YYYYMMDDHHMM).md`
- 实例：`Meeting notes (Conflicted copy MyMacBook2 202411281430).md`
- `The conflict file contains the changes from the device where the conflict was detected.` / `The original file keeps the remote version.`
- 发现方式：查 Sync log，过滤 `Merge Conflicts` 或搜 `Conflict`。另注：启动时创建的笔记可能不走合并，`Sync will keep the remote version without merging the two.`

**注意一个容易误读的点**：官方口径用 `Google's diff-match-patch`（**字符级** 2 路 diff/patch 库，不是三方合并库，没有 base 概念），但对非 Markdown 是 last-modified-wins。**官方文档没有说明它如何取得 base**——如果它真的是纯 2 路 diff-match-patch，那它其实是在做「两版本文本交织」（§5.1 的 `twoWayMerge` 同类做法），而不是真正的三方合并。这是公开文档的**空白**。

### 4.2 Obsidian remotely-save 插件（源码级）

来源：[github.com/remotely-save/remotely-save](https://github.com/remotely-save/remotely-save)，支持 WebDAV / S3 / Dropbox / OneDrive / Google Drive / Box / pCloud / Yandex / Azure Blob。

#### 4.2.1 冲突策略

**免费版：二选一，必须用户手工选**（README）：

- `keep_newer`（**默认**）——`保留最后修改的版本（默认）`
- `keep_larger`——`保留文件体积较大的版本`

设置页文案（`src/langs/zh_cn.json`，源码级）：

```json
"settings_conflictaction": "处理冲突",
"settings_conflictaction_desc": "如果一个文件，在本地和服务器都被创建或者修改了，那么这就是一个"冲突"情况。如何处理？这个设置只在双向同步时候生效。",
"settings_conflictaction_keep_newer": "保留最后修改的版本（默认）",
"settings_conflictaction_keep_larger": "保留文件体积较大的版本",
```

README 对免费版的描述：`Basic Conflict Detection And Handling`，`can detect conflicts, but users have to choose to keep newer version or larger version of the files.`

**付费版（PRO）：加 `Smart Conflict`（智能冲突）** —— `merge small markdown files, or duplicate large markdown files or any-size non-markdown files.`

#### 4.2.2 Smart Conflict 的实际逻辑（源码级）

**可合并的判定**（`pro/src/baseTypesPro.ts` + `pro/src/conflictLogic.ts`）：

```ts
export const MERGABLE_SIZE = 1000 * 1000; // 1 MB

export function isMergable(a: Entity, b?: Entity) {
  if (b !== undefined && a.key !== b.key) { return false; }
  return (
    !a.key!.endsWith("/") &&
    a.sizeRaw <= MERGABLE_SIZE &&
    (a.key!.endsWith(".md") || a.key!.endsWith(".markdown"))
  );
}
```

**只用 `node-diff3`，且按行切分**：

```ts
function mergeDigInModified(a: string, o: string, b: string) {
  const { conflict, result } = mergeDigIn(a, o, b, {
    stringSeparator: /\n/,     // ← 关键：按行，不是默认的按空白
  });
  for (let index = 0; index < result.length; ++index) {
    if (["<<<<<<<", "=======", ">>>>>>>"].includes(result[index])) {
      result[index] = "`" + result[index] + "`";    // ← 把冲突标记包进反引号
    }
  }
  return { conflict, result };
}
```

**有 base 走三方合并，无 base 走「用 LCS 伪造 base」的伪三方合并**：

```ts
/**
 * It's tricky. We find LCS then pretend it's the original text
 */
export function twoWayMerge(a: string, b: string): string {
  ...
  const c = getLCSText(a, b);       // 最长公共子序列当作 base
  const d = mergeDigInModified(a, c, b).result.join("\n");
  return d;
}

/** Originally three way merge. */
export function threeWayMerge(a: string, b: string, orig: string) {
  return mergeDigInModified(a, orig, b).result.join("\n");
}
```

`mergeFile` 只在两边内容**逐字节不同**时才合并（`if (isEqual(contentLeft, contentRight)) { newArrayBuffer = contentLeft; }`），并且**先写远端再写本地**（`// left (local) must wait for the right / because the mtime might be different after upload / upload firstly`）。

**不可合并时：复制而不是覆盖**（`pro/src/conflictLogic.ts`）：

```ts
export function getFileRenameForDup(key: string) {
  ...
  // name = "aaa.bbb" normally
  segsPath[segsPath.length - 1] = `${segsName[0]}.dup.${segsName[1]}`;
  ...
}
```

即 `笔记.md` → `笔记.dup.md`（`.dup` 插在最后一段扩展名之前）。清理工具 `pro/src/clearDupFiles.ts` 会找含 `dup` 的路径。

`tryDuplicateFile` 里还有一条**内容比对短路**：`if the same, update local but not upload`——如果下载下来发现内容其实一样，就只更新本地元数据、不重传。

**判定核心：完全靠 mtime + size，不用 ETag**（`pro/src/sync.ts`，源码级）：

```ts
const localEqualPrevSync =
  prevSync?.mtimeCli === local.mtimeCli &&
  prevSync?.sizeEnc === local.sizeEnc;
const remoteEqualPrevSync =
  (prevSync?.mtimeSvr === remote.mtimeCli ||
    prevSync?.mtimeSvr === remote.mtimeSvr) &&
  prevSync?.sizeEnc === remote.sizeEnc;

if (localEqualPrevSync && !remoteEqualPrevSync) {
  // 只有本地等于上次 → 远端变了 → pull
} else if (!localEqualPrevSync && remoteEqualPrevSync) {
  // 只有远端等于上次 → 本地变了 → push
} else if (!localEqualPrevSync && !remoteEqualPrevSync) {
  // 两边都不等于上次（或 prevSync 不存在）→ 冲突
  ...
}
```

**这段是整个插件的同步正确性核心，也是它最脆弱的地方**：

- `prevSync === undefined` 与「两边都变了」**判定结果相同**（源码注释：`If both compare False (Didn't exist means both are new. Both exist but don't compare means both are modified)`）。**即：丢失 prevSync 的状态，就等同于「所有文件都冲突」**——这是 §8 要正面处理的问题。
- `remoteEqualPrevSync` 里 `prevSync?.mtimeSvr === remote.mtimeCli || prevSync?.mtimeSvr === remote.mtimeSvr` 是一个 **兼容性 hack**（两种字段都试），说明作者对 mtime 的可比性没有把握。
- **整个判定不含内容哈希**。`Entity` 里有 `hash?: string` 字段但同步判定不用它。

**冲突时还有一个「目录级豁免」**：`conflictAction === "smart_conflict" && key.startsWith(`${configDir}/`)` 会退化为 `keep_newer`——**即配置目录不做智能合并**（`.obsidian/` 下的文件只按时间取新）。这与 #1 里 `共识 2：配置与用户内容必须物理分离` 一致。

#### 4.2.3 同步状态存在哪里

**本地 IndexedDB（localforage）**，`src/localdb.ts`（源码级）：

```ts
export const DEFAULT_TBL_PREV_SYNC_RECORDS = "prevsyncrecords";
export const DEFAULT_TBL_FILE_CONTENT_HISTORY = "filecontenthistory";

export const upsertPrevSyncRecordByVaultAndProfile = async (
  db: InternalDBs, vaultRandomID: string, profileID: string, prevSync: Entity
) => {
  await db.prevSyncRecordsTbl.setItem(
    `${vaultRandomID}\t${profileID}\t${prevSync.key}`,
    prevSync
  );
};
```

**每条记录就是上次同步时那个文件的 `Entity`**（`mtimeCli` / `mtimeSvr` / `size` / `sizeEnc` / `keyRaw` / `mtimeCliFmt` …）。key 是 `vaultRandomID \t profileID \t path`。

**v3 起不上传任何元数据到远端**（`docs/sync_algorithm/v3/intro.md`，源码级）：

> `meta data: no remote meta data any more`

`src/metadataOnRemote.ts` 里的 `_remotely-save-metadata-on-remote.json` 是 **v2 遗留**（文件顶部 readme 文案：`Do NOT edit or delete the file manually. This file is for the plugin remotely-save to store some necessary meta data on the remote services. Its content is slightly obfuscated.`），v3 不再写。

**`filecontenthistory` 存的是上一次的完整文件内容**——这是 Smart Conflict 的 base 来源（`getFileContentHistoryByVaultAndProfile` → `threeWayMerge` 的第三个参数）。**这意味着一份完整的历史副本，在 IndexedDB 里，体积等于库的大小。**

#### 4.2.4 已知问题与设计取舍

- **错误静默**（README）：自动同步与保存时同步模式下错误 `fail silently`。
- **算法文档自己承认未定**（`docs/sync_algorithm/v3/intro.md` 全文只有 14 行 bullet，且 `design.md` 是 2024-01-17 的草图）：四种冲突策略并列列出（`keep newer` / `keep larger` / `keep both and rename` / `show warning`），**没说如何选择**。`design.md` 用「决策分支编号表」（`(16/17/18/19/20) conflict`）描述，分支号只有在源码里才能对上。
- **删除保护是必须项**（`design.md`：`deletion protection (blocking) with a setting`）——**说明误删是真实发生过的问题**。
- **`conflict rename` 在 design.md 里被标为 nice-to-have 而不是 must-have**，尽管源码里已经实现了 `getFileRenameForDup`。
- **v3 要求所有设备同步升级**（`src/langs/zh_cn.json`：`我理解，我需要在所有设备上都更新此插件使之正常运行。`）。
- WebDAV 侧的具体 bug 见 §2.2。

### 4.3 Joplin（源码级，最完整的一套）

#### 4.3.1 判定：比「远端 updated_time」与「本地上次同步时间」

`packages/lib/Synchronizer.ts`（源码级）：

```ts
if (remoteContent.updated_time > local.sync_time) {
    // Local has been modified too => conflict
    action = getConflictType(local);
}
```

**注意这不是比较两个 `updated_time`，而是拿「远端时间」与「本地上次成功同步的时间」比。** `sync_time` 是**本地**记录（`BaseItem.saveSyncTime(syncTargetId, local, local.updated_time, 0, uploadedBase)`），含义是「上次把本地这份推上去时，本地的 `updated_time` 是多少」。

**配套的一段坦白**（`Synchronizer.ts` 注释）：

```
// Note: in order to know the real updated_time value, we need to load the content. In theory we could
// rely on the file timestamp (in remote.updated_time) but in practice it's not accurate enough and
// can lead to conflicts (for example when the file timestamp is slightly ahead of its real
// updated_time). updated_time is set and managed by clients so it's always accurate.
```

**即：Joplin 不信任 WebDAV 的文件时间戳，转而信任「客户端自己写在文件内容里的 `updated_time`」——代价是必须把每个文件下载下来读。** 这是 §1.3 结论的最强佐证。

**同一段逻辑的边界处理**（`Synchronizer.ts`）：

```ts
if (local.updated_time > time.unixMs() + Day) {
    throw new Error(sprintf('Remote item %s has an updated_time in the future', path));
} else if (local.updated_time > time.unixMs()) {
    throw new JoplinError(sprintf('Processing a path that has already been done: %s. Remote item has an updated_time in the future', path), 'processingPathTwice');
}
```

**「远端时间在未来」是个真实会发生的状况**（时钟偏移、时区），Joplin 选择**直接抛错**。注释里还写了 `There's currently no automatic fix for this - the remote item on the sync target must be fixed manually`。

#### 4.3.2 什么算冲突：只比 title 和 body

`packages/lib/models/Note.ts`（源码级）：

```ts
public static mustHandleConflict(localNote: NoteEntity, remoteNote: NoteEntity) {
    // That shouldn't happen so throw an exception
    if (localNote.id !== remoteNote.id) throw new Error('Cannot handle conflict for two different notes');

    // For encrypted notes the conflict must always be handled
    if (localNote.encryption_cipher_text || remoteNote.encryption_cipher_text) return true;

    // Otherwise only handle the conflict if there's a different on the title or body
    if (localNote.title !== remoteNote.title) return true;
    if (localNote.body !== remoteNote.body) return true;

    return false;
}
```

**元数据冲突（标签、待办完成状态、`is_locked` 等）不算冲突，直接被远端覆盖。** 注释：`if the conflict is on todo_completed it doesn't really matter so in this case we just take the remote content.`

#### 4.3.3 自动合并：自研 `boundedDiff3`，默认开启

**设置默认值**（`packages/lib/models/settings/builtInMetadata.ts`，源码级）：

```ts
'sync.autoMergeConflicts': {
    value: true,       // ← 默认开启
    type: SettingItemType.Bool,
    section: 'sync',
    public: true,
    label: () => _('Automatically merge non-conflicting note changes'),
    description: () => _('When the same note is edited on two devices, changes made to different lines are usually merged automatically. In rare cases, automatic merging may result in duplicated content or formatting changes'),
    storage: SettingStorage.File,
    isGlobal: true,
},
```

**标题合并：只有两边都改且改得不同才算冲突**（`services/conflict/autoMergeNote.ts`，源码级）：

```ts
export const mergeTitle = (base: string, local: string, remote: string) => {
	if (local === remote) return { merged: local, conflict: false };
	if (base === local) return { merged: remote, conflict: false };
	if (base === remote) return { merged: local, conflict: false };
	return { merged: '', conflict: true };
};
```

**没有直接用 node-diff3，而是自己重写了它**（`services/conflict/boundedDiff3.ts` 顶部注释，源码级）：

```ts
// A local copy of node-diff3's diff3MergeRegions (MIT licensed). The region combining is
// unchanged; only the hunks come from a bounded Myers diff rather than its LCS, which
// blocks the UI for seconds on a long note.
const { diffArrays } = require('diff');
```

**这是一条高价值的性能证据：node-diff3 的 LCS 实现会在长笔记上阻塞 UI 达数秒。** Joplin 为此换成了有界 Myers diff，并加了超时：

```ts
// The merge runs during sync, so it times out sooner than the conflict viewer
export const diffOptions: DiffOptions = { maxEditLength: 5000, timeout: 1000 };
export const viewerDiffOptions: DiffOptions = { maxEditLength: 10000, timeout: 3000 };
```

**重复行启发式**（`services/conflict/diffNotes.ts`，源码级）：

```ts
// True when the given side edited at or next to two or more identical lines in a row
const touchesDuplicateRun = (base: string[], side: string[], diffLines: DiffLines): boolean => { ... }
```

**在「编辑位置临近两个或更多完全相同的行」时拒绝自动合并。** Markdown 里这种情况极常见（连续的 `- ` 列表项、连续空行、表格分隔行）。**这是踩过坑之后加的保护。**

**行尾处理**（同一文件）：

```ts
// All three line endings are split on, otherwise a note written on Windows keeps a \r on every line
const splitLines = (text: string) => text.split(/\r\n|\n|\r/);
```

**冲突占位符格式**（同一文件）：

```ts
// These markers only appears in mergedText, which is never saved while conflicts still exist
const conflictPlaceholder = (local: string, remote: string): string => {
	return `<<<<<<< local\n${local}\n=======\n${remote}\n>>>>>>> remote`;
};
```

**注意注释：冲突标记「只出现在 mergedText 里，而 mergedText 在有冲突未解决时从不落盘」**——即 Joplin **不会**把 `<<<<<<<` 写进用户的 `.md` 文件，只在内存里用。落盘的是两份完整版本（原笔记 + 冲突副本）。

#### 4.3.4 冲突以什么形式呈现给用户

`services/synchronizer/utils/handleConflictAction.ts`（源码级，全文已读）：

三种 action：

```ts
export const conflictActions: SyncAction[] = [SyncAction.ItemConflict, SyncAction.NoteConflict, SyncAction.ResourceConflict];
```

**非笔记（`ItemConflict`）→ 远端直接覆盖本地**：

```ts
if (action === SyncAction.ItemConflict) {
    // For non-note conflicts, we take the remote version (i.e. the version that was
    // synced first) and overwrite the local content.
    if (remoteExists) {
        local = remoteContent;
        ...
    } else {
        // If the item is a folder, avoid deleting child notes and folders, as this could cause massive data loss where this conflict happens unexpectedly
        await ItemClass.delete(local.id, { ... deleteChildren: false });
    }
}
```

**笔记（`NoteConflict`）的完整流程**：

1. **重新加载最新的本地版**：`local = await Note.load(local.id);`
2. **判定是否需要处理**：`mustHandleConflict = Note.mustHandleConflict(local, decryptedRemoteNote ?? remoteContent)`——但若 `local.is_conflict` 已是 true 则**不再处理**（避免冲突副本套娃）。
3. **尝试自动合并**（仅在 `mustHandleConflict && isAutoMergeEnabled() && !itemIsReadOnly` 时）：

```ts
const cannotAutoMerge = (note: NoteEntity) => !!note.encryption_applied || !!note.encryption_cipher_text || !!note.is_locked;
if (!cannotAutoMerge(localNote) && !cannotAutoMerge(decryptedRemoteNote)) {
    const base = await Note.syncBaseContent(syncTargetId, local.id);
    // No common ancestor, so use the normal conflict flow
    if (base && (base.base_body || base.base_title)) {
        merge = autoMergeNote(
            { title: base.base_title, body: base.base_body },
            { title: localNote.title, body: localNote.body },
            { title: decryptedRemoteNote.title, body: decryptedRemoteNote.body },
        );
    }
}
```

**注意 `base` 是必须的**：`No common ancestor, so use the normal conflict flow`。没有 base 就不合并。

4. **完全合并成功（`merge.fullyMerged`）→ 保存合并结果，不创建冲突副本**：

```ts
if (merge && merge.fullyMerged) {
    const mergedNote: NoteEntity = {
        ...remoteNote,
        title: merge.resolvedLocal.title,
        body: merge.resolvedLocal.body,
        // Ahead of the remote time so the merge uploads as a local change
        updated_time: Math.max(time.unixMs(), remoteNote.updated_time + 1),
    };
    // Both sides now share the merged output, so it becomes the base for later conflicts
    const mergedBase = { base_body: ..., base_title: ..., base_conflict_note_id: '' };
    await ItemClass.save(mergedNote, { ... });
    dispatch({ type: 'EDITOR_NOTE_NEEDS_RELOAD', noteId: local.id });
    logger.info(`Auto-merged conflict for note ${local.id} - no conflict note created`);
    return;
}
```

**注意 `updated_time: Math.max(time.unixMs(), remoteNote.updated_time + 1)` 这个技巧**——把合并结果的时间**人为推后到比远端晚 1 毫秒**，这样它会被当作本地新变更上传。**这是绕过「时间戳精度不足以区分同毫秒变更」的一个手工修补。**

5. **部分合并 → 先把无争议的部分合进两边，再创建冲突副本**：

```ts
if (merge) {
    const remoteNote = remoteContent as NoteEntity;
    // Nothing was merged into the remote side, so it don't need uploading again
    const remoteUnchanged = merge.resolvedCurrent.title === remoteNote.title && merge.resolvedCurrent.body === remoteNote.body;
    local = { ...local, title: merge.resolvedLocal.title, body: merge.resolvedLocal.body };
    remoteContent = { ...remoteNote, title: ..., body: ..., updated_time: remoteUnchanged ? remoteNote.updated_time : Math.max(time.unixMs(), remoteNote.updated_time + 1) };
}
const conflictNote = await Note.createConflictNote(local, ItemChange.SOURCE_SYNC, remoteExists);
```

6. **之后无论如何：远端覆盖本地**（`if (remoteExists) { local = remoteContent; ... }`）。

**用户看到的东西**（`Note.createConflictNote` + `Note.ts`）：

- **一个专门的「冲突」笔记本**（`Folder.conflictFolderId()`），里面是**本地版**的副本，带 `is_conflict = 1` 和 `conflict_original_id` 指回原笔记。
- **原笔记被远端版覆盖。**
- 冲突笔记本里的笔记**无视排序/过滤器设置**永远显示：`Conflicts are always displayed regardless of options, since otherwise it's confusing`。
- `moveToFolder` / `copyToFolder` 都拒绝往冲突笔记本放，并且移出时重置 `is_conflict: 0` + `conflict_original_id: ''`。
- 有 `conflictedNotes()` / `conflictedCount()` / `syncIneligibleConflictedCount()` 查询（后者过滤 `conflict_original_id = "" OR share_id != ""`）。

**注意与 remotly-save / Obsidian 的关键差异**：Joplin 的冲突副本是**笔记在同一个应用内的一个笔记本里**，不是文件系统上的一个 `.md` 副本文件。**这个方案对本项目的适用性有个硬障碍**：Joplin 的笔记在同步目标上本来就是「一个笔记一个文件 + metadata 头部」（非标准 Markdown），而本项目的文件是**用户可见的纯 Markdown**——冲突副本如果落成 `笔记 (conflict).md`，它就**混进了用户的笔记库**，会被检索、被链接、被当成真实笔记。

#### 4.3.5 三方合并的 base 存在哪里

`BaseItem.ts` 的 `sync_items` 表（本地 SQLite）+ `ConflictNoteState`（`models/ConflictNoteState.ts`，源码级）：

```ts
// Keyed by the conflict note id. The remote note only stores it's updated_time
// to track later changes. remote_title and remote_body are kept for future
// partial conflict resolution.
export default class ConflictNoteState extends BaseModel {
    public static tableName() { return 'conflict_note_states'; }
    public static async save(state: ConflictNoteStateEntity) {
        await this.db().exec(
            'INSERT OR REPLACE INTO conflict_note_states (note_id, base_body, base_title, remote_body, remote_title, remote_updated_time) VALUES (?, ?, ?, ?, ?, ?)',
            [...],
        );
    }
}
```

`BaseItem.ts` 的 `sync_items` 表有 `base_body` / `base_title` / `base_conflict_note_id` 列，并有专门注释：

```ts
// ancestor the auto-merge and the conflict resolution work from. The link to any
// earlier conflict note is dropped, since it no longer relates to this base.
```

**即 Joplin 维护了一份「上次同步时的笔记内容」的持久副本，存在本地 SQLite，绝不上传到同步目标。** 这是 §8 的核心素材。

#### 4.3.6 Joplin 的同步目标上有什么

`readme/apps/sync/index.md`：`Currently, synchronisation is possible with Joplin Cloud, Nextcloud, S3, WebDAV, Dropbox, OneDrive or the local filesystem.`

同步目标上**只有文件，没有元数据**（每个 item 一个文件，含 metadata 头部）。`sync_time`、`base_body`、`conflict_note_states` **全在本地**。

**「known to work 列表不含坚果云」** 是 `0001` §4.3/§5.6 的记录（本轮未重新核对，沿用）。

#### 4.3.7 Joplin 对无原生 delta 的通用回退（`file-api.ts`，源码级）

```ts
// This is the basic delta algorithm, which can be used in case the cloud service does not have
// a built-in delta API. OneDrive and Dropbox have one for example, but Nextcloud and obviously
// the file system do not.
async function basicDelta(path: string, getDirStatFn: (path: string)=> ItemStat[] | Promise<ItemStat[]>, options: DeltaOptions) {
```

**这段注释是一手证据：`Nextcloud ... do not [have a built-in delta API]`。**

算法：取整个目录的 stat 列表，按 `updated_time` 排序，与 `context.timestamp` 比对。**关键边界处理**（同文件注释）：

```
// Find out which files have been changed since the last time. Note that we keep
// both the timestamp of the most recent change, *and* the items that exactly match
// this timestamp. This to handle cases where an item is modified while this delta
// function is running. For example:
// t0: Item 1 is changed
// t0: Sync items - run delta function
// t0: While delta() is running, modify Item 2
// Since item 2 was modified within the same millisecond, it would be skipped in the
// next sync if we relied exclusively on a timestamp.
```

**这是「毫秒级时间戳不足以做同步判定」的一手论证**——必须额外维护一份「正好等于那个时间戳的文件列表」（`context.filesAtTimestamp`）。**推断：任何用时间戳做同步判定的设计都会遇到这个问题，且必须显式处理。**

**还有一个增强模式（直接命中「外部修改」场景）**：

```ts
// The enhanced basic delta algorithm detects incoming changes based on both timestamp increases and decreases, which resolves issues where an external ...
```

`enableEnhancedBasicDeltaAlgorithm()` 时改用 `remoteItemMetadata`（每个 item 自己记录的 `updated_time`）而不是单调的 `context.timestamp`：

```ts
lastRemoteItemUpdatedTime = metadata.updated_time;
if (stat.updated_time === lastRemoteItemUpdatedTime) { updateReport.equal++; continue; }
if (stat.updated_time < lastRemoteItemUpdatedTime) { updateReport.older++; }
if (stat.updated_time > lastRemoteItemUpdatedTime) { updateReport.newer++; }
output.push(stat);
```

**它同时处理时间戳**前进和后退**——因为后者会在真实的同步目标上发生**（时钟偏移、服务端改写）。同一文件里还有对「误报 stat 导致同步目标上的笔记被随机删除」的 issue 引用（`https://discourse.joplinapp.org/t/sync-randomly-deleted-all-notes-on-just-one-device/50593`），并为此加了 `ignored` 计数与 `updateReport` 诊断。

**这是一条重要的产品教训：同步目标上「一次错误的 stat」会导致大规模误删，所以实现必须有「忽略/保护」逻辑和可诊断的计数。**

### 4.4 Syncthing（源码级）

**冲突文件命名**（`lib/model/folder_sendrecv.go`）：

```go
func conflictName(name, lastModBy string) string {
	ext := filepath.Ext(name)
	return name[:len(name)-len(ext)] + time.Now().Format(".sync-conflict-20060102-150405-") + lastModBy + ext
}

func isConflict(name string) bool {
	return strings.Contains(filepath.Base(name), ".sync-conflict-")
}
```

即 `笔记.sync-conflict-20260925-120000-ABCDEFG.md`。`lastModBy` 是设备 ID。

**与常见描述的一处修正**：官方文档说的是 `<filename>.sync-conflict-<date>-<time>-<modifiedBy>.<ext>`，但**源码显示扩展名在最后**（`name[:len-name-len(ext)]` + 后缀 + `ext`），即 `笔记.sync-conflict-...-.md`。文档的 `<filename>` 指「去扩展名的主体」，`.<ext>` 在末尾。**与我之前理解的「后缀在扩展名之后」不同。**

**何时冲突、谁被重命名**（[官方文档 syncing.html](https://docs.syncthing.net/users/syncing.html)）：

- 判定条件是「同一文件在两台设备上被同时修改，且实际内容不同」。
- **时间戳较早的那份被重命名**；若时间戳相同，**device ID 前 63 位较大的那份**被重命名。
- 「一边改、一边删，且删获胜」时，剩下那份也变成冲突副本。

**冲突文件之后会怎样**：

> `are treated as normal files after they are created, so they are propagated between devices.`

官方给的理由：冲突在一台设备上被检测和解决，但**冲突在所有设备上都存在**，Syncthing 无法判断用户更想要哪个。

**数量上限**（`lib/config/folderconfiguration.go`，源码级）：

```go
MaxConflicts int `json:"maxConflicts" xml:"maxConflicts" default:"10"`
```

`folder_sendrecv.go` 的 `moveForConflict`：若 `MaxConflicts > -1`，**只保留最新的 N 个冲突副本，多余的删掉**：

```go
if f.MaxConflicts > -1 {
    matches := existingConflicts(name, f.mtimefs)
    if len(matches) > f.MaxConflicts {
        slices.SortFunc(matches, func(a, b string) int { return strings.Compare(b, a) })
        for _, match := range matches[f.MaxConflicts:] {
            if gerr := f.mtimefs.Remove(match); gerr != nil { ... }
        }
    }
}
```

且 `MaxConflicts == 0` 时**直接删除冲突文件、完全不保留**：

```go
if f.MaxConflicts == 0 {
    if err := f.mtimefs.Remove(name); err != nil && !fs.IsNotExist(err) { ... }
    return nil
}
```

**判定用的不是时间戳，是 version vector**（`lib/protocol/vector.go`，源码级）：

```go
// Concurrent returns true when the two vectors are concurrent.
func (v Vector) Concurrent(b Vector) bool {
	comp := v.Compare(b)
	return comp == ConcurrentGreater || comp == ConcurrentLesser
}
```

**这解释了 Syncthing 为什么能区分「并发修改」与「先后修改」**：它的 BEP 协议在设备间传版本向量，每个设备知道「这份修改是基于哪个版本做的」。**WebDAV 上没有等价物**——这正是 §1.3 结论的根因，也是 §6 讨论 CRDT 时会再遇到的同一堵墙。

**Syncthing 还有其他冲突类型**：`case conflict`（仅大小写不同的文件名在大小写不敏感系统上冲突），以及 `lib/model/folder.go` 里的 `caseClashConflictRecordByPath` / `(case clash from ...)` 记录。

### 4.5 Dropbox 与坚果云的冲突文件命名约定

**Dropbox**（[官方帮助](https://help.dropbox.com/organize/conflicted-copy)）：

- 命名：`The editor's username, "conflicted copy", and the save date will be added to the filename.` ——即 `笔记 (用户名 conflicted copy 2026-09-25).md` 这一形态。
- 触发：`A conflicted copy is a file that Dropbox creates when multiple people edit the same file at the same time.` 三种场景：两人同时编辑、一人离线编辑而另一人也在编辑同一文件、文件在别处开着被自动保存当作新变更。
- **谁成为冲突副本**：`The last version saved will always appear as the conflicted copy.` ——**最后保存的成为副本**（与 Syncthing 相反：Syncthing 重命名较早的那份）。

**坚果云**（[官方帮助 p=1129「什么是文件冲突？如何解决、避免文件冲突？」](https://help.jianguoyun.com/?p=1129)，一手）：

- 触发：`本地的文件和云端文件数据内容不一致`
- 行为：`客户端在同步时会在本地保存云端的文件，并将本地的文件命名为冲突文件，其内容为另一份修改的版本`
- 传播：`冲突文件和源文件会同步到到所有电脑上`
- **命名规则（原文）**：`坚果云重命名的冲突文件的文件名在windows上带有"-冲突"字样，在linux和mac上带有"-NSConflict"字样`
- 多用户时：`冲突文件名字中会加上产生该冲突文件的用户昵称`
- **与 Syncthing/Dropbox 一致的语义：保留云端版为「源文件」，把本地版改名成冲突文件。** 三方都是这个方向（Joplin 也是：远端覆盖本地，本地进冲突笔记本）。

**处理方式**（[官方帮助 p=4031「如何批量处理冲突文件？」](https://help.jianguoyun.com/?p=4031)，一手）：

- Windows 7.0+ 客户端：`处理冲突与异常` → `扫描冲突文件` → 选中 → `批量处理` → 选 `保留最新版`（文件）或 `合并`（文件夹）。
- Windows 4.0+ 旧客户端：`同步` → `查看冲突` → 同样批量处理。
- 大小写冲突单独一类（[p=5125](https://help.jianguoyun.com/?p=5125)）。

**坚果云有文件锁定**（[p=4054](https://help.jianguoyun.com/?p=4054)）：被他人编辑时文件显示锁定标记且只读，官方建议 `建议不要再打开文件进行编辑，避免产生文件冲突`。`坚果云检测到文件没有使用，就会自动解除锁定`。**这是给多用户协作设计的；单人跨机器场景用不上。**

### 4.6 横向对比表

| | 冲突判定依据 | 冲突策略 | 冲突呈现形式 | 状态存在哪里 |
|---|---|---|---|---|
| **Obsidian Sync** | 未公开（官方只说「合并」） | Markdown 用 diff-match-patch 合并；非 Markdown last-modified-wins；设置 JSON 键合并。用户可选「自动合并 / 生成冲突文件」 | 文件系统上的 `原名 (Conflicted copy 设备名 YYYYMMDDHHMM).md`；原文件保留远端版；在 Sync log 里搜 "Conflict" 发现 | 服务端（E2EE 后的文件）+ 本地 |
| **remotely-save** | `prevSync` 的 **mtime + size** 三元比对（不用 ETag） | `keep_newer`（默认）/ `keep_larger`；PRO 加 `smart_conflict`：≤1MB 的 .md 用 node-diff3 合并，否则重命名成 `.dup.` 副本 | 库内文件系统上的 `笔记.dup.md`；或合并后静默覆盖 | **本地 IndexedDB**：`prevsyncrecords`（每条 = 上次的 Entity）+ `filecontenthistory`（上次的完整内容，作为合并 base）。**v3 不上传任何元数据到远端** |
| **Joplin** | `remoteContent.updated_time > local.sync_time`（**远端时间 vs 本地上次同步时间**）；只比 title 与 body | 有 base 才尝试三方合并（默认开启）；完全合并 → 静默保存；否则创建冲突副本，**远端覆盖本地** | **应用内的「冲突」笔记本**里的笔记副本（`is_conflict=1` / `conflict_original_id`），永不自动隐藏 | **本地 SQLite**：`sync_items`（`sync_time` / `remote_item_updated_time` / `base_body` / `base_title`）+ 独立的 `conflict_note_states` 表。远端只有笔记文件 |
| **Syncthing** | **version vector**（`Vector.Concurrent()`），非时间戳 | 无合并；早的一份（或 device ID 大的）重命名 | 库内文件系统上的 `笔记.sync-conflict-YYYYMMDD-HHMMSS-设备ID.md`；副本当普通文件传播；**默认最多保留 10 个**，`MaxConflicts=0` 则直接删 | 本地 LevelDB 索引 + **BEP 协议元数据**（版本向量） |
| **Dropbox** | 未公开 | 无合并；后保存的成为副本 | `笔记 (用户名 conflicted copy 日期).md` | 服务端 |
| **坚果云客户端** | `本地的文件和云端文件数据内容不一致` | 无合并；云端版保留为源文件，本地版改名 | Windows：`-冲突`；Linux/macOS：`-NSConflict`；多人时含用户昵称。客户端提供「扫描冲突文件 → 批量处理 → 保留最新版/合并」 | 客户端本地 |
| **Nextcloud / ownCloud 客户端** | 本地改了 + 服务端也改了（`discovery.cpp`） | 无合并；服务端版本下载为正式文件，**本地副本重命名且不上传**（`Conflict: Server version downloaded, local copy renamed and not uploaded.`） | Nextcloud：`名字 (conflicted copy 用户名 yyyy-MM-dd hhmmss).ext`；ownCloud：不带用户名。另有 `(case clash from ...)` 用于大小写冲突 | 本地 SQLite journal + `conflictRecord` 表 |

**三条跨产品的共性规律**（**推断**，但从上表归纳得很干净）：

1. **没有任何一家做「自动合并 + 静默覆盖」之外还提供冲突可视化的完整闭环。** 要么合并（可能出错，Obsidian 明说 `duplicate text or formatting problems`），要么留副本（用户自己去处理）。
2. **冲突副本一律落在文件系统的同一命名空间里**（除 Joplin 是应用内的笔记本）。**这对本项目的纯 Markdown 库是个真问题**：副本文件会被全库索引和链接当成真实笔记。
3. **同步状态一律存在文件之外，且一律不上传到同步目标。** 六家里没有一家把同步元数据放在远端。

---

## 5. 三方合并

### 5.1 `node-diff3` 的实际表现（**全部已实测**，本机 Node v24.18.0，node-diff3@3.2.1）

**陷阱一：默认分隔符是空白，中文会被切碎。**

```js
// 默认 stringSeparator（空白）
merge(a, o, b).result
// → ["讨论了","WebDAV","同步方案，结论是用","ETag","做乐观锁。","第二行不变。",""]
```

**第一个必须记住的事实：`node-diff3` 默认按空白切分，对中文（和任何以空格分词的场合）都会切成语义错乱的 token 序列。** 必须显式传 `stringSeparator: /\n/`。

**这点在两家实现里都被正确处理了**：remotely-save 传 `/\n/`（`mergeDigIn(a, o, b, { stringSeparator: /\n/ })`），Joplin 干脆弃用 node-diff3 自己做行切分 + 有界 Myers diff（§4.3.3）。

**陷阱二（更严重）：行级 diff3 的冲突判定比直觉粗糙得多。** 以下都是**已实测**（`stringSeparator: /\n/`）：

| 场景 | 结果 | 评价 |
|---|---|---|
| **A 改第一段，B 改最后一段**（不同段落） | ✅ **干净合并，无冲突** | 符合预期 |
| **A、B 改同一段** | ❌ 冲突标记 | 符合预期 |
| **A、B 改同一行内不重叠的位置**（`...还有牛奶和鸡蛋。` vs `今天去买了红苹果...和牛奶。`） | ❌ **冲突** | 行是最小单位，同行不可能拆开 |
| **A、B 各在文件末尾追加一行** | ❌ **冲突** | **笔记场景高频！** 两台机器各记一笔 |
| **A 删掉第 5 行，B 修改第 6 行**（相邻但不相关） | ❌ **冲突** | **反直觉，且是 diff3 的经典缺陷** |

最后一条要展开：删 `- 调研坚果云限制` 与 改 `- 写技术报告` 在语义上完全无关，但因为它们在相邻行，diff3 把两个变化**合并成一个 hunk** 从而无法归因。**任何基于行级 diff3 的自动合并都会在「两台机器分别动相邻行」时误报冲突。** 误报的方向是安全的（落副本，不丢数据），但会造成用户可见的噪音。

**`excludeFalseConflicts` 选项（README 描述为「如果 a 和 b 含相对 o 的相同修改，视为假冲突」）在实测中看不出效果**：不论传不传，两边做**完全一样**的修改都返回 `conflict: false`、结果正确。即这个选项修的不是「双方相同修改」这个 case（那本来就没问题）。

**性能**：README 未给数字，但 **Joplin 的一手注释是硬证据**（§4.3.3）：`node-diff3's ... LCS, which blocks the UI for seconds on a long note`。Joplin 为此换掉 LCS、加了 `maxEditLength: 5000, timeout: 1000`（同步路径）/ `10000 / 3000`（UI 路径）的超时。

**`node-diff3` 的其他相关事实**：
- `diff3Merge(a, o, b, options)` 是最底层接口，返回交替的 ok/conflict 块，**不生成标记文本**——这是做自定义 UI（比如 Joplin 的 `resolvedLocal` / `resolvedCurrent` 双版本）的正确接口。
- `merge()` 生成带 `<<<<<<<` / `=======` / `>>>>>>>` 的文本。
- `mergeDigIn()` 生成「digin 风格」结果。
- 追溯到 `project Synchrotron, created by Tony Garnock-Jones`；MIT；CJS + ESM 双格式。
- 生态里的其他选择：`diff3`（npm，`A diff3 engine for nodejs`，v0.0.4）、`diff-match-patch`（Google 的字符级 2 路库，Obsidian 官方口径用的就是它，npm v1.0.5）、`@sanity/diff-match-patch`（remotely-save 的注释里引用了但**未使用**，代码是注释掉的）。

### 5.2 笔记库作为 Git 仓库：能否复用 Git 的合并能力

**能，而且语义与 node-diff3 一致。已实测**（本机 `git`，Windows）：

| 场景 | `git merge` 结果 |
|---|---|
| A 改第一段，B 改最后一段 | `Auto-merging note.md` / `Merge made by the 'ort' strategy.` —— **干净合并** |
| A、B 改同一行 | `CONFLICT (content): Merge conflict in n.md`，工作区留下 `<<<<<<< HEAD` / `=======` / `>>>>>>> b`，`git status` 显示 `UU n.md` |

**即 Git 的合并语义与 node-diff3 是同一类（行级三方合并），会犯同样的错**（相邻行误报、同行无法拆分）。Git 的额外价值不在合并算法本身：

| Git 提供的 | 价值 | 代价 |
|---|---|---|
| **`rerere`**（reuse recorded resolution） | 记住用户上次怎么解的冲突，下次自动复用 | 需要用户开启；解错会传播 |
| **`merge.conflictStyle=zdiff3`** | 冲突块里显示 base 版本，比默认风格好读得多 | 只是可读性 |
| **`git checkout --ours/--theirs`** | 一键选边 | — |
| **`git log` / `git show` / `git blame`** | **完整的版本历史与逐行归因** | 需要定期 commit |
| **`git fsck` / `git gc`** | 数据完整性校验 | — |
| **rename detection** | 改文件名时合并更聪明 | — |

**代价（票面问的「对普通用户 Git 是否过于复杂」）** —— 我认为**问题不在复杂度，在于四个具体的工程障碍**：

1. **`.git` 目录的处置**。它必须在**同步范围之外**（各机器独立 clone/pull），但 WebDAV 上**没有 exclude 机制**——除非把库放在同步根的一个子目录里（即同步的是库的父目录，且 `.git` 在库内、无法排除），或者**把 `.git` 放在库外的另一个位置**（`GIT_DIR` / `--separate-git-dir`）。后者可行但要额外配置。
2. **`.git` 的体积**。几千个文件的库，`.git` 轻松几百 MB（每次 commit 都存新对象，Markdown 压缩率高所以没那么可怕，但二进制附件很重）。**如果 `.git` 被误同步，坚果云流量会立刻爆**（§2.1 的 1GB/3GB）。
3. **CRLF**。**已实测**：在 Windows 上 commit 时 git 反复警告 `warning: in the working copy of 'note.md', LF will be replaced by CRLF the next time Git touches it`。这意味着**同一份内容在 Windows 与（理论上）其他平台上会有字节级差异**。对本项目（Windows 优先、两台 Windows）风险低，但它是「内容没变但字节变了」的一个真实来源——**与「用内容哈希做同步判定」直接冲突**。
4. **Git 的依赖**。Electron 应用要么打包 Git（体积、许可、跨平台可执行文件管理），要么要求用户自己装（`git` 必须在 PATH 里，还要处理「装了但版本太老 / 装了但不在 PATH / 装了 Git for Windows 但只装了 Git Bash」）。**#1 已定「推荐把库变成 Git 仓库」作为版本历史方案**——这是**给用户的一个可选增强**，不是应用内部实现。
   - 特别地：如果应用内部用 Git 做同步（`git fetch`/`merge`/`push` 到 WebDAV），那它需要一个 WebDAV 的 Git remote——**Git 不支持 WebDAV 作为 remote**（`git-remote-dav` 不存在；只有 `git-remote-http(s)` 走 dumb/smart HTTP 协议，WebDAV 服务端一般不支持）。**所以「用 Git 做 WebDAV 同步」在技术上不通，除非在每台机器上跑一个本地 Git 服务或用网盘挂载——而后者正是 #1 明确排除的。**
   - **这条很重要**：Git 在本项目里只能是「**版本历史与冲突解决的辅助工具**」（用户在本地 commit，应用负责在冲突时调用 git 的合并能力、或把三份内容喂给 `git merge-file`），**不能是同步传输层**。

**推断的最优用法**：**不自建 Git 仓库，但复用 `git merge-file` 这个单一命令。** `git merge-file -p current base other > merged` 是一个独立可执行的、工业级的、经过二十年打磨的三方合并实现，可以在冲突时被调用，把三份内容（本地 / base / 远端）喂进去。它没有 `.git` 目录、没有 CRLF 配置、没有仓库概念——**只是一个函数**。这避开了上述四个障碍中的三个（1、2 完全避开；3 可以通过传 `-L` 标签和 `--diff3` 控制；4 仍有 Git 依赖，但只是「装没装 Git」而不是「有没有仓库」）。

**对照**：Joplin 选了「自己重写 diff3 的 region 合并 + 换掉 LCS」（§4.3.3），remotely-save 选了「直接用 node-diff3」（§4.2.2）。两条路都走得通，**Joplin 那条（自研 bounded 版本）是为了性能**。

---

## 6. CRDT 与「文件是唯一真相」是否根本冲突

### 6.1 结论：**是，根本冲突。** 三层原因，逐层论证。

### 6.2 第一层（信息论）：CRDT 状态 = 文本 + 因果元数据，纯文本只有前者

**Yjs**（官方文档 [docs.yjs.dev/api/document-updates](https://docs.yjs.dev/api/document-updates)）：

- 持久化单位是**二进制 update**：`Changes on the shared document are encoded into binary encoded (highly compressed) document updates.`
- 这些 update 是 `commutative, associative, and idempotent`——`you can apply them in any order and multiple times`。
- **update 里含纯文本没有的信息**：`A state vector describes the state of the local client`，且 Yjs `holds the number of modifications created by each client`（每个 client 的修改计数）。`Y.encodeStateVectorFromUpdate` 能从二进制里推出它，**反之不行**。
- 官方明确说**没有 JSON 表示**：`there is no JSON representation for binary data`，需要字符串就得 Base64。
- `Y.Text.toString()` 能导出文本，但**官方文档没有任何「从纯文本重建 CRDT 状态」的路径**（**已核对**：该页 + [docs.yjs.dev](https://docs.yjs.dev/) 首页 + [github.com/yjs/yjs](https://github.com/yjs/yjs) README 均无此类陈述）。
- 持久化 provider 把**二进制**存进外部存储：`y-indexeddb` 用 `new IndexeddbPersistence(docName, ydoc)` 存进 IndexedDB；通用说法是 `persistence providers that store document updates in a database`。
- 还有一条运维负担：`this feature only merges document updates and doesn't garbage-collect deleted content`，且 `You still need to load the document to a Y.Doc to reduce the document size`——**删除的内容会永久留在历史里**。
- **一条容易被误读的官方话术**：`Yjs doesn't need a central source of truth.` 这句话说的是**不需要中央服务器**（可以与 OT 的「依赖单一真相服务器做冲突解决」对比），**不是**在说「文件是真相」。把它读成后者是错的。

**Automerge**（[automerge.org](https://automerge.org/docs/reference/documents/)）：

- 有正式的 **binary format spec**（`https://automerge.org/automerge-binary-format-spec`，README 明列）。
- 文档结构：`A document always consists of a root map which is a map from strings to other Automerge values`；类型有 map / list / text / 各种 scalar。
- Text 是 `an implementation of the peritext CRDT`；list 是 RGA。
- **冲突解决机制**：并发写同一属性时 `Automerge "picks one of the concurrently written values as the 'winner'"`，其他值通过 `Automerge.getConflicts()` 可取回。而且关键——`"last writer wins" relies on the operation's internal counter/actorId rather than wall-clock time`。**即它不靠墙上时钟，靠 actorId + counter。这两个东西纯文本里都没有。**
- `automerge-repo` 的存储：`keys are arrays of the form [<document ID>, <chunk type>, <chunk identifier>]`，chunk type 是 `"snapshot"` 或 `"incremental"`，全部是 `Uint8Array`。存储层需要 `load` / `save` / `remove` / `loadRange` / `removeRange`。

**即**：CRDT 的状态在数学上是 `(可见文本, 因果历史)` 的二元组。**从纯文本恢复因果历史在信息论上不可能**——丢失的是「哪个 client 在什么逻辑时刻基于哪个版本改了什么」。这不是工程实现问题，是信息不存在。

### 6.3 第二层（载体）：元数据必须有一个持久的家，两个位置都违规

CRDT 要求因果元数据**必须**被持久化（否则重启就丢合并能力）。只有两个可能的家：

| 元数据位置 | 对本项目第一原则的影响 |
|---|---|
| **塞进 `.md` 文件里**（frontmatter / 注释块 / Base64 blobs） | **直接违反「笔记是纯 Markdown，用任何外部编辑器改后应用必须工作正常」。** 用 Typora 打开一篇带 CRDT 元数据的笔记，用户会看到一大坨不可读的东西；如果用户编辑后保存，元数据可能与内容不一致（Typora 不会更新它） |
| **放在文件之外**（独立文件 / 数据库 / sidecar） | **直接违反「不引入文件之外才存在的状态」。** 且对用户的外部编辑（Typora 改完）应用无法知道「这次编辑在 CRDT 语义上是什么」——见第三层 |
| **兼有**（文件内放指针 + 文件外放状态） | **兼有两个问题**，且多了一个新问题：指针与状态可能失联（用户复制/移动文件、从备份恢复、同步把文件带过去但状态没跟着走） |

**没有第三个选项。** 这是「CRDT + 纯文本 + 外部编辑器」这个组合的硬约束。

### 6.4 第三层（外部编辑）：外部编辑会退化为全量替换，CRDT 的价值在对该路径上归零

**这是最要命的一层，也是最容易被略过的。**

假设用户用 Typora 改了 `笔记.md`（加了 3 段）。应用启动后只看到**一个新的文本**，没有任何「哪些字符是新增、哪些是原有、这次编辑基于哪个版本」的信息。应用能做的只有：

1. **把整篇当作一次原子的全量替换操作**（`delete all + insert all`）。这会让这次编辑在 CRDT 里表现为「与所有并发编辑都冲突」（所有字符都被判定为全新）。合并结果取决于 CRDT 的 tie-break 规则（Yjs 按 client id，Automerge 按 actorId + counter）——**等于随机选一边，就是 LWW**。
2. **尝试用 diff 推断「最小编辑集」**（把「新文本」与「CRDT 里的旧文本」做 diff，把 diff 出的 hunk 应用为一系列的 insert/delete 操作）。这是 **Teletype for Atom / 一些协同编辑器的做法**，但需要应用**知道**「外部编辑前的文本」是什么——**这恰恰就是「同步锚点」要做的事**（§8）。而且推断出的操作是**猜测**，对「用户重排了大量段落」这类编辑会猜得很差。

**两种路径下，CRDT 的自动合并能力在对「外部编辑器」这条通路上都不起作用。** CRDT 只在**两台机器都跑本应用、且都通过应用编辑**时才有价值——而这个场景，正好是 §5.1 里 `node-diff3` 能在「不同段落」时干净合并的场景，**用几百行代码就能拿到 90% 的效果**。

**推断**：CRDT 的收益曲线在一个「单用户、两台机器、每台机器偶尔写、且允许外部编辑器介入」的场景里是**很平的**；而它的成本（元数据载体、外部编辑退化、DAG 无限增长、迁移不可逆）是**很陡的**。**与 #1 的第一原则冲突，且收益不抵成本。**

### 6.5 一条关键的历史教训：一旦元数据升格为真相，可迁移性不可逆下降

`0001` §4.2 已经记录了 Logseq DB 版的例子：真相迁进 `db.sqlite` 之后，Markdown 导出变成有损（官方：`cannot capture all data in a graph`），唯一完整格式是 EDN。

**CRDT 走的是同一个方向，而且更远**：CRDT 的元数据比 Logseq 的属性更不可约（因果历史一旦丢失无法重建，属性的值至少还在文本里）。**把 CRDT 引入意味着「笔记库的正确性依赖于一份无法从纯文本重建的二进制的存续」——这与第一原则的距离比 Logseq DB 版更远，而不是更近。**

**若将来真要引入 CRDT**（推断，作为记录）：唯一与第一原则相容的形态是**「CRDT 是派生视图，不是真相」**——即 Markdown 文件是唯一真相，CRDT 状态是「为了提高合并质量而维护的高速缓存」，且**必须接受它随时可能被丢弃并退回全量替换语义**（因为用户可能用外部编辑器绕过它）。这个形态下 CRDT 的净收益进一步缩小（要维护两套还要能优雅降级）。**论证下来，这条路的收益/成本比在这三台机器的规模上是负的。**

---

## 7. 冲突处理策略的候选方案对比

票面要求「技术事实 + 冲突处理策略的候选方案对比，供 #3 决策」。以下不选边，只列代价。

**共同的机制前提**（§1.6 的结论）：每轮同步必须先做一次**全量 PROPFIND 扫描**拿到每个文件的服务端 `getlastmodified` + `getcontentlength`（+ 若有 `getetag`），与本地扫描结果和自己的**同步锚点**比对。

### 方案 A：时间戳 LWW（last-write-wins，无检测）

「谁的时间新就留谁」。等价于不做冲突检测。

- **实现代价**：几乎为零。remotely-save 的免费版就是这一档，且它还有检测。
- **失败模式**：**静默丢数据**。#1 的验收标准是「用两周真实地只用它」，静默丢一笔日记就是失败。
- **不建议**——它是唯一一个**不能**给出「丢了什么」的选项。

### 方案 B：检测冲突 + 冲突副本，不做自动合并

在两份都变了的情况下**一律落副本**，让用户手工处理。

- **实现代价**：低。需要同步锚点（§8），需要比对逻辑，需要副本命名与「不索引副本」的机制。
- **呈现形式**：文件系统上的 `笔记.conflict-设备名-时间戳.md`（Syncthing / Nextcloud / 坚果云 / Obsidian 的做法），或 `.confidant/conflicts/` 目录（更干净，但要小心：**离开笔记库目录的副本用户可能永远看不到**）。
- **关键难点（本项目特有）**：**副本会被全库索引和链接当成真实笔记。** 必须解决：索引是否排除副本？`[[链接]]` 的自动补全是否提示副本？改文件名时是否会误更新副本里的链接？这些都**没有现成的答案可抄**——六家产品里除 Joplin 外都把副本放在同一命名空间，而它们**都不做全库链接自动更新**（这正是本项目的差异化功能之一）。
- **跨产品证据**：Syncthing 默认只保留 10 个副本，`MaxConflicts=0` 时直接删——**说明副本会堆积**。坚果云要专门提供「扫描冲突文件 → 批量处理」的工具——**说明用户不会主动处理副本**。**推断：#3 若选这条路，必须同时设计「冲突的可见性」（在应用内能看到并一键处理），否则副本会变成垃圾。**

### 方案 C：检测冲突 + 自动三方合并，失败才落副本

- **实现代价**：中。除 B 的全部成本外，还需 `base`（= 同步锚点里存上一版内容）+ 合并引擎。
- **跨产品证据**：**Obsidian Sync 与 Joplin 都默认开启自动合并**（Joplin 的 `sync.autoMergeConflicts` 默认 `true`），**两家的官方文案都主动承认自动合并可能出错**（Obsidian：`duplicate text or formatting problems` / `fix these manually`；Joplin：`In rare cases, automatic merging may result in duplicated content or formatting changes`）。remotely-save 把它做成付费功能。
- **已实测的误报率来源**（§5.1）：相邻行、同行不重叠编辑、末尾并发追加都会误报冲突。误报的方向安全（落副本），但噪音可观。
- **性能（已实测 + Joplin 一手）**：node-diff3 的 LCS 在长笔记上会阻塞数秒，必须换实现或加超时。
- **实现选择**：`node-diff3`（简单，性能需处理）/ 自研有界 diff（Joplin 路线，性能好，工作量大）/ 调用 `git merge-file`（性能与成熟度好，引入 Git 依赖但**不需要仓库概念**）。

### 方案 D：结构上消除冲突（目录分区 / 文件归属）

不检测、不合并，而是**让两台机器永远不写同一个文件**。

- **实现代价**：低（技术上），高（产品上）。
- **做法**：给每台机器分配「负责的目录」（主机器管 `notes/`，次机器只写 `inbox/` 与 `journal/`），应用拒绝写不属于本机的目录。
- **优点**：**从定义上消除冲突**，不需要锚点、不需要合并、不需要副本。这是 Syncthing 的 folder 分区、Git 的 CODEOWNERS、以及数据库分片的同一个思路。
- **缺点**：改变了产品语义。用户的笔记是自由生长的，很难事先划分归属。且一旦用户在两台机器上都想改同一篇（这是人性），要么被拒绝（挫败），要么退化成需要 B/C/D 的兜底。
- **推断**：不能作为**唯一**方案，但可以作为**降低冲突率的辅助**——尤其是与 §8 的「一台为主」场景天然契合。

### 方案 E：CRDT

见 §6。**与第一原则根本冲突，不建议。**

### 对比汇总

| 方案 | 实现代价 | 丢数据风险 | 冲突呈现 | 与第一原则 | 跨产品先例 |
|---|---|---|---|---|---|
| A 时间戳 LWW | 极低 | **高（静默）** | 无 | 相容 | remotely-save 免费版 |
| B 检测 + 副本 | 低 | 无 | 副本文件（需设计可见性） | 相容（除锚点，见 §8） | Syncthing / Nextcloud / 坚果云 / Obsidian 非 Markdown |
| C 检测 + 自动合并 | 中 | 无（误报落副本） | 通常静默；失败时副本 | 相容 | Obsidian Sync / Joplin |
| D 目录分区 | 低（技术） | 无 | 无（从定义上无冲突） | 相容 | 无直接先例（Syncthing folder 分区类比） |
| E CRDT | 高 | 无 | 无 | **根本冲突** | Yjs / Automerge 生态 |

**一条跨方案的事实**：**没有一个跨产品先例是「自动合并 + 从不落副本」的。** Obsidian Sync 和 Joplin 都提供「不合并」的退路（Obsidian 的 `Create conflict file` 设置；Joplin 的冲突笔记本）。**推断：C 方案的正确形态是「默认合并，但冲突可见且可退回 B」。**

---

## 8. 特别问题一：「一台机器为主、另一台很少写」能简化到什么程度

### 8.1 简化掉「自动合并」，不能简化掉「检测」

**事实**：在「次机器从不写」的假设下，冲突判定的复杂度几乎全部消失——

- Joplin 的判定 `remoteContent.updated_time > local.sync_time`：主机器同步后 `sync_time` 就等于自己的 `updated_time`，次机器不动则远端 `updated_time` 不变，**条件恒为假，永不冲突**。
- remotely-save 的 `localEqualPrevSync` / `remoteEqualPrevSync` 同理：只写一侧时，写侧恒为「变」、另一侧恒为「不变」，**永远走到 pull 或 push 分支，永不进冲突分支**。
- 所有产品里那些复杂的冲突机制（Syncthing 的 version vector、Joplin 的 `mustHandleConflict`、remotely-save 的 `smart_conflict`）在这个假设下**全部是死代码**。
- **方案 D（目录分区）在这个假设下是零成本的**：如果次机器只写 `inbox/`，主机器从不写 `inbox/`，那么冲突在**结构上不可能发生**，连检测都不用。

**但「很少写」不等于「从不写」。**（**推断**）这正是简化的风险所在：

- 一个「几乎不写」的机器，在某个下午写了一篇。「几乎」意味着同步代码的冲突分支**从来没被真实执行过**——它是未经测试的代码路径。
- 如果按「从不写」的假设把检测也简化掉，那一刻就是**静默覆盖**。用户看到的是「我在另一台机器上写的东西不见了」——**且没有任何痕迹能告诉他发生了什么**（方案 A 的失败模式）。
- **对比**：保留检测、去掉自动合并（方案 B），代价是「在冲突时用户要手工处理」。而在这个场景下，冲突是**稀有事件**——手工处理稀有事件的成本远低于静默丢数据一次的成本。

**即：简化空间的正确边界是「不做自动合并」，而不是「不做检测」。**（**推断**）

### 8.2 可以进一步简化的（推断）

1. **单向为主的数据流**。主机器 → 次机器的推送可以做成「次机器只 pull」的模式。remotely-save 的 `incremental_push_only` / `incremental_pull_only` 就是这么设计的，且有对应的决策分支（`(22)(23)(24)(27)(29)(33)(35)` 等）。
2. **冲突一律落副本 + 提示，不做合并**。这是 §7 的方案 B。把 diff3 的整个复杂度（包括 §5.1 的误报和性能问题）推迟到确认有需求之后。
3. **锚点可以更粗**。如果接受「每次同步做内容比对」（见 §9），锚点就只需要知道「哪些文件上次同步过」，甚至可以不存时间戳。
4. **次机器的写入区域可以收窄**。这是产品决策（方案 D），但在「一台为主」的场景下特别自然——次机器通常是「随手记」（#1 的优先级排序里**捕捉 > 日记 > 检索 > 长文写作**）。**把次机器的写入限定在少数目录，冲突率会接近零。**

### 8.3 不能简化的

- **删除的传播**。必须能区分「远端文件被删了」和「远端文件我上次没见过」。见 §9.2——这是同步锚点最危险的消费者。
- **首次同步**（两端都有内容、且之前从未同步过）。这时**没有任何锚点**，每个文件都可能是「两边都新建了同名文件但内容不同」。这是最难的场景，且它必然发生一次。
- **附件的处理**（体积、`assets/` 单目录的 750 项上限、流量配额）。这与「一台为主」无关。

---

## 9. 特别问题二：同步状态的性质

### 9.1 事实：所有实现都把这份状态放在文件之外，且都不上传

| 实现 | 状态在哪 | 内容 | 是否上传到同步目标 |
|---|---|---|---|
| remotely-save | 本地 **IndexedDB**（localforage）`prevsyncrecords` + `filecontenthistory` | 上次同步时每个文件的 `Entity`（`mtimeCli`/`mtimeSvr`/`size`/`sizeEnc`/`keyRaw`）+ **上次的完整文件内容**（合并 base） | **否**（v3 `no remote meta data any more`） |
| Joplin | 本地 **SQLite** `sync_items`（`sync_time`/`remote_item_updated_time`/`base_body`/`base_title`）+ `conflict_note_states` | 上次同步时间、上次的 base 内容 | **否**（同步目标上只有笔记文件） |
| Syncthing | 本地 **LevelDB** 索引 + BEP 协议的版本向量 | 文件元数据 + 因果版本 | 版本向量随 BEP 传（**WebDAV 上无等价物**） |
| Nextcloud desktop | 本地 **SQLite** journal + `conflictRecord` 表 | 每个文件的同步状态 | 否 |
| Obsidian Sync | 服务端 | 未公开 | 是（服务端维护） |
| 坚果云客户端 | 客户端本地 | 未公开 | 未公开 |

**「不上传到同步目标」是压倒性的一致做法。** 这本身是个信号：**同步状态属于「这台机器的本地视角」，跨机器共享没有意义**（甚至有害——它描述的是「本机上次看到的远端」，另一台机器不关心）。

### 9.2 它是什么：**可丢弃但不可重建的辅助信息**

票面要「正面处理它是不是真相」。我给出的定性是三层，逐层论证：

**它不是「真相」（truth）**：

- 真相的定义（本项目语境）：**唯一权威，丢了就丢内容**。
- 同步锚点丢了，**笔记内容完整无损**。库仍然可以在 Typora / VS Code / 记事本里正常读写；索引仍然能从文件重建（这是 #1 的既有立场）。
- 判据：**「删掉这个状态之后，我还能不能把库里的每一篇笔记完整地读出来？」** 同步锚点 → **能**。索引 → **能**。Logseq DB 版的 `db.sqlite` → **不能**。前两者同类，后者是另一个类。

**它也不是「普通的缓存」（cache）**：

- 缓存的定义：**丢了可以从源重新生成，最坏只是变慢**。
- 同步锚点丢了**不能从源重新生成**。远端只有「**当前**长什么样」，没有「上次长什么样」。丢失的是「这期间的改变是**谁**做的」这个归因信息——**而这正是所有冲突检测的全部内容**。
- 具体地，remotely-save 的源码把这点写得很清楚：`If both compare False (Didn't exist means both are new. Both exist but don't compare means both are modified)` —— **「锚点不存在」与「两边都改了」在判定上无法区分**。**丢失锚点 = 所有文件都被判为冲突**（安全方向，但会淹没用户）。
- Joplin 同样：`sync_items` 里没有行 → `local.sync_time` 为 0 → `remoteContent.updated_time > 0` 恒真 → **全部判为冲突**。同一文件里还有 `if (!local.sync_time) { ... }` 的分支专门处理「从未同步过」。

**所以准确的性质是：可丢弃（丢弃不损坏内容）但不可重建（必须做一次昂贵的保守全量对账）。**

### 9.3 与「不引入文件之外才存在的状态」的张力 —— 正面处理

先确认这条原则的**立法意图**（从 #1 的原文看）：

> **文件是唯一真相**：笔记是纯 Markdown 明文；用任何外部编辑器（Typora、VS Code、记事本）改文件后，应用必须工作正常；索引必须能从文件**完全重建**。这是整个 effort 的第一原则，与它冲突的提案一律不作数。

反面例证（`0001` §4.2）：Logseq DB 版把真相迁进 `db.sqlite`，结果 Markdown 导出变成有损。**这条原则要防的是「内容被搬进只有应用能读的地方」。**

**同步锚点不在防止范围内，理由是它不承载内容**：

- 它是**对内容的观察记录**（「上次离开时远端是什么样」），不是内容本身。
- **它满足上面那条判据**：删掉后笔记完整可读。
- 它有一个**明确的降级路径**（见 9.4）。**「有降级路径」是「缓存」与「真相」的分界线。**

**所以（推断）：同步锚点与「文件是唯一真相」相容。** 但这份相容是**有条件的**，条件是契约里必须写清它的降级语义。**如果设计上假定它永远在，它就在事实上升格成了真相**——因为丢失它会导致误判，而误判会损坏数据。

### 9.4 契约（推断，供 #3 决策）

三条，都来自上面的事实：

**(1) 锚点丢失时的降级路径：强制一次保守的全量对账。**

- 不传播删除。
- 不做自动合并。
- 逐一比对内容（而不是比对时间戳）。
- 两边都有、内容相同 → 只重建锚点，不动任何一边。
- 两边都有、内容不同 → **保守落副本 + 提示**（方案 B）。
- 只在一侧有 → **不删另一侧的对应文件**；如果一侧有另一侧完全没有，判断为「新增」并同步过去（这是安全的：新增不丢数据）。**唯一危险的是「远端有、本地无、且锚点说本地曾经有」——即删除的传播，此时锚点丢失就必须拒绝传播。**

**(2) 绝不能把「锚点存在」当作删除权限的前提之外的条件。**

**删除的传播是锚点最危险的消费者。** 远端某文件消失，有两种可能：
- 「另一台机器删了它」→ 应当传播删除。
- 「我上次同步时压根没看见它」（它在别处被创建、或者上次同步失败了、或者锚点丢了）→ **绝不能删本地**。

**没有锚点，这两个不可区分。** 所以规则是：**锚点丢失时绝不传播删除**。这也是 §9.4(1) 里那条「唯一危险」的由来。

**remotely-save 的 `design.md` 把 `deletion protection (blocking)` 列为 must-have**，并提供了「真删除状态计算」（`deletion: true deletion status computation`）——**它撞过这个坑**。Joplin 也有对应的保护（`deleteChildren: false`，以及 `ignored` 计数与 `updateReport` 诊断，还有一条指向「同步随机删除了所有笔记」的 issue 链接）。

**(3) 用内容哈希代替/补充时间戳，让锚点「可退化」。**

- **推断**：锚点表可以退化为「path → 上次同步时的**内容哈希**」。这样：
  - 两边当前哈希相等 → 无变化，**不需要锚点**。
  - 一边等于锚点、另一边不等 → 只有一边变，**归因明确**。
  - 两边都不等于锚点 → 冲突，保守落副本。
  - **锚点丢了**：仍能用「当前两侧哈希是否相等」得出**相当程度**的信息（相等 = 无需动作），只有「两侧不等且无锚点」才需要落副本。**这比纯时间戳健壮得多。**
- **好处**：哈希是**内容的函数**——它不引入任何「文件之外才存在的真相」，只是「文件之外才存在的观察」。**这条性质正是让锚点留在「缓存」一侧而不是滑向「真相」的机制。** 它也解释了为什么 remotely-save 的 `Entity` 里留了 `hash?: string` 字段（虽然它的判定逻辑没用）。
- **代价**：算哈希要读全部文件内容（**推断**：对几千个小 Markdown 大约几十 MB，读盘开销可接受）。**但**：如果远端要算哈希，就必须把文件 GET 下来——**这对坚果云流量是致命的**（§2.1）。所以内容哈希**只能用于本地一侧**，远端一侧只能用 `getlastmodified` + `getcontentlength`（+ `getetag`）。
- **mixed 策略**（**推断**）：本地用内容哈希（免费），远端用 `getlastmodified` + `getcontentlength` + `getetag`（服务端提供）。**这正是「锚点记什么」的实际答案**：记「上次同步时的本地内容哈希 + 远端属性快照」。本地侧比时间戳可靠，远端侧受服务端能力限制。**Nextcloud 的 SHA1/MD5 查询能力（§3.3）如果能用，可以消除远端读全文的需要，值得实测。**

### 9.5 一条推论：锚点的存储位置

**必须是「每台机器私有的、不进同步范围的位置」。** 候选（**推断**）：

- **不能**在库内（会被同步、会互踩、会被外部编辑器看到、会污染 `.obsidian` 式的配置目录语义）。
- **不能**在 `assets/`（那是内容）。
- Electron 的 `app.getPath('userData')` 是天然的位置——它是**每台机器、每个用户**独立的，且天然不进同步范围。代价：**它随应用卸载/重装而丢**（此时走 §9.4(1) 的降级路径）。
- 或者库内的 `.confidant/` 但**在同步时显式排除**——**但 #1 已定「库内配置目录 `.confidant/`，可删可重建」**，而锚点不满足「可重建」（见 9.2）。且 WebDAV 没有 exclude 机制，应用只能在扫描时跳过——**「应用自己跳过」是可以的，但意味着锚点文件在服务端仍然占位、仍然消耗流量、且两台机器会互相覆盖同一份锚点文件**（后者是致命的：锚点描述的是本机视角）。
- **推断的正确做法**：锚点放在 `userData`；`.confidant/` 保留给「可删可重建」的配置（#1 的原有语义不被污染）。**如果非要在库内放，必须按机器名分文件**（`锚点.<机器名>.json`），且应用必须知道「不能读别的机器的锚点」。

---

## 10. 未确证事项（不要在未重新调研前当成事实引用）

- **Synology DSM 的 WebDAV 实现细节**：`Depth: infinity` 支持情况、ETag 语义、是否为 sabre 底座。本轮抓取 Synology Knowledge Center 时只拿到导航外壳（正文由 JS 渲染），未取得一手证据。
- **坚果云 PROPFIND 响应的 XML 结构**：是否有非标准字段、`getetag` 是否存在且稳定、`getlastmodified` 的精度与稳定性。**需要一个真实账号实测**（本轮只能确认端点存在、返回 `401` + `WWW-Authenticate: Basic realm="nutstore"`，以及 `Server: nginx`）。
- **坚果云的分页实现方式**：官方说「支持分多页多次加载」，但**没说分页用什么机制**（HTTP Range？私有头？URL 参数？）。remotely-save 遇到 749 项是**直接抛错**而不是分页——**推断**分页机制不是标准的、或至少不够通用。**需要实测。**
- **`node-diff3` 在大文件上的性能数字**：只有 Joplin 的定性描述（`blocks the UI for seconds on a long note`）+ 它给的超时阈值（`maxEditLength: 5000 / timeout: 1000`）。**没有公开的量化基准。**
- **Obsidian Sync 如何取得三方合并的 base**：官方只说用 diff-match-patch（一个**2 路**库，没有 base 概念）。它如何做「合并」而不是「交织」**无公开信息**。
- **坚果云客户端与 WebDAV 是否共享同一个频率配额**：官方只说「访问频率」（WebDAV 页面）和「流量」（定价页，账号级），两者关系未明确。
- **`If-Match` 在各大服务端的实际支持度**：本轮**未实测**。RFC 4918 强烈推荐它做乐观锁，但没有任何一家被调研的实现**使用**它（Joplin 与 remotely-save 都不用 `If-Match`，都选择「先 GET 比对再 PUT」，即允许一个 TOCTOU 窗口）。**这是个明显的空白**：如果需要真正的乐观锁（而不是「比对后覆盖」），必须实测各服务端对 `If-Match` + 412 的行为。**这条可能是本报告最有价值的待验证项。**
- **Nextcloud 的 SHA1/MD5 哈希查询能力**（rclone 文档提到 `rclone will support SHA1 and MD5 hashes`，但 `Depending on the exact version of ownCloud or Nextcloud hashes may differ`）：能否用它避免下载全文做内容比对。**需实测。**
- **`Depth: infinity` 在坚果云上到底是「不支持」还是「允许但超时」**：remotely-save 的注释写 `the remote doesn't support infinity propfind`，但没有说明观察到的是 403（`propfind-finite-depth`）还是超时/截断。
- **坚果云「750 项」是「每个目录」还是「每次请求」**：官方原文是「单次请求文件数（包含文件和文件夹）为750个」，remotely-save 的实现是按**单个目录的子项数**（`r4.length >= 749`）判断。二者在语义上不完全等价——**推断**按目录理解是对的（PROPFIND 单层深度），但未实证。
