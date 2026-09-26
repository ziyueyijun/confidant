# confidant

本地优先的个人知识管理桌面应用**知己笔记**。笔记是用户自己的纯 Markdown 文件。

**命名**：中文名 **知己笔记**，英文名 **`confidant`**——名字本身就是这四个字与这九个字母，不加任何装饰标记。命令行、包名、路径、appId 一律用 `confidant`。

## 当前状态

**规划已完成：spec 定稿；生产实现尚未开始，当前的工作面是 `prototype/` 的迭代。**

- **[`docs/spec.md`](docs/spec.md) 是开工依据**——覆盖 MVP 的完整 spec：要做什么、怎么做、怎么算做完。动手前读它，不要从零推导。
- 规划过程的决策与理由在 [wayfinder map](https://github.com/ziyueyijun/confidant/issues/20)（#20）下逐项归档；**16 张票全部解决，无待决项**。
- **验收标准是一条使用承诺，不是功能清单**：用两周真实地只用它（spec §9）。

## 命令

都在 `prototype/` 里跑（先 `cd prototype`）：

- `npm run dev` —— 开发服务器，默认 5178 端口（`PORT` 环境变量可覆盖）；从仓库根等价于 `npm --prefix prototype run dev`
- `npx playwright test` —— 全部测试；会自己拉起 dev server（5173，已在跑则复用），不必先开
- `npx playwright test tests/theme.spec.ts` —— 单个文件；再加 `-g "浅色模式下光标"` 按标题筛单个用例
- `npx tsc --noEmit` —— 类型检查（tsconfig 只含 `src/`，不含 `tests/`）
- `npm run build` —— 生产构建到 `prototype/dist/`；原型平时不需要它，改完样式可以跑一次确认没有构建期报错
- `node scripts/build-fonts.mjs` —— 重建网页字体；产物（`public/fonts/`，约 8MB）与中间缓存（`.font-cache/`，约 190MB）都不入库，缺了再跑

没有 lint——ESLint + Prettier 是生产阶段的事（spec §4.1）。

用预览面板起服务时走 `.claude/launch.json` 的 `prototype` 启动项（5178，autoPort），不必手敲上面的命令。

## 何时读什么

| 触发条件 | 材料 |
|---|---|
| **要开始实现任何东西** | `docs/spec.md` —— 开工依据。先读对应章节（§4 架构与硬约束、§8 已验的界面路径），再动手 |
| 要命名任何东西（issue、代码、文档、变量） | `CONTEXT.md` —— 术语表。用它的词，别漂移到 `_Avoid_` 列出的同义词 |
| 要做架构决策，或质疑某个既有做法 | `docs/adr/` —— 已定决策与理由。先确认不是重复踩坑 |
| 要断言任何技术事实 | `docs/research/` —— **事实基座**。`0001` 是索引式总集（含大量实机实测数据），其余是专项调研。查过再开口，不要重复调研 |
| 要写 issue、文档、提交信息 | `docs/agents/privacy.md` —— **本仓库公开**，绝不写入路径、凭据、机器指纹、第三方信息、版权内容 |

**一条容易踩的边界**：spec 记录的是**已定的事**；若实现中发现某条决策站不住，**先回去看它的来源票与 ADR**（理由都在那里），而不是就地改 spec。改 spec 意味着那条决策被推翻，应当在对应票或新票上留下记录。

## 原型

**原型不是生产代码**：`prototype/` 是**一个界面**的交互验证（文件树 / 标签页 / 编辑器 / 大纲 / 同步），用完即弃。实现时**重写**，不要直接搬——原型是在「无测试、最少错误处理」的约束下写的。它的价值是**验证过的结论**，那些已在 spec 里。它与文档同属这一个仓库、同一份历史（`prototype/.git` 是空目录残留，不是子仓库）。

**结构**：`AppShell.tsx` 是外壳；同步是它内部的一个 feature（`sync/SyncFeature.tsx`），不是并列的形态。底部悬浮的 `ControlBar` 只是实验开关，生产构建会删掉；实验变量同时走 URL 参数（`?reveal=&source=&tables=&scenario=`）和键盘（← → 切同步场景）。编辑器内核是 `editor/markdownLivePreview.ts`——CodeMirror 6 扩展：光标行显示语法、其余行按渲染显示，表格是可编辑 widget 且写回 Markdown；标签与分屏在 `editor/useWorkspace.ts`（`saved` 字段充当「磁盘」，分屏是移动语义）。数据全在内存（`data.ts` / `sync/data.ts`），界面上的每条约束都来自某张票的决议，不要随手加。

**设计系统**：视觉方向的出处是 `design-proposal.html`（原型根目录，已入库）——它自己就写着「本页自己就用提案里的 token」，提案是什么样它就长什么样，动配色先看它。落地在 `src/index.css` 顶部的 CSS 变量（配色「墨与纸」、面的三层、线的两档、圆角 4/8/12 的语义），Tailwind 直接读这些变量——**注释就是设计文档**，改样式要连注释一起改。改动限**视觉**（圆角 / 颜色 / 线 / 面），**不动布局**：布局是验证过的结论，已在 spec §8。

**测试**：Playwright，夹具在 `tests/fixtures.ts`——`open`（开原型并载入语法全集）、`editor`、`toggle`（按文案拨控制条开关）、`theme` / `currentTheme`，以及 `scrollTo`（把 scroller 滚到位，逼虚拟滚动把对应位置的 widget 渲进 DOM；断言表格或远处的行之前必须先调它）。编辑器状态一律读 `window.__cmDebug.view`，不数 DOM。**交互必须用真实输入**（`page.keyboard` / `mouse`）——合成 `dispatchEvent` 测不出 editing host 这类真实 bug（spec §8.1 的教训）。对比度断言用 `tests/utils.ts` 的 WCAG 工具。临时探针写成 `tests/_*.spec.ts`，用完删。

## 工作方式

Issue 在 GitHub Issues，用 `gh` CLI。创建、读取、关闭的约定见 `docs/agents/issue-tracker.md`；工作流标签见 `docs/agents/triage-labels.md`；域文档的组织约定见 `docs/agents/domain.md`。

提交信息用中文，常用「原型：」「文档：」前缀（见 `git log`）。

`.claude/skills/` 下有一套第三方 skill（来源与哈希在 `skills-lock.json`，可据此重装；两者都不入库，见 `.gitignore`，所以新克隆里没有）。其中和本仓库流程相关的是 `implement-spec`、`to-spec`、`to-tickets`、`grill-with-docs`、`prototype`、`research`——要开新工作前值得先看一眼有没有现成的。
