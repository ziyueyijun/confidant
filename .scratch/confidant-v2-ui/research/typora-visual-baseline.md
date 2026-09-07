# Typora 视觉基线（confidant-v2-ui 输入）

> 研究票 01 产出：从本机 Typora 42.2.0（`D:\Program Files\Typora`）前端资源提取的视觉基线，组织为「confidant 可参考的视觉规格」。
> 本文件只提取数值、设计规律与必要短片段示例，不复制 Typora 的 CSS 文件内容（商业软件版权红线）。
> 参照基线 = github 主题（map.md 已定口径）。confidant 是中文界面（微软雅黑体系），字体结论分「UI 字体」与「西文字体」两层。
> 来源文件清单见文末「来源」小节。

---

## 1. 三主题配色表

Typora 的配色机制：**CSS 变量驱动**。`base-control.css` 的 `:root` 定义全部语义变量（背景、文本、选中、控件、边框、激活文件……），主题文件（github/night/newsprint）只覆盖其中若干变量；组件样式一律引用变量。confidant 的主题系统应沿用这一机制（对应票 03-theme-system）。

### 1.1 github（亮色，参照基线）

| 元素 | 色值 | 变量 | 来源 |
|---|---|---|---|
| 窗口/正文背景 | `#ffffff` | `--bg-color` | base.css `:root` |
| 正文 | `#333333` (rgb(51,51,51)) | `--text-color` | base.css、github.css body |
| 链接 | `#4183C4` | — | github.css a |
| 标题 | 继承正文 #333，加粗 | — | github.css h1-h6 |
| h6 | `#777777` | — | github.css h6 |
| 选中高亮 | `#B5D6FC`（浅蓝，Windows 风格）、选中字色 auto | `--select-text-bg-color` | base.css、github.css 覆盖 |
| 引用块 | 左边框 4px `#dfe2e5`、文字 `#777777` | — | github.css blockquote |
| 行内代码背景 | `#f3f4f4` | — | github.css code |
| 代码块背景 | `#f8f8f8`、边框 `#e7eaed`、圆角 3px | — | github.css .md-fences |
| 代码块语言标签 | `#b4654d`（砖红） | — | github.css .md-lang |
| 表格 | 边框 `#dfe2e5`、表头/偶数行背景 `#f8f8f8` | — | github.css table |
| 分割线 hr | `#e7e7e7`，2px 高 | — | github.css hr |
| h1/h2 下划线 | `#eee` 1px | — | github.css h1/h2 |
| 侧边栏背景 | `#fafafa` | `--side-bar-bg-color` | github.css `:root` |
| 侧边栏激活文件 | 背景 `#eee` + 左边框 4px `#777` | `--active-file-bg-color` / `--active-file-border-color` | base-control.css .file-tree-node.active |
| 控件文本（侧边栏文件名等） | `#777` | `--control-text-color` | github.css `:root` |
| 菜单/列表 hover | `rgba(229,229,229,0.59)` | `--item-hover-bg-color` | base-control.css `:root` |
| 主强调色（排序按钮激活、选中态描边） | `#428bca` | `--primary-color` | base-control.css `:root` |
| 键盘焦点环 | `#6eace2`（outline 1px） | `--focus-ring-color` | base-control.css `:root` |
| markdown 语法字符（`#`/`*` 等） | `#C7C5C5` | `--md-char-color` | base-control.css `:root` |
| 专注模式淡出文字 | `#C8C8C8` | `--blur-text-color` | base-control.css `:root` |
| 搜索命中（文档内） | `rgba(248,192,116,.3)` 琥珀 30% | `::highlight(search-hit)` | base-control.css |
| 搜索当前项 | `#000` 底 + 白字 | `--search-select-bg-color` | base-control.css `:root` |
| 文中目录/脚注链接色 | `#4183c4` | — | base.css .md-toc-item |
| tooltip | 背景 `#f2f2f2`、圆角 2px、边框 hsla(0,0%,0%,.1) | — | base-control.css .ty-tooltip |
| alert 提示框（GitHub 风） | note `#0969da` / important `#8250df` / warning `#9a6700` / tip `#1f883d` / caution `#cf222e`，左边框 .25em | — | base.css .md-alert |

