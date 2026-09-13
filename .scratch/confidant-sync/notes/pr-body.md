## 这是什么

实现 [`.scratch/confidant-sync/spec.md`](../blob/master/.scratch/confidant-sync/spec.md)（WebDAV 同步规格）的单一分支。

规格的 68 条决议由 [`.scratch/confidant-sync/issues/`](../tree/master/.scratch/confidant-sync/issues) 下的实施票落地。工作项以**本地 markdown** 跟踪，不使用 GitHub Issues——所以本 PR 不关联、也不关闭任何 GitHub issue，票的收官写回票文件本身。

## 票与依赖形状

```
01a ──┬─→ 02 ──→ 03 ──┬─→ 04 ─┐
01b ──┘               ├─→ 05 ─┤
                      ├─→ 06 ─┼─→ 08（人工验收，本 PR 不做）
                      └─→ 07 ─┘
```

- **01a** sync 功能包与自研 WebDAV 客户端（`packages/sync` + `packages/webfake`）
- **01b** 凭据存储、IPC 与同步设置对话框
- **02** 首次同步——保守合并，带进度与取消
- **03** 增量同步——变更探测
- **04** 冲突——保留双份
- **05** 删除传播与保护
- **06** 边界与失败处理
- **07** 启动探测与收尾提示

原票 01 贴着上下文预算上限，动工前按「包 / 应用」这条缝拆成 01a 与 01b，依据见 [`.scratch/confidant-sync/issues/00-split-note.md`](../blob/master/.scratch/confidant-sync/issues/00-split-note.md)。这不改变任何规格口径。

## ⚠️ 票 08 保持 open —— 这是人工验收入口

[票 08「真机验收——绿联 NAS」](../blob/master/.scratch/confidant-sync/issues/08-real-device-verification-ugreen-nas.md) **无法由 agent 完成**：

- 它需要**用户本人**的 NAS 地址与凭据；
- 清单里的「人工验收：用户本人在真实 NAS 上确认全流程可用」只能由人来判；
- 规格 Further Notes 的「待验证清单」（Nextcloud / 坚果云 / 群晖 / mod_dav / Alist / rclone serve）需要真账号逐项补验。

因此本 PR **不包含、也不会编造**任何真机验收结果。01–07 完成后本 PR 转正，票 08 留给用户本人接手；真机脚本（环境变量驱动，复用仓库现有自检/冒烟模式）由本 PR 落地，用户拿到账号即可直接跑。

## 范围外（规格已裁定）

内容加密、版本历史、自动三方合并、差异对比面板、远端目录浏览器、自定义排除规则、定时轮询、自动同步、并发请求、改名识别、服务端特判分支、单向模式、目录级原子提交。

## 质量门

每票收尾跑：`npm run typecheck`、`npm test`、`npm run lint:boundaries`。

## 最危险的失败模式

**这个功能会删用户的笔记。** 删除传播、冲突判定、熔断与列举闸门是全部保护措施的来源；报错信息与日志里不得出现密码。

实现约定与既有事实陷阱见 [`.scratch/confidant-sync/notes/00-engineering-brief.md`](../blob/master/.scratch/confidant-sync/notes/00-engineering-brief.md)。
