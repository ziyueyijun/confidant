# 地图:confidant(知己笔记)v1 规格

## Destination

首版(v1)规格已锁定并落盘于本 effort 的 `spec.md`,可直接指导后续实现 effort 开工:以已确认三件套(文件树侧栏 + 所见即所得 Markdown 编辑 + 导出)为核心,以 Typora 功能面为候选清单逐项裁决进/出并锁定关键交互。规格详度标尺:每项裁决有结论与依据,关键交互含边界情形与文案;不做到像素级 UI 详设。

## Notes

- 领域:本地优先、所见即所得 Markdown 桌面编辑器(Electron + React + Vite + TypeScript,Windows 为首验环境);数据即磁盘上普通的本地 `.md` 文件。参照基线:Typora。产品三原则(见 PRODUCT.md):本地优先、所见即所得、大众可用。
- 语言:地图、票、决议均用中文;代码标识符、路径、slugs 保留英文。
- 仓库现状:无产品代码,仅有工程骨架(`packages/example` 占位)。功能包一律为 deep module,边界规则见 `packages/README.md`(入口点/私有实现/禁止 barrel)。
- 证据纪律:仓库没有任何用户调研、竞品、原型证据;票的结论不得凭空编造证据,涉及用户侧主张需标注来源或由 grilling 现场确认。
- 票型约定(本地 tracker):子票在 `issues/NN-<slug>.md`,`Type:` 行为 `research`/`prototype`/`grilling`/`task`;`Status:` 行为 `open`/`claimed`/`resolved`;阻塞写 `Blocked by: NN, NN`。HITL 票(grilling/prototype)需用户在可交互会话中推进;AFK 票(research)由子代理独立推进。
- 常规技能:HITL 票执行时调用 grilling 与 domain-modeling;需要廉价实物作讨论对象的票开 prototype;研究票调用 research 并由子代理执行。
- 目的地落盘点:地图走完、路线全清后,规格写入 `.scratch/confidant-v1/spec.md`;实现 effort 接手时随迁。

## Decisions so far

<!-- 索引:每个已关闭票一行——名称(链接)+ 一行要点。决议只活在票里,这里只做指引。 -->

- [编辑引擎现状研究](issues/04-engine-survey.md):候选八项均 MIT(TOAST UI 已归档),建议原型验证 TipTap(首选)+ Milkdown(备选);「源文 1:1 保真」若成硬约束则 CM6 路线反转。详见 docs/research/engine-survey.md。
- [平台范围](issues/01-platform-range.md):首版仅 Windows(Win10/11,跟随 Electron 支持面);规格平台条目按单平台写死;Linux 划出,macOS 不承诺、不规划,结构不堵死但规格不留位。
- [首版用户画像](issues/02-persona.md):唯一核心画像 P1(全维度假设标注)——非技术中文记录者、主题文件夹树状组织、简体中文单语言;服务边界规则=大众可用>极客扩展;规格开篇一章 + 统一依据句式「对 P1 的<场景/习惯>是否有价值」;附假设检验清单(产品可用后执行)。

## Not yet specified

<!-- 在途 fog:朝向目的地、尚不足以精确成票的部分;frontier 推进后逐块毕业成票,毕业一块清一块。 -->

- Typora 候选功能面的逐项进/出仲裁:表格、图片粘贴与存放、全文搜索、主题与外观自定义、大纲/侧边面板、数学公式、脚注/TOC、拼写检查、字数统计等 → 待 03 范围裁决标准落定后按主题拆票;裁决判据引用画像 P1(02 决议)与统一句式。
- 编辑面深层交互(块级操作、光标语义、快捷键集):依赖引擎选型(07 编辑引擎选型)落定,落定后按主题拆票。
- 导出格式与导出管线的具体形态(三件套内含项):依赖引擎研究与能力仲裁。
- 应用壳范围:菜单栏、设置面板、托盘、自动更新、启动页是否纳入规格 → 待裁决标准。

## Out of scope

<!-- 本 effort 有意划出:永不毕业,除非目的地重画。 -->

- 云同步/多端:与「本地优先」原则直接相抵(数据必须是用户自己管理的本地 .md 文件)。
- 多人协作:单机编辑器的目标之外。
- `.md` 之外的源格式支持(如 .txt/.org 导入):偏离「数据就是 .md 文件」承诺。
- Linux 版(决议于 [平台范围](issues/01-platform-range.md)):首版仅 Windows;Typora 提供 Linux 版只是交互参照,不构成发行平台义务。

<!-- 前三项为建图时用户确认划出;Linux 一项随 01 票决议划出。 -->
