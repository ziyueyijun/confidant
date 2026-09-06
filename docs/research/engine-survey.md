# 编辑引擎现状研究(confidant v1 引擎选型输入)

- 类型:research 票产出(`.scratch/confidant-v1/issues/04-engine-survey.md`)
- 调研日期:2026-09-06(本文件所有「当前/最新」均指此快照)
- 证据纪律:一手来源(官方文档、官方仓库、npm registry、官方 changelog/发布公告)。结论标注为【已核实】(附来源)/【推测】(推断,非来源陈述)/【未验证】(查证不到,不猜不补)。**未做任何基准测试或代码级验证;凡性能、体感类结论一律是推测或未验证。**

## 摘要(结论先行)

- 能承载 Typora 式体验的候选可归四类:**文本内核 + 自研渲染层**(CodeMirror 6)、**结构化富文本内核 + markdown 桥**(ProseMirror 及其上层 TipTap / Milkdown;Lexical 亦可归此)、**完整编辑器/应用**(Vditor、MarkText)、**混合结构**(源码编辑 + 独立实时预览,如传统双栏,作为架构选项而非独立引擎)。
- 许可证全绿:CodeMirror 6、ProseMirror、TipTap、Milkdown、Lexical、MarkText、Vditor、TOAST UI Editor 本次核实均为 **MIT**。TOAST UI Editor 已于 2024-08 归档(不建议)。MarkText 2022–2026 沉寂后于 2026-05 恢复发版(v0.19/v0.20,活跃至今)。
- **建议进入原型验证:TipTap(首选)与 Milkdown(备选,同属 ProseMirror 族,便于对照)。** 详见「结论与原型建议」。CM6 + 自研渲染为第三观察位,仅在「源文 1:1 保真、完全自控」成为硬约束时再抬升优先级。

---

## 1. 候选池总览(快照 2026-09-06)

| 候选 | 类别 | 底层 | 许可证【已核实】 | 维护活跃度(快照)【已核实,源见附录】 |
|---|---|---|---|---|
| CodeMirror 6 | 文本/代码编辑内核 | 自研 | MIT | npm 持续发布:@codemirror/view 6.43.11(2026-09-03);2026-04 开发仓库迁离 GitHub(见 3.1) |
| ProseMirror | 结构化富文本内核 | 自研 | MIT | npm 持续发布:prosemirror-model 1.25.11(2026-07)、prosemirror-markdown 1.13.7(2026-08);同迁离 GitHub |
| TipTap | PM 上层框架 | ProseMirror | MIT | 很活跃:@tiptap/core 3.31.3(2026-09-04),38.3k stars |
| Milkdown | PM 上层框架 | ProseMirror + remark | MIT | 很活跃:@milkdown/kit 7.22.1(2026-08-12),11.9k stars |
| Lexical | 富文本编辑框架 | 自研(Meta) | MIT | 很活跃:@lexical/markdown 0.50.0(2026-09-02),23.8k stars |
| MarkText | 完整桌面应用(Electron) | 自研 muya 引擎 | MIT | 2022-03 后沉寂,2026-05 恢复:v0.19.1(2026-06-06)、v0.20.0-rc(2026-07);提交至 2026-09-04,61.1k stars |
| Vditor | 完整浏览器编辑器组件 | 自研 | MIT | 活跃:v4.0.0(2026-08-30),11.3k stars |
| TOAST UI Editor | 完整编辑器组件 | 自研 | MIT | **已归档**(2024-08 后无活动;GitHub archived=true) |
| Typora / Obsidian | 闭源参照产品 | (不公开) | 闭源 | 只作体验/架构参照,不作候选 |

---

## 2. 评估维度与口径(供选型 HITL 票使用)

