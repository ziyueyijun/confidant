# 22: 巨型文件拆分(核心债·App.tsx)

**What to build:** 清偿 tech-debt.md 第 1 条 App.tsx 部分(1669 行单组件 ~35 useCallback)。按域把编排逻辑抽成 hook/模块、把浮层 JSX 抽成组件,App.tsx 收敛为装配层。**对外行为、状态流、命名均不变**;不做重构之外的任何行为修正(发现的行为问题另行登记,不混入本票)。

- 拆分域(tech-debt 建议 + 工单归属):主题(18)、启动恢复(13)、文件操作编排(10-12)、菜单接线(03)、浮层 JSX(07/14-15 查找面板/搜索面板/段落菜单等)。
- 落点:同目录或 `src/renderer/src/hooks/`/既有 `components/` 分域文件;命名与现有 editor/menu/workspace 平级。
- 不变量:不引入新依赖、不改变 useEffect 触发时机与依赖序(行为等价,typecheck + 全量测试 + smoke 为闸);巨型组件拆分不得引入「每渲染重建 hook 状态」类回归。
- 拆完登记:tech-debt.md 第 1 条勾销;文件行数留档(拆后 App.tsx 应回落到装配层规模)。

**Blocked by:** None(纯重构,单测/竖切全绿基线上进行)。

**Status:** ready-for-agent

- [ ] `npm run typecheck` 通过;`npm test` 全量绿(拆分不动纯逻辑,矩阵为回归网)。
- [ ] `npm run lint:boundaries` 0 违规(新增文件遵守 deep-module/包边界)。
- [ ] 拆分后各域职责可读:每域文件首部注释标工单归属;App.tsx 收敛为装配层(行数留档)。
- [ ] smoke 复验:CONFIDANT_SMOKE=1 首屏探针通过(行为等价证据)。

## 实现记录(22)

- 提交:`refactor(22): …`。
