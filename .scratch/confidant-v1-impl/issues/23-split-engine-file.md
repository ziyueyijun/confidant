# 23: 巨型文件拆分(核心债·engine.ts)

**What to build:** 清偿 tech-debt.md 第 1 条 engine.ts 部分(1009 行)。按域把插件/命令/工具抽成**同包内私有模块**(packages/engine/lib/ 下),入口点(index.ts 导出面)与既有公开 API 不变,deep-module 规则不变(包外仍只能 import 包根)。

- 拆分域(tech-debt 建议 + 工单归属):查找高亮插件(14)、标题锚点(16)、表格/任务结构化命令与键盘语义(09)——抽为同包私有模块,engine.ts 只留 createEngine 装配与共享工具。
- 纯逻辑不变式:normalization-matrix / roundtrip 等往返矩阵测试全绿为唯一硬闸(字节保真、语法不静默丢);不顺手改行为。
- 若拆分中发现「finalizeMarkdown vs ensureSingleTrailingNewline」类跨层重复,只在本票登记位置清单,统一上收归 24(避免两票重叠改同一函数)。

**Blocked by:** None(纯重构,引擎往返矩阵测试全绿基线上进行)。

**Status:** ready-for-agent

- [ ] `npm run typecheck` 通过;`npm test` 全量绿(矩阵为回归网,重点 packages/engine/tests)。
- [ ] `npm run lint:boundaries` 0 违规。
- [ ] engine.ts 收敛到装配层规模(行数留档);各私有模块职责与工单归属注释。
- [ ] 新发现的跨层重复登记至 24 票清单(如有)。

## 实现记录(23)

- 提交:`refactor(23): …`。
