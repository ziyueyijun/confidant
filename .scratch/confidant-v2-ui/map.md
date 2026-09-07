# Map: 仿 Typora 界面改造（confidant-v2-ui）

由 /wayfinder 于 2026-09-07 建立。effort 名称「confidant-v2-ui」，范围为本仓库界面的 Typora 化改造蓝图。

## Destination

一份「仿 Typora」界面改造蓝图：窗口骨架与菜单结构、三主题系统、编辑区排版、视图模式、大纲面板、状态信息条、自有浮层重设计的完整规格与决策记录（含取舍理由与对照验收清单），足以直接驱动实施。蓝图产出后作为 confidant-v2 范围裁决的输入；实施由蓝图驱动另行推进。

## Notes

- 领域：Typora 式本地优先桌面笔记的界面与操作方式。代码框架（Electron + React + Vite 结构、引擎与包边界）不动，只改界面与操作方式。
- 参照物：本机 Typora 42.2.0（`D:\Program Files\Typora`），资源已解包可读；视觉基线提取自其 github/night/newsprint 三主题 CSS 与窗口样式（票 01-typora-visual-baseline）。
- 已定口径（charting 对话决议，票 01 之外均为对话直接裁定，记录于此）：
  - 视觉仿「布局与交互」，不复制 Typora 主题文件（商业软件版权边界）；配色/字体/主题为 confidant 自己的实现。
  - 参照基线 = Typora github 主题（用户默认观感）。
  - 范围：菜单骨架 + 格式工具栏（形态与位置待票 02 裁决——research 实测 Typora 42.2 为**底部悬浮胶囊工具栏**，非顶部）、侧边栏（文件/大纲双 tab）、编辑区纸张感排版（约 860px 上限，Typora 实测分级 860/1024/1200px）、三主题系统（github 风亮色默认 / night 风深色 / newsprint 风纸感，「主题」菜单切换）、视图模式（专注 + 打字机）、右下角状态信息（字数 + 光标段落类型）、自有浮层重设计（搜索改顶部条、链接面板与代码块复制按钮保留并主题化）。
  - 终点为蓝图而非实施：本 map 只做决议，不做界面改动。
- 每个 grilling 票：先调用 grilling 与 domain-modeling 技能；HITL，必须与用户本人对话决议，agent 不得代答。
- 语言：文档/票/决议用中文；代码标识符与路径用英文。

## Decisions so far

<!-- 每关闭一张票，追加一行：- [<票名>](issues/NN-<slug>.md): <决议一句话 gist> -->

