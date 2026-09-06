# 22: 巨型文件拆分(核心债·App.tsx)

**What to build:** 清偿 tech-debt.md 第 1 条 App.tsx 部分(1669 行单组件 ~35 useCallback)。按域把编排逻辑抽成 hook/模块、把浮层 JSX 抽成组件,App.tsx 收敛为装配层。**对外行为、状态流、命名均不变**;不做重构之外的任何行为修正(发现的行为问题另行登记,不混入本票)。

- 拆分域(tech-debt 建议 + 工单归属):主题(18)、启动恢复(13)、文件操作编排(10-12)、菜单接线(03)、浮层 JSX(07/14-15 查找面板/搜索面板/段落菜单等)。
- 落点:同目录或 `src/renderer/src/hooks/`/既有 `components/` 分域文件;命名与现有 editor/menu/workspace 平级。
- 不变量:不引入新依赖、不改变 useEffect 触发时机与依赖序(行为等价,typecheck + 全量测试 + smoke 为闸);巨型组件拆分不得引入「每渲染重建 hook 状态」类回归。
- 拆完登记:tech-debt.md 第 1 条勾销;文件行数留档(拆后 App.tsx 应回落到装配层规模)。

**Blocked by:** None(纯重构,单测/竖切全绿基线上进行)。

**Status:** ready-for-agent

- [x] `npm run typecheck` 通过;`npm test` 全量绿(135;拆分不动纯逻辑,矩阵为回归网)。
- [x] `npm run lint:boundaries` 0 违规(97 modules / 170 dependencies;新增 hooks/ 目录合规)。
- [x] 拆分后各域职责可读:每文件首部注释标工单归属;App.tsx 收敛(1669 → 537 行,装配+会话核心)。
- [x] smoke 复验:CONFIDANT_SMOKE=1 首屏探针通过;CONFIDANT_E2E_FILE 编辑竖切(自动保存/菜单保存/关窗落盘磁盘校验)通过。

## 实现记录(22)

- 提交(切片式,全部 `refactor(22)`):切片 1-2(壳组件与会话类型上移;主题/侧栏 hook)、3(树展开记忆/外部删除处置)、4(引擎宿主事件面 useEditorHost)、5(文件操作编排 useFileOperations)、6(菜单接线/最近打开/启动恢复)。
- 拆分落点:
  - `components/`:`TopBar`(顶栏)、`Welcome`(欢迎页)、`OverlayBanners`(DocMissingBanner + ChangeNoticeToast)、`EmptyStates`(空态引导);`session/types.ts`(OpenNote/ChangeNotice)、`session/ops-shared.ts`(错误文案/自身回声守卫/空保存态)。
  - `hooks/`:`use-app-theme`(18)、`use-sidebar-layout`(04)、`use-tree-expansion`(04/13)、`use-doc-missing`(12)、`use-editor-host`(02/05/06/09/16/17 事件面)、`use-file-operations`(10-12)、`use-menu-bridge-registration`(03)、`use-recent-folders`(13)、`use-startup-recovery`(13)。
- 模式:挂载一次 effect + 稳定 refs/回调(原结构即如此);hook 之间经 ref 捆绑 + 稳定回调传参,不引入新订阅顺序变化;行为由 smoke/E2E 真机竖切验证。
- 留档:App.tsx 537 行(原 1669);域边界与 tech-debt 原建议略有差异——「外部变更处置(12)/工作区会话」留在 App(会话核心),抽离以参考依赖图为据,详见各文件头注释。
- 陷阱登记:PS/脚本拼文件时引号转义与全角注释易错位,已逐字修复;菜单注册 hook 的参数经渲染期求值,调用点必须排在依赖 const 声明之后(TDZ),与旧 effect 的延迟求值不同——拆分时注意 hook 调用点顺序。