### 1.2 night（深色）

| 元素 | 色值 | 变量 | 来源 |
|---|---|---|---|
| 窗口/正文背景 | `#363B40`（深蓝灰） | `--bg-color` | night.css `:root` |
| 正文 | `#b8bfc6` | `--text-color` | night.css `:root` |
| 标题 | `#DEDEDE` | — | night.css h1-h6 |
| 链接 | `#e0e0e0` 带下划线；hover `#fff` | — | night.css a |
| 选中高亮 | `#4a89dc` 底 + `#fff` 字 | `--select-text-bg-color` | night.css `:root`、::selection |
| 引用块 | 左边框 2px `#474d54`、padding-left 30px、文字 `#9DA2A6` | — | night.css blockquote |
| 行内代码背景 | `rgba(0,0,0,0.05)` | — | night.css code |
| 代码块背景 | `#333`，padding 10px 10px 10px 30px | — | night.css pre.md-fences |
| 代码块行号槽 | 背景 `#333`、右边框 transparent | — | night.css .CodeMirror-gutters |
| 表格 | 边框 `#474d54`、th/td padding 5px 10px | — | night.css |
| 分割线 hr | `#474d54`，margin 24px 0 | — | night.css |
| 侧边栏背景 | `#2E3033` | `--side-bar-bg-color` | night.css `:root` |
| 侧边栏激活文件 | 背景 rgb(34,34,34) + 左边框 `#8d8df0` | `--active-file-bg-color` / `--active-file-border-color` | night.css |
| 控件文本 | `#b7b7b7`；hover `#eee` | `--control-text-color` / `--control-text-hover-color` | night.css `:root` |
| 大纲/列表 hover 项 | 背景 `#363B40` + 白字 | — | night.css .outline-item:hover |
| 专注模式淡出文字 | `#686868` | — | night.css .on-focus-mode |
| 搜索命中（文档内） | `rgba(199,140,60,0.81)` | .md-search-hit | night.css |
| 搜索选中 | `#428bca` | `--search-select-bg-color` | night.css `:root` |
| 页脚字数按钮激活 | 背景 `#333333` | — | night.css |
| 底部格式工具栏 | 背景 `#2d3033`、边框 rgb(127 127 127 / 50%)、文字 `#e8f2fb` | — | night.css .ty-editor-toolbar |
| 滚动条 | 5px 宽、thumb rgba(250,250,250,.3) | — | night.css |
| mark 高亮 | `#D3D40E`（黄绿） | — | night.css mark |
| 代码块语法色（CodeMirror cm-s-inner 暗色） | keyword `#C88FD0` / tag `#7DF46A` / attribute `#7575E4` / string `#D26B6B` / comment `#DA924A` / header·def `#8d8df0` / number `#64AB8F` / variable-2 `#9FBAD5` | — | night/codeblock.dark.css |

### 1.3 newsprint（纸感）