- 本票按规格要求的维度盘点:表格编辑、图片粘贴与内联、WYSIWYG 双向编辑/实时预览、性能体感、Electron + React + TypeScript 集成、许可证与维护活跃度,加一列「本地 .md 文件打开即写」适配难点。
- 「Typora 式体验」在本仓库语境下(见 PRODUCT.md 三原则)指:写作与阅读一体、markdown 语法即时渲染、不打断思路。**「WYSIWYG」在此不等于「富文本化」**——这是选型的关键分岔:把 .md 解析成语义文档模型再序列化回写(TipTap/Milkdown/Lexical 路线),与保留源文本、只做渲染层(CM6 路线),对「本地 .md 文件、用户自己管理」的承诺影响不同(见 §6)。该分岔如何裁决属 HITL 决策,本票只列证据。

---

## 3. 逐方案档案

### 3.1 CodeMirror 6(CM6)— 文本内核,「所见即所得」需自研

- 定位:代码/文本编辑器内核。官方 npm 包描述即 "Basic configuration for the CodeMirror code editor";官网 "CodeMirror is a code editor component for the web"【已核实】。markdown 官方语言包 @codemirror/lang-markdown("Markdown language support for the CodeMirror code editor")【已核实】只提供语法高亮等语言支持,不含渲染。
- 许可证与维护:MIT【已核实,官网 + npm license 字段】。2026-04 起 GitHub 仓库归档,开发迁移至自托管 code.haverbeke.berlin(官网 "It is being developed on code.haverbeke.berlin";GitHub codemirror/dev archived + README "has moved to")【已核实】;npm 发布不停(@codemirror/view 2026-09-03 仍发版)【已核实】。
- 能力边界:
  - 所见即所得:无内置。官方文档提供 decoration/widget API(WidgetType 等,见 codemirror.net/docs/ref)【已核实】,理论上可把 markdown 语法渲染为富交互块——即 Obsidian live preview 的做法;**但该渲染层(块级语义、光标语义、表格、图片内联)全部自研,工程量最大,本调研未找到任何开源产品把这条路线做成可复用方案**。降级形态:「源码编辑 + 独立实时预览」双栏或切换式预览是 CM 生态最常见形态。
  - 表格/图片:无内置所见即所得表格或图片粘贴落盘;均需自研(后者只需按 markdown 文本插入与文件写盘,难度中等)。【未验证:无官方内置;此为对包内容与文档的核实结论 + 自研需求推断】
  - 性能:文本内核、文档即字符串,处理大 .md 与外部改文件最直接。【推测:未见官方基准;文本模型的固有优势 + 自研渲染层开销在自己手里】
- 对「本地 .md 文件打开即写」的适配:文档模型 = 源文本本身,天然 1:1 保真(不重排、不吞语法),外部修改/多工具打开无「静默改写」问题——这是它相对 PM 族的结构性优势【推测,但为架构事实】。代价是 Typora 式即时渲染体验要自己造。

### 3.2 ProseMirror(PM)— 结构化富文本内核,markdown 靠官方桥

- 定位:官网自述 "A toolkit for building rich-text editors…implementing a WYSIWYG-style editing interface for documents more constrained and structured than plain HTML",文档结构可自定义(schema)【已核实】。**markdown 不是原生文档模型**——编辑模型是 schema 树,markdown 经官方 prosemirror-markdown 模块双向转换(该模块实现与 CommonMark 对应的 schema + parser/serializer)【已核实】。
- 许可证与维护:MIT【已核实:npm license 字段 + 官方 README "released under an MIT license"】。与 CM6 同期(2026-04)迁离 GitHub 至 code.haverbeke.berlin,开发与 issue 中心在自托管 forge【已核实:GitHub archived + README】;npm 持续发布,prosemirror-tables(官方生态表格模块)2025-12 仍发版【已核实】。
- 能力边界:
  - 所见即所得:内核级 WYSIWYG(内容可编辑),表格可用 prosemirror-tables,图片节点在官方 CommonMark schema 内置(image 节点存在于默认 schema)【已核实:prosemirror-markdown 文档的节点清单】;图片「粘贴 → 落盘 → 插入链接」仍需自写命令(未见内置上传)【未验证/推测】。
  - markdown 保真:官方 schema 只覆盖 CommonMark 核心(默认无表格、脚注、行内 HTML、GFM 扩展);这些语法要么进 schema 扩展,要么在转换时丢/改写【已核实:节点清单不含;后果为推断】。
