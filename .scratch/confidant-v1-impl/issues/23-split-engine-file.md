# 23: 巨型文件拆分(核心债·engine.ts)

**What to build:** 清偿 tech-debt.md 第 1 条 engine.ts 部分(1009 行)。按域把插件/命令/工具抽成**同包内私有模块**(packages/engine/lib/ 下),入口点(index.ts 导出面)与既有公开 API 不变,deep-module 规则不变(包外仍只能 import 包根)。

- 拆分域(tech-debt 建议 + 工单归属):查找高亮插件(14)、标题锚点(16)、表格/任务结构化命令与键盘语义(09)——抽为同包私有模块,engine.ts 只留 createEngine 装配与共享工具。
- 纯逻辑不变式:normalization-matrix / roundtrip 等往返矩阵测试全绿为唯一硬闸(字节保真、语法不静默丢);不顺手改行为。
- 若拆分中发现「finalizeMarkdown vs ensureSingleTrailingNewline」类跨层重复,只在本票登记位置清单,统一上收归 24(避免两票重叠改同一函数)。

**Blocked by:** None(纯重构,引擎往返矩阵测试全绿基线上进行)。

**Status:** ready-for-agent

- [x] `npm run typecheck` 通过;`npm test` 全量绿(135;重点 packages/engine 往返/结构矩阵)。
- [x] `npm run lint:boundaries` 0 违规(107 modules / 192 dependencies)。
- [x] engine.ts 1009 → 631 行;各私有模块头注释标工单归属。
- [x] finalizeMarkdown 与渲染层尾换行兜底重复 → 记入 24(已清偿,单一实现归 engine)。

## 实现记录(23)

- 提交:`refactor(23): engine.ts 拆分…`(aef1cf9)。
- 拆分落点(同包 lib/ 私有模块):`search-highlight.ts`(14 高亮插件 + SEARCH_KEY)、`extensions.ts`(显式清单工厂 + ImageUrlResolver + Image NodeView)、`keyboard.ts`(makeEditor:Tab/表格末行回车/任务缩进键)、`link-range.ts`(linkRangeAt + LinkInfo 类型,engine 转发导出)、`task-list-ops.ts`(toggleCheckedViaDom/moveTaskItem)。
- createEngine 仍为桥封装主体(~490 行)——命令方法多直接 chain 调用,进一步域拆分收益低且风险高,留档建议:后续清理票可把纯 chain 方法再分组,当前不做(矩阵与 smoke/E2E 已复验行为)。
- 验证:135 单测、boundaries、重打包后 smoke + E2E 竖切全过。