| 元素 | 色值 | 变量 | 来源 |
|---|---|---|---|
| 背景 | `#f3f2ee`（米纸） | `--bg-color` | newsprint.css `:root` |
| 正文 | `#1f0909`（近黑暖棕） | `--text-color` | newsprint.css `:root` |
| 链接 | `#065588`；hover/active 下划线 | — | newsprint.css a |
| 选中高亮 | `rgba(32,43,51,0.63)` 底 + 白字；代码块内 `#36284e` | `--select-text-bg-color` | newsprint.css `:root`/`pre` |
| 引用块 | 左边框 5px `#bababa`、**斜体**、文字 `#656565`、margin-left 2em | — | newsprint.css blockquote |
| 行内代码/代码块背景 | `#dadada`（纸灰）；代码块 margin-left 2em、padding 0 1ch | — | newsprint.css code/.md-fences |
| 表格 | 表头背景 `#dadada`、偶数行 `#e8e7e7`、th/td padding .25em .25em .25em .4em | — | newsprint.css |
| 分割线 | `#c5c5c5` | — | newsprint.css hr |
| h1 下划线 | `#c5c5c5` | — | newsprint.css h1 |
| 侧边栏背景 | `#f3f2ee`；**未钉住时为浮层**，阴影 `0 6px 12px rgba(0,0,0,0.375)` | — | newsprint.css #typora-sidebar |
| 侧边栏激活文件 | `rgba(32,43,51,0.63)` | `--active-file-bg-color` | newsprint.css |
| 大纲/菜单 hover | `#dadada` / `#e8e7df` | — | newsprint.css |
| 控件文本 | `#444` | `--control-text-color` | newsprint.css `:root` |
| 图片 meta 文字 | `#9B5146`（暗砖红） | — | newsprint.css .md-image>.md-meta |
| 文件列表项 | 常规色 `#777`、激活项黑字 + 文件名加粗 | — | newsprint.css |
| 搜索选项按钮激活 | 背景 `#777` + 白字 | — | newsprint.css .searchpanel-search-option-btn.active |

### 1.4 三主题共性结论

- 亮色系（github）选中高亮是浅蓝 `#B5D6FC`（贴近 Windows 原生选区）；深色系转饱和蓝 `#4a89dc`；纸感系用墨色半透明 `rgba(32,43,51,.63)`。confidant 可参照：亮色用浅蓝、深色用饱和蓝。
- 三主题的「侧边栏背景」都**比正文背景更灰/更深一档**（#fafafa / #2E3033 vs #363B40 / 与纸面同色），侧边栏永远有微弱层次差。
- 引用、表格边框与正文同属低饱和灰系；强调色只有链接、代码语言标签、选中高亮三处。

---

## 2. 字体体系

### 2.1 字体栈分层

| 层 | github | night | newsprint | 来源 |
|---|---|---|---|---|
| UI 字体（header/菜单/footer） | `"Segoe UI", "Arial", sans-serif` | 继承正文栈 | `"PT Serif", 'Times New Roman', Times, serif` | github.css / newsprint.css header 规则 |
| 正文（西文） | `"Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, 'Segoe UI Emoji', 'SF Pro', sans-serif` | `"Helvetica Neue", Helvetica, Arial, 'Segoe UI Emoji', 'SF Pro', sans-serif` | `"PT Serif", 'Times New Roman', 'SF Pro', Times, serif` | 三主题 body |
| 标题（西文） | 同正文（加粗） | `"Lucida Grande", "Corbel", sans-serif`（字重 normal + 负字距） | 同正文 | night.css h1-h6 |
| 代码 | `"Lucida Console", Consolas, "Courier", monospace`（base 默认 `--monospace`） | `Monaco, Consolas, "Andale Mono", "DejaVu Sans Mono", monospace` | `Menlo, 'Ubuntu Mono', Consolas, 'Courier New', 'Microsoft Yahei', …`（图片 meta 处） | base.css / night.css / newsprint.css |
| 侧边栏搜索结果 | `Raleway, 'Source Sans Pro', sans-serif`（仅此一处） | — | — | base-control.css .ty-search-item-line |

**中文分工结论**：Typora 的 CSS **没有显式中文字体栈**——西文栈末位落到 Arial/serif 后，中文由浏览器字体回退机制接管（Windows 上即微软雅黑体系）。全 CSS 唯一显式列出中文字体的地方是 newsprint.css 图片 meta：`'Microsoft Yahei', 'Hiragino Sans GB', 'WenQuanYi Micro Hei'`。github 主题在正文栈末位放了 `'Segoe UI Emoji', 'SF Pro'`（emoji 回退）。对 confidant（中文界面）的启示：**西文字体选主题字体、中文显式指定微软雅黑体系**，代码字体链 `Consolas, 微软雅黑, monospace` 之类，比 Typora 的隐式回退更可控。