- 对「本地 .md 打开即写」的适配:打开时解析 .md → schema 树,存盘时序列化回 markdown。源文可能被规范化/重排,自定义语法与 schema 不匹配部分有丢失风险——「用户随时用其他工具打开、可带走」承诺的破坏面在此,需要 round-trip 保真测试把关。【推测:风险判断;具体丢失面取决于所选 schema】

### 3.3 TipTap(PM 上层,首选候选)

- 定位:headless 富文本编辑器框架,官方 README "based on the highly reliable ProseMirror library",扩展制(100+ 扩展),无内置 UI【已核实】。
- 许可证与维护:MIT【已核实:repo LICENSE/徽章】。很活跃:@tiptap/core 3.31.3(2026-09-04)【已核实】;公司化运营(Tiptap Suite / Pro 扩展付费,开源核心 MIT)【已核实:README】。
- markdown 桥(关键新事实,2025-10 之后):**官方开源扩展 @tiptap/markdown**("markdown parser and serializer for tiptap"),2025-10-15 官方发布公告:双向(markdown → 编辑器 JSON、富文本 → markdown)、可 round-trip、CommonMark 合规(基于 markedjs)、模块化可注册自定义 tokenizer;**超出 CommonMark 的语法(如 GFM 表格)与自定义节点需自行注册解析/序列化逻辑**【已核实:官方发布公告 + npm 包】。
- 能力边界:官方扩展齐备——表格(@tiptap/extension-table)、图片(@tiptap/extension-image)随主版本同步发布【已核实 npm】;React 官方绑定 @tiptap/react("React components for tiptap")【已核实 npm】;TypeScript 原生(推测:TS 类型齐全为事实,但未逐项验证)。
- 对「本地 .md 打开即写」的适配:同 PM 族——解析/序列化桥是官方一等能力,CommonMark 内保真目标明确;超 CommonMark(表格、任务列表等 GFM)与保真细则需在原型验证;编辑模型仍是语义树,「源文不重排」不成立(属 PM 族共性,见 §6)。

### 3.4 Milkdown(PM 上层,备选候选)

- 定位:官方仓库自述 "A plugin-driven WYSIWYG markdown editor, inspired by Typora, built on top of prosemirror and remark"【已核实】;官网同述 + MIT 声明【已核实】。v7 起单包 @milkdown/kit + 官方外观 Crepe(@milkdown/crepe 7.22.1)【已核实】。
- 许可证与维护:MIT【已核实:官网页脚 + npm】。活跃:2025 年组织化为 Milkdown org,仓库 2026-09-06 仍有提交,11.9k stars【已核实】;**维护高度依赖核心作者 Mirone 个人(README 为个人募集 sponsor)**【已核实】——bus factor 是风险点【推测】。
- 能力边界:所见即所得 markdown 编辑器定位明确(全池中与 Typora 目标最近的框架)【已核实】。表格:旧版独立包 @milkdown/plugin-table 停在 5.3.1(2021-12);v7 合并进 kit,但**表格节点与编辑交互现状未逐项核实**【未验证】;底层同为 PM,prosemirror-tables 可作后备【推测】。图片上传/粘贴落盘:需自行接线(官方插件体系支持自定义,细节未验证)【未验证】。
- React 集成:框架无关使用(自己起 Crepe 实例嵌入任意前端)【已核实:crepe 为独立包、无框架依赖的定位】;是否有官方 React 组件封装**未验证**。
- 对「本地 .md 打开即写」的适配:与 TipTap 同类(文档模型 + markdown 双向,设计目标即「存的就是 markdown」);其 round-trip 覆盖与保真现状需原型验证【未验证】。