- [01-typora-visual-baseline](issues/01-typora-visual-baseline.md): 视觉基线提取完成（产出 research/typora-visual-baseline.md，分支 research/typora-visual-baseline @ 6bea824）——三主题色值、字体与排版体系、270px 侧边栏、860/1024/1200px 宽度分级、:root 变量主题机制均已入库；**修正口径**：Typora 无顶部格式工具栏（实为底部悬浮胶囊），形态与位置移交票 02 裁决。
- [02-window-skeleton-and-menus](issues/02-window-skeleton-and-menus.md): 底部悬浮胶囊工具栏（Typora 形态，**默认隐藏**、偏好设置窗口「外观 → 工具栏 → 显示工具栏」勾选启用，12 按钮分三组，无独立显隐快捷键，源码模式下隐藏）；菜单对齐 Typora 七菜单（文件/编辑/段落/格式/视图/主题/帮助）；「文件 → 偏好设置…」打开 Typora 式偏好设置窗口（外观/编辑器两分类——修正注记推翻「不做设置窗口」裁定，雾区「设置界面形态」已裁决）；快捷键以 Typora 为准对齐（实机确认专注 F8/打字机 F9/全屏 F11/源码 Ctrl+/，asar 碎片推断已作废；任务列表/侧栏键位仍待实机确认）。
- [03-theme-system](issues/03-theme-system.md): 沿用现有变量体系按需补充（新增 --blur-text、--tree-active-border 等）；**取消「跟随系统」**（外观子菜单删除，主题菜单直接列三主题，Typora 同构）；data-theme 三值（github/night/newsprint）整体切换、setChecked 勾选态；全组件吃主题变量（侧边栏激活态改 4px 左边框+背景），滚动条系统原生；newsprint 代码高亮 token 实施时补提。
- [04-editor-typography](issues/04-editor-typography.md): 宽度分级 860/1024/1200px（替代 60vw）；标题对齐基线（h1 2.25em 起 + bold + h1/h2 下边框）；行高保留 1.7、块间距 0.8em、引用 4px 灰字、40vh 滚动余量保留；front matter 保持预览块仅主题化；代码块圆角 3px + 0.9em + 行号 #999 + 新增语言标签（依赖引擎 language 属性，验证风险）；西文字体 Open Sans/PT Serif（OFL）+ 中文显式微软雅黑。
- [05-focus-and-typewriter-modes](issues/05-focus-and-typewriter-modes.md): 快捷键实机确认——专注 **F8**、打字机 **F9**、源码 Ctrl+/（修正 asar 推断）；专注模式 = 非焦点段整段 --blur-text 灰覆盖（可读残影）+ 图片 opacity .2 + 不随失焦退出；打字机 = 内容容器 padding-top 50% + 0.4s 过渡平移植入；两者可叠加、与源码互斥；视图菜单新增全屏 F11。
- [06-outline-panel](issues/06-outline-panel.md): 渲染层直接解析 ProseMirror doc 树（不改引擎，源码模式禁用）；条目每级 1em 缩进 + 激活加粗；点击 = 滚动定位 + 光标置入；滚动跟随 rAF 节流高亮 + doc 变化 300-500ms 防抖重建；含层级折叠；侧边栏顶部「文件/大纲」双 tab（84px、激活 4px 色条）、宽度共享、不自动收起、无 pin 按钮。
- [07-status-info-bar](issues/07-status-info-bar.md): 仿 Typora 页脚完整版——底部 28-30px 信息条：左专注/打字机按钮（hover 浮现，与菜单/快捷键三入口并存）、右字数常驻 + 光标段落类型；字数口径 = 中文字符 + 英文单词（不含空白），点击弹四口径明细浮层并持久化；渲染层 doc 遍历 + 200-300ms 防抖，段落类型实时跟随 selection；整体吃主题变量。
- [08-find-panel-redesign](issues/08-find-panel-redesign.md): 搜索改 Typora 式**顶部通栏**（输入框 26px 直角、作用域双胶囊改 76px 下拉、命中琥珀 + 当前项黑底白字、Ctrl+Shift+F 预选工作区作用域；替换模式不引入）；链接面板/代码块复制按钮保留交互全部细节仅主题化（链接另接工具栏按钮）；横幅与输入对话框全部并入主题变量。

## Not yet specified

- **用户自定义主题文件机制**（加载与安全边界）——Q7 裁定留到实施时再议。
- **实施编排**：蓝图产出后如何分阶段实施、先后顺序——等决议积累后由蓝图收尾一并给出。
- **窗口标题/文档标签行为的 Typora 化细节**：打开多文档时的标题与最近文件交互——视各票决议是否浮出再定。
- **front matter 折叠交互**（Typora 的 front matter 可点击折叠，confidant 暂不做）——票 04 Q28 裁定列为增强候选；触发条件：实施完成且用户提出诉求。

## Out of scope

- **新 Markdown 语法能力**（数学公式、图表/mermaid、脚注、TOC 语法等）：属功能扩充而非「界面与操作方式」，留待 confidant-v2 范围裁决。
- **导出/打印界面的改造**：confidant 已有导出 PDF/打印菜单，保持现状。
- **插件系统、主题市场**。
- **跨平台样式适配**（macOS/Linux）：首版仅 Windows。
- **i18n**：界面全中文，不做多语言。