默认配置（conf.default.json `defaultFontFamily`）：standard 默认 `Times New Roman`、serif `Times New Roman`、sansSerif `Arial`、monospace `Courier New`——即用户可改，未改时走主题栈。

### 2.2 字号与行距体系

- **UI 层基准字号 14px**（base.css `html {font-size:14px}`）：菜单 13px、右键菜单 9pt、页脚 12px、标题栏 12px、搜索条 12px（输入框 26px 高）、侧边栏 14px、tooltip 12px。
- **正文基准字号 16px**（三主题 `html {font-size:16px}`），打印时降为 13px（github.css `@media print`）。
- 正文行高：github `1.6`；newsprint `1.5em`；night `1.625rem`（≈26px，行距最大）。
- 块级间距：github `p/blockquote/ul/ol/table margin: 0.8em 0`；night `margin-bottom 1.5rem`(24px)；newsprint `1.5em`。24px 是核心节奏单位。
- 标题字号比例（github，相对正文 16px）：
  - h1 `2.25em`(36px) / line-height 1.2，**带 1px #eee 下边框**
  - h2 `1.75em`(28px) / lh 1.225，下边框
  - h3 `1.5em`(24px) / lh 1.43；h4 `1.25em`(20px)；h5/h6 `1em`(16px，h6 色 #777)
  - 标题统一 bold、margin 1rem 上下、行高 1.4
- 标题字号比例（night，rem 制 + 负字距）：h1 `2.5rem`(40px) lh 2.75rem、letter-spacing -1.5px；h2 `1.63rem`(26px) ls -1px；h3 `1.17rem`(19px)；h4 `1.12rem`(18px)；h5 `0.97rem`；h6 `0.93rem`；标题色 #DEDEDE 字重大多 bold、h1 normal。
- 标题字号比例（newsprint，em 制 + 大段距）：h1 `1.875em`(30px) margin-top 2em、h2/h3 `1.3125em`(21px)、h4 `1.125em`(18px)、h5/h6 `1em`；h1 也带下边框。
- 代码字号：行内/块代码一律 `0.9em`（github）/ `0.875em`（night、newsprint），低于正文一档。
- 内容区宽度：github `#write max-width 860px`，视口 ≥1400px 时 1024px、≥1800px 时 1200px；night 914px 起步；newsprint `40em`(640px)，≥1400px 时 914px。**map 已定 confidant 口径约 860px**，与 github 基线一致。
- 内容区边距：`#write` padding 30px 四周、底部 100px（github）；base.css 默认 padding-left/right 30px、padding-bottom 70px、`transition padding-top .4s`。

---

## 3. 窗口 chrome

### 3.1 整体结构（自上而下）

1. **顶部标题栏**（`#top-titlebar` 24px 高 + `header` 容器 28px 高，z-index 900）：左端三杠菜单按钮 `#w-menu-btn`（font-size 20px、`-webkit-app-region: no-drag`，点击展开 megamenu 大菜单）+ 文档标题（12px、灰色 gray、opacity .9，未保存时标题尾随 `*`）+ 右端窗口控制钮。窗口边框（非全屏）1px `rgba(115,115,115,.86)`。
2. **内容区** `content`：top 28px、bottom 25px（页脚占位）。
3. **底部页脚** `footer.ty-footer`：28–30px 高、border-top 1px #ddd、12px 字号；**默认隐藏**，hover 显示按钮；内容为「专注模式 / 打字机 / 字数统计（右）」「大纲按钮（左）」。
4. **native-window 模式**（Electron 原生窗口，confidant 同形态）：`#top-titlebar` 与 header 全部消失（`display:none`/`height:0`），content 从 top 0 开始，搜索条移到最顶部。即：**原生窗口下 Typora 无自绘标题栏、无三杠菜单**，靠系统标题栏 + 应用菜单。

**对 confidant 的关键发现（与蓝图口径的差异）**：Typora 42.2 **没有「顶部格式工具栏」**——格式工具是**底部悬浮胶囊工具栏**（见 3.3）＋ 右键/菜单。窗口顶部 28px 仅是标题栏。map.md 已定「顶部格式工具栏」口径，票 02 决策时需确认是否沿用 Typora 的底部悬浮形态（不建议照抄，confidant 可按蓝图走顶部条，或参照悬浮胶囊做浮层）。

### 3.2 侧边栏

- 宽度：`--sidebar-width: 270px`（base-control.css `:root`）；视口 <1000px 时 240px（window.css 媒体查询）。
- 形态：`#typora-sidebar` 是**可滑出的浮层面板**——未钉住时 `left:-60000px`（不可见），钉住（pin-outline）时 `left:0`，过渡 0.3s（window.css）~0.4s（base-control）；钉住后 content/标题栏 `left: var(--sidebar-width)` 让位。
- 背景 `--side-bar-bg-color`（github #fafafa）；右边框 1px `rgba(0,0,0,.07)`；z-index 1；字体 14px；垂直方向 flex 列布局。
- **文件/大纲双 tab**：`.sidebar-tabs` 底部 1px #eee 分隔线；激活 tab 加粗 + 底部 4px 的 currentColor 色条（`.info-panel-tab-border` 高 4px）；tab 宽 84px、line-height 2.4、opacity .8。
- 侧边栏底部按钮条 `.sidebar-footer`：30px 高、border-top 1px #ddd、12px；按钮默认透明度 0、hover 时显示（`.use-file-tree-style:hover .sidebar-footer-item{opacity:1}`）——极简隐藏式设计。
- 文件树节点：`.file-node-content` 行高 22px、padding-right 32px、色 #777；节点背景条 `.file-node-background` 高 29px；激活节点 = 背景 #eee + **左边框 4px** #777；键盘选中态 = outline 1px solid `--primary-color`。
- 文件列表（列表视图）：项 padding 12px 上/24px 左/8px 右、底边 1px #eee；文件名 700 加粗；摘要 13px/行高 18px/高 38px；父路径/时间 12px opacity .5（默认隐藏）。
- 侧边栏顶部搜索输入框 `#file-library-search-input`：高 24px、面板 padding 16px。

### 3.3 格式工具栏（实际形态：底部悬浮胶囊）

`.ty-editor-toolbar`（base-control.css）：
- `position:fixed; bottom:14px`、z-index 9999、`border-radius:18px`（整条胶囊形）
- 边框 1px `rgba(127,127,127,.22)`；背景 `var(--bg-color)`、文字 `var(--text-color)`
- 双层柔和投影：`filter: drop-shadow(0 1px 1px rgba(0,0,0,.02)) drop-shadow(0 6px 16px rgba(0,0,0,.08))`
- 内边距 3px 6px、按钮间距 gap 2px；**按钮 28×28px、圆角 7px**、图标 13px、默认 opacity .6、hover 背景 `rgba(127,127,127,.16)`、active 背景 `rgba(127,127,127,.22)`
- 分组分隔线：1px 宽 × 18px 高、`rgba(127,127,127,.3)`、margin 0 3px
- 下拉选择钮：min-width 28px、padding 0 7px、标签 12.5px 上限 120px 省略
- 页脚可见时上移（bottom 40px）

### 3.4 标题栏与菜单的关系

- 非原生窗口：自绘 24px 标题栏内嵌三杠按钮（20px 图标、悬停展开三横线变宽动画），点击开 megamenu 大菜单（宽 240px 的整页式菜单面板，含最近文件等）。
- 原生窗口（confidant 形态）：无自绘标题栏；应用菜单 = Electron native 菜单（confidant 现状即如此，与 Typora native 模式一致）。

---

## 4. 组件样式

### 4.1 大纲面板（侧边栏「大纲」tab）

- 面板标题 `.outline-title`：字号 150%、padding 3px 20px；右侧 pin/关闭按钮 hover 才显示（16px、灰色）。
- 内容 `.outline-content`：padding 3px 18px、行高 1.1rem、`user-select:none`。
- 条目 `.outline-item`：padding 3px 上下；**hover 背景 `--item-hover-bg-color` + 左右各 28px 透明边框向外扩展**（`margin-left:-28px; border-left:28px solid transparent`，把整行高亮延伸到侧边栏边缘）；newsprint 主题同样用 28px/18px 边框扩展 + #dadada。
- 层级缩进：h1 0 / h2 1em / h3 2em / …每级 1em（base.css）。
- 展开箭头：Ionicons 8px 字号、1rem 宽点击区；night 用 FontAwesome 14px。
- 激活项：`.outline-active` 加粗（font-weight 700）；键盘选中 outline 1px `--primary-color`。
- 空状态：居中占位文案、opacity .6（侧边栏 hover 时淡入，`#typora-sidebar:hover #outline-content:empty:after{animation:fadein .5s}`）。

### 4.2 搜索条（顶部查找，`#md-searchpanel`）

- 形态：fixed 顶部通栏、`padding 5px 8px 0 16px`、`max-height 39px`、font-size 12px；投影 `rgba(0,0,0,.6) 0 0 .5em`（弱泛光）；z-index 1001（比标题栏高）。
- 输入框：**高 26px、font-size 12px、border-radius 0（直角）**、透明背景、右侧按钮组 `.input-group-addon` 高 26px padding 0 5px。
- 搜索类型下拉宽 76px；状态/错误信息右对齐（错误色 `#f44336`）。
- 选项按钮（大小写/单词）：右侧绝对定位、`border 1px solid #ddd`、**圆角 3px**、active 背景 `#ddd`（`--active-toggle-btn-color`）。
- 替换模式展开：max-height 74px、过渡 .4s；搜索模式时 content 下移（native 下 top 20px，替换模式 top 50px）。
- 文档内命中高亮：mark 背景 `rgba(227,227,185,.49)`；新式 `::highlight(search-hit)` 琥珀 `rgba(248,192,116,.3)`；**当前选中项 `#000` 底白字**。
- 侧边栏内搜索（全工作区）：命中文字 `.ty-file-search-match-text` 同琥珀 30%；结果行 13px、padding 3px 0 3px 24px；匹配数徽标 `#file-list-item-count` 圆角 2px、背景 `--active-file-bg-color`。

### 4.3 右下角字数统计（页脚）

- 页脚右侧 `#footer-word-count`：12px 上下文、opacity .75、padding 0 12px；hover/激活时背景 `#eee`（night 为 `#333333`）。
- 点击弹出明细浮层 `#footer-word-count-info`：bottom 32px 定位、表格 13.5px/行高 1.8、行 hover 背景 `--item-hover-bg-color`。
- 专注/打字机按钮激活色统一 `#1868AD`（`on-focus-mode #toggle-focus-mode-btn`、`ty-on-typewriter-mode #toggle-typewriter-mode-btn`）。

### 4.4 菜单

- 普通下拉菜单 `.dropdown-menu`：背景 `var(--bg-color)`；项 13px、padding `3pt 24px 2pt 24px`（≈4px 32px 3px）；hover 背景 `--item-hover-bg-color`；勾选标记 ✓；分隔线 `.divider` margin 4px 0。
- 右键菜单 `.context-menu`：9pt 字号。
- **样式按钮组**（菜单内嵌的段落/格式选择，如标题/引用/代码四宫格）：`.menu-item-container a.menu-style-btn` 每项**宽 25%-2px（四列）**、圆角 3px、font-size 14px、内阴影 `inset 0 0 0 1px rgb(16 22 26 / 7%)`；active/hover 背景 `--item-hover-bg-color`；容器 padding 3px 20px。
- 窗口级菜单（megamenu）：左侧菜单列宽 240px。

### 4.5 按钮 / 输入框 / 浮层

- 按钮：默认 **圆角 0（直角）**（`.btn,button{border-radius:0}`）；弹窗按钮 `min-width 5.14em`；工具栏按钮例外（28px、圆角 7px）。
- 输入框：默认直角透明底；设置页搜索框 `.ty-preferences input[type=search]` 圆角 6px、行高 22px；newsprint 输入框边框 `#aaa`。
- 弹窗 `.modal-content`：边框 1px `rgb(125 125 125 / 15%)`、阴影 `0 15px 30px rgb(0 0 40 / 20%)`、圆角 0；backdrop `#fff` opacity .8（night 用模糊 backdrop-filter blur(1px)）。
- 通知条 `#md-notification`：顶部通栏（native 下 top 0）、四层柔和阴影（`0 1px 0 rgba(12,13,14,.1)` 起逐层衰减）、padding 8px 16px 0。
- tooltip `.ty-tooltip`：背景 `#f2f2f2`、圆角 2px、12px、`drop-shadow(0 1px 2px hsla(0,0%,0%,.3))`、边框 hsla(0,0%,0%,.1)，出现延迟 .8s。
- 滚动条：12px 宽（thumb 实际 8px：竖向 4px 透明左边距）、thumb `rgba(0,0,0,.3)`、min-height 42px、hover 变实；night 改 5px 宽。
- 块提示（底部操作提示）：背景 `rgba(226,226,226,.8)`、12px、padding 8px 10px、阴影 `4px 4px 8px rgba(0,0,0,.31)`。

---

## 5. 交互痕迹（从 CSS 确认的规则）

### 5.1 专注模式（focus mode）

亮色基线（base-control.css，github 生效）：
- 非焦点块整段文字 `color: var(--blur-text-color) #C8C8C8 !important`（覆盖所有子元素，`.on-focus-mode .md-end-block:not(.md-focus):not(.md-focus-container) *`）。
- 非焦点图片 opacity `.2`、svg `.3`；焦点块内恢复 `opacity:1`。
- 焦点块恢复 `--text-color`。
- 代码块：非焦点行（`.CodeMirror-code>*:not(.CodeMirror-activeline)`）同样淡出为 #C8C8C8。
- github.css 补充：引用块左边框淡为 `rgba(85,85,85,0.12)`。
- night 主题对应规则：淡出色 `#686868`、焦点块 `#fff`。

实现要点：淡出通过 **!important 色值覆盖而非透明度**（保持可读性残影），激活行唯一高亮。

### 5.2 打字机模式（typewriter mode）

- 核心规则只有一条：`#write.typewriter-mode { padding-top: 50% !important; }`（base-control.css）——通过给内容区顶部 50% 内边距，把当前光标行推到视口垂直中点；`#write` 本身有 `transition: .4s padding-top ease-out`，切换时平滑滚动。
- 配套：`.ty-on-typewriter-mode #write>[cid]` 首块 margin-top、末块 margin-bottom 清零（避免撑大滚动）。
- 页脚按钮激活色 `#1868AD`。

### 5.3 代码块：行号与语言标签

- 行号 `.CodeMirror-linenumber`：**右对齐、色 `#999`、padding 0 3px 0 5px**；行号槽 `.CodeMirror-gutters` 右边框 1px `#ddd`（github）/ `#333` 背景（night）。
- 代码块本体（github）：背景 `#f8f8f8`、边框 1px `#e7eaed`、圆角 3px、字号 0.9em、上下 margin 15px、padding 8px 6px；带行号时 `.md-fences-with-lineno` 左 padding 清零。
- 语言标签 `.md-lang`：`#b4654d`（github，砖红小字）。
- 代码块内选中（newsprint）：`#36284e`。
- 打印时 github 设 html 13px、pre 防跨页。

---

## 6. 设计规律总结（confidant 可复用原则）

1. **变量即主题系统**：全部颜色/尺寸经 `:root` CSS 变量定义（--bg-color/--text-color/--side-bar-bg-color/--control-text-color/--active-file-*/--item-hover-* 等约 30 个），主题只覆盖变量、组件代码不改。confidant 三主题系统应同样把「语义 token → 主题覆盖」作为机制。
2. **层级差用灰阶不用色相**：侧边栏/控件比正文灰一档（#fafafa / #777），边框用 7% 透明度黑（rgba(0,0,0,.07)）；强调色只留给链接、选区、激活态三处，且都是低饱和蓝（#4183C4/#428bca/#065588）。
3. **圆角规律：默认直角，小件 2–4px，浮层例外**：按钮/输入框/弹窗全直角（0）；代码、选项钮、tooltip、徽标 2–4px；唯一大圆角是底部悬浮工具栏胶囊（18px）与工具栏按钮（7px）。
4. **阴影克制且分层**：日常浮层用 1–6px 模糊的轻阴影（rgba(12,13,14,.1) 四层递减）；弹窗才用 30px 大模糊；hover/悬浮件用 drop-shadow 双层。
5. **间距节奏 = 24px 系（1.5rem/1.5em）**：块间距、标题下距、列表缩进（30px）都锚定 24px 节奏；正文行高 1.5–1.6。
6. **隐藏式 UI 极简主义**：页脚按钮、侧边栏按钮、大纲 pin 钮、侧边栏底部条全部「hover 才显示」；常态只有内容。confidant 的窗口 chrome 可吸收此点（但注意可发现性权衡）。
7. **交互反馈用 0.2–0.4s 过渡 + 透明度渐显**：菜单滑下 0.1s、侧边栏滑动 0.3s、搜索条展开 0.4s、专注/打字机切换 0.4s padding 过渡；hover 项普遍 opacity 0.6→1。
8. **激活态强调「4px 左边框 + 背景」**：侧边栏激活文件 = 背景 + 4px 左边框（#777 亮色 / #8d8df0 暗色），比整行变色更克制；键盘导航选中态用 1px outline（`--focus-ring-color`）。
9. **文字层级靠字号+字色双编码**：h6、引用、图片 meta、front matter 均用 #777 系灰字标示「次要」，不只用字号。
10. **专注模式用 !important 整段覆盖色值、打字机用 padding-top 50%**——两个模式的实现机制都很简单，confidant 直接可平移（注意 !important 在 confidant 的 Tailwind 体系里需换用更高优先级类）。

---

## 来源

本机 Typora 42.2.0 安装目录 `D:\Program Files\Typora\resources` 下实读文件：

- `style/themes/github.css`（参照基线，416 行）
- `style/themes/night.css`（1035 行）
- `style/themes/newsprint.css`（621 行）
- `style/themes/night/codeblock.dark.css`（暗色代码块语法高亮，另见同目录 mermaid.dark.css、sourcemode.dark.css 仅记存在）
- `style/base.css`、`style/base-control.css`、`style/window.css`、`style/megamenu.css`、`style/codemirror.css`、`style/mac.css`（Mac 专用，未提取）
- `style/themes/github/`（4 个 Open Sans woff2 字体文件）、`style/themes/newsprint/`（4 个 PT Serif woff2）——仅字体资产，不复制
- `conf.default.json`（defaultFontFamily 默认值）
- `page-dist/static/css/*.css`（License/Preferences/Welcome/localSetting 四份，均为设置/欢迎页样式；经查无 focus-mode/typewriter/outline/md-searchpanel 字面规则，编辑区交互样式全部位于 style/base-control.css，故渲染层 JS 未深挖）
- 图片资产（style/bg.png、cubes.png 等）仅 megamenu.css 引用作菜单背景装饰，未提取