### 3.5 Lexical(Meta,富文本框架)

- 定位:官方仓库 "an extensible text editor framework"(HTML/自定义节点模型)【已核实】;**markdown 非原生**:官方 @lexical/markdown 提供 import/export 与输入快捷键(transformers 机制)【已核实:包 README】。
- 许可证与维护:MIT【已核实】;非常活跃(0.50.0 2026-09-02、facebook 组织、23.8k stars)【已核实】。
- 能力边界:内置 transformers 覆盖有限:列表/代码块/标题/引用(块级)+ 粗斜体/行内码/删除线/链接(文本级)【已核实:README transformers 清单】;表格有官方 @lexical/table 包【已核实】;**表格/图片等自定义节点的 markdown 转换无内置,需自写**【已核实清单不含 → 推断】。markdown 输入主要是「打字即转节点」的快捷键语义(语义转换,不是 Typora 式即时渲染观感)【推测:基于 transformers 机制陈述】。
- 对「本地 .md 打开即写」的适配:pool 中最远——编辑器状态模型与 markdown 的桥最浅(转换器集最小),要把任意 .md(表格/图片/GFM/行内 HTML)保真双向化,自研量在 PM 族之上【推测】。React 官方支持(@lexical/react)未在本次逐项核实【未验证】。

### 3.6 MarkText(完整开源桌面应用,2026 复苏)

- 定位:开源 Typora 式桌面 markdown 编辑器(Electron;实时所见即所得 + Source Code 等模式;README features 明示 "Realtime preview (WYSIWYG)" 与 "Source Code mode")【已核实】。**是完整应用,不是可嵌入组件**。
- 许可证与维护:MIT【已核实:GitHub】。沉寂 2022-03(v0.17.1)至 2026-05 后恢复:v0.19.0(2026-05-28)→ v0.19.1(2026-06-06)→ v0.20.0-beta/rc(2026-06~07 连续发版),提交活跃至 2026-09-04【已核实:releases + commits API】。注意:**2026 恢复后是否只是社区续命、路线图与维护者结构如何,未深入核实**【未验证】。
- 结构(对「作为引擎」的评估关键):monorepo:packages/desktop(Electron 壳,依赖 Vue 生态 element-plus、@intlify 等)+ packages/muya(WYSIWYG 渲染引擎,自研)+ muyajs【已核实:目录与 desktop/package.json 依赖】。桌面端还依赖 codemirror 包(源码模式/预览相关)【已核实:依赖清单】。
- 对本项目的适配:若走「fork MarkText」路线,**技术栈约束冲突明确**:仓库产品文档要求 Electron + React + Vite + TypeScript,而 MarkText 是 Vue 系 + 自研构建;且完整应用改造成「文件树 + 导出 + 首版范围」等于二次开发【已核实栈事实;二次开发量为推断】。表格/图片等能力细节未逐项核实【未验证】。

### 3.7 Vditor(完整浏览器编辑器,官方明示类 Typora 即时渲染)

- 定位:官方自述 "一款浏览器端的 Markdown 编辑器,支持所见即所得、即时渲染(类似 Typora)和分屏预览模式"(wysiwyg / ir / sv 三模式)【已核实:仓库描述 + README】。TypeScript 实现,README 声明可配合原生 JS 及 Vue/React/Angular/Svelte【已核实】。作者为思源笔记同源团队(b3log)【已核实:README 关联声明】。
- 许可证与维护:MIT【已核实】;活跃:v4.0.0(2026-08-30)、11.3k stars【已核实】;维护呈个人/小团队单点形态【推测】。
- 能力边界:README 特性清单:GFM/CommonMark、大纲/数学/图表(流程图、甘特、mermaid 等)、粘贴 HTML 转 markdown、拖拽/剪贴板粘贴上传(CORS 上传接口)【已核实】。三模式中的 IR(即时渲染)即 Typora 式「边写边渲染、语法可见」路线,是**全池中除 Milkdown/MarkText 外唯一官方明示 Typora 式模式的开源方案**【已核实】。表格 WYSIWYG 编辑交互细节、IR 模式边界未逐项核实【未验证】。
- 对本项目的适配:可直接嵌入 Electron+React(自绘 UI 与内核一体,自带工具栏/主题,定制自由度低于内核方案——定制冲突程度未量化)【推测】;图片粘贴设计面向 web「上传接口」,Electron 本地落盘场景需自己接【推测:README 所述上传机制面向服务器;本地写盘需扩展实现】;不是可替换内核,锁进其文档模型与渲染策略。

