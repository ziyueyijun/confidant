# 01-typora-visual-baseline

Status: resolved
Type: research
Blocked by:

## Question

从本机 Typora 42.2.0（`D:\Program Files\Typora`）的资源中提取「仿 Typora」改造所需的**视觉基线**，产出可供 confidant 直接参考的视觉规格文档。这是后续所有视觉类票（theme-system、editor-typography）的数值输入。

提取范围：

1. **三主题**：`resources/style/themes/github.css`（参照基线）、`night.css`、`newsprint.css`——各自的配色（正文/标题/链接/引用/代码/表格/选中高亮等）、字体栈、字号与行距体系、间距规律。
2. **窗口 chrome**：`resources/style/window.css`、`base.css`（以及 `page-dist/static` 中必要的渲染层样式）——侧边栏宽度与样式、顶部格式工具栏的存在形式与高度、搜索条（顶部查找）、大纲面板、右下角字数统计、菜单样式。
3. **交互痕迹**：专注模式 / 打字机模式的样式（从 CSS 中能确认的部分，如淡出/居中规则）、代码块行号/语言标签样式。

产出：`.scratch/confidant-v2-ui/research/typora-visual-baseline.md`，组织为「confidant 可参考的视觉规格」——按组件分类（配色表/字体/排版/侧边栏/工具栏/搜索条/大纲/字数/菜单/代码块），每项给出具体数值与设计规律，并标注其来源文件。**不得复制 CSS 文件本身**（商业软件版权），只提取数值与设计语言；可少量引用片段作示例。

注意：Typora 的 CSS 服务于其自身 DOM 结构，提取时忽略选择器与 confidant 无关的部分，聚焦数值与规律。confidant 是中文界面（微软雅黑体系），字体结论需区分「UI 字体」与「西文字体」两层。

## Answer

（2026-09-07，research agent 于一次性分支 `research/typora-visual-baseline` 完成，提交 `6bea824`；分支保留未删。）

产出：`.scratch/confidant-v2-ui/research/typora-visual-baseline.md`（281 行），全部数值实读自本机 Typora 42.2.0 资源。

要点：
- **三主题主色**：github 白底 `#fff`/正文 `#333`/链接 `#4183C4`/选中 `#B5D6FC`；night 深蓝灰 `#363B40`/正文 `#b8bfc6`/标题 `#DEDEDE`/选中 `#4a89dc`；newsprint 米纸 `#f3f2ee`/正文 `#1f0909`/链接 `#065588`。
- **字体与排版**：正文基准 16px、行高 1.5–1.6、UI 层 14px；标题 h1 2.25em→h6 1em（h6 灰字）；代码 0.9em。
- **窗口 chrome**：侧边栏 270px（视口 <1000px 时 240px）；文件/大纲 tab 宽 84px、激活时底部 4px 色条；内容区 top 28px / bottom 25px。
- **正文宽度分级**：github 860px（≥1400px 视口 1024px、≥1800px 视口 1200px）——与既定「约 860px 纸张感」口径一致。
- **主题机制**：全部颜色走 `:root` CSS 变量（约 30 个语义 token），主题只覆盖变量——confidant 三主题系统复用此机制。
- **交互痕迹**：专注模式非焦点块文字整段 `#C8C8C8`（night `#686868`）；打字机模式 `#write{ padding-top:50%!important }` + 0.4s 过渡；页脚/侧边栏按钮 hover 才显示；激活文件用「4px 左边框 + 背景」。
- **中文字体**：Typora 的 CSS 几乎不含中文字体栈（靠 Windows 系统回退=微软雅黑）；confidant 可显式「西文主题字体 + 微软雅黑」更可控。

**影响后续票的事实冲突**：Typora 42.2 **没有顶部格式工具栏**——格式工具是**底部悬浮胶囊工具栏**（bottom 14px、圆角 18px、28×28 按钮、分隔线 1×18px），顶部 28px 仅为标题栏。地图 Notes 与票 02 的「顶部格式工具栏」口径据此修正，形态与位置移交票 02-window-skeleton-and-menus 裁决。