### 3.8 TOAST UI Editor(已归档,不建议)

- 官方归档:GitHub archived=true、2024-08-01 后无提交【已核实】。MIT【已核实】。仅列入排除理由,不再展开。

### 3.9 闭源参照(Typora / Obsidian)

- Typora:体验基准(本产品三原则的参照物),引擎闭源不可考【已核实:商业闭源为常识级事实——按纪律标注:其官网定位商业软件,引擎不公开;未进一步核实】。
- Obsidian:商业(免费增值)闭源桌面笔记。官方 changelog(2026 条目)明示 "Upgraded CodeMirror to the latest version"【已核实】——即 Obsidian 编辑层内嵌 CodeMirror 并随上游升级;**它是「CM 路线上做 live preview」的大规模产品级佐证**。但「Obsidian live preview 即基于 CM6 的 decoration 渲染」的架构细节**未验证**(官方旧版 changelog 条目本次未取到;社区二手说法不引)。

---

## 4. 能力边界矩阵

图例:✅=方案本身/官方提供;🟡=需自研或扩展;❌=无/不适合;?=未验证。括号内给依据性质(详见 §3 与附录)。

| 维度 | CM6 | PM(裸) | TipTap | Milkdown | Lexical | MarkText | Vditor |
|---|---|---|---|---|---|---|---|
| 类别定位 | 文本内核 | 富文本内核 | PM 上层框架 | PM 上层框架 | 富文本框架 | 完整应用(Electron) | 完整组件 |
| Typora 式即时渲染 | 无,自研 🟡 | 无,自研 🟡 | 需自建桥与体验 🟡 | 官方定位即 WYSIWYG md ✅ | 打字即转节点(语义转换)🟡 | 官方实时 WYSIWYG ✅ | 官方 IR 模式(明示类 Typora)✅ |
| 表格编辑 | 无 🟡 | prosemirror-tables ✅ | 官方扩展 ✅ | v7 合并入 kit,细节 ? | 官方 @lexical/table 节点 ✅(md 转换自研) | 产品含表格(细节?) | GFM 表格 ✅(IR 交互细节 ?) |
| 图片粘贴/内联 | 无,自研(落盘易)🟡 | 节点内置 ✅,粘贴落盘自研 🟡 | 官方 image 扩展 + 自定义上传 🟡 | 需接线 🟡 | 无官方节点(?)🟡 | 产品已解决 ✅(路径细节?) | 粘贴上传针对 web 接口 🟡 |
| 双向编辑(md→doc→md) | 不需要(文本即源)✅* | prosemirror-markdown 官方桥 ✅(CommonMark) | 官方 @tiptap/markdown 双向(2025-10)✅ | 设计目标即 md 文档模型 ✅(细节 ?) | @lexical/markdown 转换器集有限 🟡 | 产品内闭环 ✅ | 产品内闭环 ✅ |
| 源文保真(不重排/不吞语法) | 结构性最好 ✅* | 需 schema 覆盖与测试 🟡 | 同 PM 🟡 | 同 PM 🟡 | 最弱 🟡 | 未验证 ? | 未验证 ? |
| 性能体感(大 .md) | 文本模型稳【推测】 | 结构树开销【推测】 | 同 PM+扩展面【推测】 | 同 PM【推测】 | 宣称性能好,无基准【推测】 | 产品级(未测) | 产品级(未测) |
| Electron+React+TS 集成 | React 绑定自包 🟡 | 自包 🟡 | 官方 @tiptap/react ✅ | 框架无关 Crepe;官方 React 包 ? | @lexical/react(未逐项核)? | 技术栈冲突(Vue 系)❌ | 组件级嵌入 ✅(定制受限 🟡) |
| 许可证 | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ | MIT ✅ |
| 维护活跃(2026-09 快照) | ✅(npm 持续发版;仓库迁自托管) | ✅(同上) | ✅ 公司化+社区 | ✅ 个人主导(风险🟡) | ✅ Meta 组织 | 2026 复苏 ✅(结构未明 ?) | ✅ 个人/小团队(风险🟡) |

\* 注:CM6 行「不需要双向编辑」= 文档模型即源文本,语法保真天然;代价是 Typora 式体验层自研(§3.1)。

---

## 5. 各方案「本地 .md、打开即写」适配难点归纳

- **PM 族(TipTap/Milkdown,及裸 PM)**:共性难点是「md ↔ 语义树」的保真与覆盖——打开任意 .md(含表格/任务列表/行内 HTML/脚注等)不丢不错,存盘不重排用户原文到可感知程度;需定义「保真验收集」。TipTap 官方桥(2025-10)已把 CommonMark 内双向做成官方能力,超 CommonMark 需自注册——原型里要实测表格 round-trip。
- **CM6**:没有现成 Typora 式层;若要真所见即所得,自研渲染层(块渲染、光标语义、表格/图片交互)是数月级投入【推测:工程量判断】;降级双栏预览则体验达不到 Typora 参照面。
- **Lexical**:markdown 桥最浅,把「任意 .md 保真打开再写回」做扎实的自研量在 PM 族之上【推测】。
- **MarkText(fork 路线)**:已有成品体验,但整体是应用非引擎,且 Vue 技术栈与本仓库约束冲突;改造量与长期维护(2026 复苏后社区结构)未明。
- **Vditor(嵌入路线)**:最快拿到「Typora 式 IR」成品能力,但整组件自带 UI/行为,深度定制与「文件树+导出」整合自由度低;图片机制面向 web 上传、本地落盘要改。

---

## 6. 结论与原型建议

**建议进入原型验证的 1–2 名:TipTap(首选)+ Milkdown(备选对照)。**

理由(证据驱动):

1. **唯一官方给出「markdown 双向」资产的活跃 PM 上层是 TipTap**(@tiptap/markdown,2025-10-15 官方公告:双向、CommonMark 合规、模块化;表格/图片/React 绑定全为官方包,全部 MIT)【已核实】;Milkdown 是同一内核族中唯一把「Typora 式 WYSIWYG + markdown 文档模型」写进官方定位的框架【已核实】。二者同属 PM 族,原型可对照同一组验收项(round-trip 保真、表格、粘贴图片落盘、大文件),一次评估两条候选路线。
2. 许可证与集成约束满足:MIT;React/TS 一等或一等可用;npm 活跃发布中【已核实】。
3. CM6 路线(Obsidian 同源做法)与 Lexical 路线列第三观察位,不推荐 v1 首采:前者把 Typora 式体验层全部变成自研资产,后者 markdown 双向缺口最大(§3.5);若后续 HITL 把「源文 1:1 不重排」定为硬约束,**优先级应反转:CM6 + 自研渲染/或源码+预览双栏成为主候选**——这正是本票要留给决策票的分岔(§2)。

风险与原型验证要点(逐条会在后续原型票中落地):

- **round-trip 保真**:GFM 表格、任务列表、行内 HTML、脚注、frontmatter 在「打开→编辑→保存」后是否不丢不错、可接受程度的重排——TipTap 需实测超 CommonMark 部分的自注册负担;Milkdown 需核实 v7 kit 表格现状。
- **图片粘贴落盘**:桌面本地场景(剪贴板 → 写盘 → 插入相对/绝对路径)两方案都需自接,原型须验证。
- **大文件与性能体感**:未做基准,原型阶段对 >1MB .md 与超长文档做体感与输入延迟测试。
- **维护面**:TipTap 公司化(开源核心 MIT,Pro 付费扩展)与 Milkdown 个人主导(bus factor)均为真实风险,原型阶段各留书面评估。
- **快捷键与既有编辑语义**:PM 族无开箱「Markdown 快捷键集」承诺,大众用户期望的 Ctrl+B 等需在原型确认覆盖(TipTap 有扩展体系,具体覆盖面原型验证)。

---

## 附录 A:本次核实的一手来源(均访问于 2026-09-06)

1. GitHub REST API(github.com 官方):仓库元数据/readme/releases/commits——codemirror/dev(archived)、ProseMirror/prosemirror(archived+README "released under an MIT license"+迁移声明)、facebook/lexical、ueberdosis/tiptap(README、packages/markdown)、Milkdown/milkdown(README "inspired by Typora, built on top of prosemirror and remark")、marktext/marktext(README、releases 时间线、packages/desktop/package.json 依赖、packages/muya 目录)、Vanessa219/vditor(README 中文版)、nhn/tui.editor(archived)。
2. npm registry(registry.npmjs.org):codemirror/@codemirror/view/@codemirror/lang-markdown、prosemirror-model/prosemirror-markdown/prosemirror-tables、@tiptap/core/@tiptap/markdown/@tiptap/extension-table/@tiptap/extension-image/@tiptap/react、milkdown/@milkdown/kit/@milkdown/crepe/@milkdown/plugin-table、@lexical/markdown/@lexical/table、vditor——各包 license 字段、最新版本与发布时间。
3. codemirror.net(官网):"open source under a permissive license (MIT)"、"being developed on code.haverbeke.berlin";docs/ref 页含 WidgetType(decoration API)。
4. prosemirror.net(官网):toolkit 定位、schema/协作特性。
5. tiptap.dev 官方发布公告 "Introducing bidirectional Markdown support in Tiptap"(2025-10-15,Philip Isik):@tiptap/markdown 双向、CommonMark 合规(markedjs)、超 CommonMark 需自定义注册。
6. milkdown.dev(官网):"plugin driven framework to build WYSIWYG Markdown editor"、"built on top of ProseMirror, Y.js, and Remark"、MIT 页脚。
7. obsidian.md/changelog(官方 changelog 页):"Upgraded CodeMirror to the latest version"(2026 条目)——用于 Obsidian 内嵌 CodeMirror 并随上游升级的声明。

## 附录 B:2025-10 之后的重要时间线事实(超出模型训练常识,均见上列来源)

- 2025-10-15:TipTap 发布官方开源 @tiptap/markdown(双向、CommonMark 合规)。
- 2026-04:CodeMirror 与 ProseMirror 的 GitHub 开发仓库归档,开发/issue 迁至 code.haverbeke.berlin(自托管);npm 发布渠道持续。
- 2026-05~07:MarkText 沉寂 4 年后恢复:v0.19.0/v0.19.1/v0.20.0-rc 连续发版。
- 2026-08:vditor 4.0.0;Milkdown 组织化后 @milkdown/kit/crepe 7.22.1 持续发布。

## 推测与未验证清单(收尾自检)

- 性能体感全部条目:未做基准,【推测】/【未验证】。
- Obsidian 编辑器与 CM6 的具体架构关系:官方旧 changelog 条目未取到,【未验证】。
- Milkdown v7 表格支持现状、Vditor IR 模式表格交互细节、MarkText 表格/图片交互细节:【未验证】。
- Lexical 官方 React 包(@lexical/react)与图片节点:本次未逐项核实,【未验证】。
- MarkText 2026 复苏的维护者结构与路线图:【未验证】。
- 「PM 族源文会重排/规范化的程度」「fork MarkText 改造量」「CM6 自研渲染层为数月级投入」等为架构判断,【推测】。
