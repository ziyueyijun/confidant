# Typora 功能面候选清单(confidant v1 仲裁输入)

- 类型:research 票产出(`.scratch/confidant-v1/issues/12-typora-candidate-catalog.md`)
- 采集日期:2026-09-06(本清单所有「现行/最新」均指此快照)
- 采集版本:官方页面可见最新为 **Typora 1.14.9**(官网 typora.io 下载区 Linux .deb 链接文件名 `typora_1.14.9_amd64.deb`);文档站 support.typora.io 最新 What's-New 页为 **1.14**。1.13 页截图日期 2026-04、1.14 页截图日期 2026-07 →【推测】1.13 于 2026-04 前后、1.14 于 2026-07 前后发布。
- 一手来源:仅 typora.io 官网与 support.typora.io 官方文档站(本票采集时逐页抓取原文约 70 页,证据为各页原文)。Typora 闭源、无源码可查;未引用任何第三方转载/评测。
- 证据纪律:条目 = 功能名 + 一句话行为 + 来源链接。除显式标注者外,所有条目均「已核实来源」(该官方文档页原文陈述);【推测】=推断(非页面陈述);【存疑】=官方来源间不一致或查证不到,如实标注、不猜不补。
- 特殊标注约定:
  - 「已在范围」= 该条目即首版三件套能力本体(文件树侧栏 / 所见即所得编辑 / 导出主流程);三件套内的其余细项与形态仍由各仲裁票(05/08–11 及后续)按 03 范围裁决标准逐项裁决进/出,不受本标注影响。
  - 「已划出:<范畴>」= 落入地图 Out of scope(云同步/多端、多人协作、非 .md 源格式、Linux 版)或平台范围票 01(macOS 不承诺不规划)的条目照录备查,仲裁不重复裁决。
  - 「仅 Windows / 仅 macOS / Win·Lin」= 平台限定事实标注,不作裁决。
- 多人协作:Typora 官方文档无此功能面(无条目可录),故本清单无「多人协作」组。
- 分组按票面要求:编辑内容 / 导航与辅助 / 外观与主题 / 文件与树 / 图片 / 导出 / 其他。

---

## A. 编辑内容(含 Markdown 语法面与编辑行为)

### A-1 编辑主形态(WYSIWYG 本体)

- **混合实时预览(所见即所得编辑)** — 编辑与预览一体:行内样式输入完即渲染,块级样式输入或按回车后渲染,无预览窗口、无模式切换。【已在范围】<https://support.typora.io/Quick-Start/#live-preview>
- **Markdown 语法符号智能显隐** — 行内语法标记(`**` 等)智能隐藏/随光标展开,块级标记(`###`、`- [x]`)渲染后隐藏;光标移入行内标记中部时展开为源码。<https://support.typora.io/Markdown-Reference/#span-elements>
- **源码模式切换** — Ctrl/Cmd+`/` 在混合视图与 Markdown 源码间切换,源码中回车插入两个换行(段落语义);1.13 起切换保留滚动位置。<https://support.typora.io/Shortcut-Keys/#view>、<https://support.typora.io/What's-New-1.13/>
- **段落分隔语义(Enter/Shift+Enter)** — Enter 新建段落(源码中表现为两行之间留空行),Shift+Enter 插入单换行(可写作 `<br/>` 或行尾两空格以兼容其他解析器);「保留/忽略换行与连续空白」可在偏好(Markdown→Whitespace / LineBreak)与编辑视图/打印导出分别配置。<https://support.typora.io/Line-Break/>
- **GFM 基准 + 严格模式** — 语法解析以 GitHub Flavored Markdown 为基准,略有差异;偏好可开 Strict Mode(如标题 `#` 后必须空格)并重启生效。<https://support.typora.io/Markdown-Reference/#overview>、<https://support.typora.io/Strict-Mode/>

### A-2 文本编辑操作

- **结构化删除** — 提供段落/块级删除、删句子(表中=删行、代码/公式块=删行)、删样式作用域、删单词等与代码编辑器「删行」不同的语义化删除。<https://support.typora.io/Delete-Range/>
- **智能选区** — Ctrl+L 选句(表中=选行)、Ctrl+E 选样式作用域(表中=选单元格)、Ctrl+D 选词、Ctrl+Shift+D 删词。<https://support.typora.io/Shortcut-Keys/#edit>
- **光标跳转** — 跳到文首(Ctrl+Home)、文末(Ctrl+End)、跳回选中/操作处(Ctrl+J)。<https://support.typora.io/Shortcut-Keys/#edit>
- **撤销** — 官方文档以「可撤销转换」示例提及撤销对输入态转换的可用性(如智能标点误转换)。<https://support.typora.io/SmartyPants/#convert-on-input-and-convert-on-rendering>
- **清除格式** — Ctrl+\ 清除当前文本的格式。<https://support.typora.io/Shortcut-Keys/#format>
- **自动成对(bracket/quote)** — 偏好开启后自动配对圆括号、引号等(同代码编辑器);扩展选项对 markdown 符号(`*` `~` 反引号 `_`;开启高亮/行内数学/上下标后含 `=` `$` `^`)也自动成对或包裹所选文本(部分符号只包裹不补尾符)。<https://support.typora.io/Auto-Pair/>
- **智能标点(SmartyPants)** — 智能引号/智能破折号(`--`→en dash、`---`→em dash、`...`→`…`),支持「输入时转换」与「仅渲染时转换」两态(影响源码保存内容),`\"` `\-` 可转义;YAML/代码/数学块与源码模式不转换;可把输入的非 ASCII 标点回映为 ASCII 语法(利于 IME)。<https://support.typora.io/SmartyPants/>
- **文本替换/片段 — 官方明确不支持** — 无内置文本替换规则与文本片段;官方引导用系统(如 macOS 文本替换)或第三方(espanso 等)。【已核实来源:页面即「官方不支持」声明】<https://support.typora.io/Text-Snippet/>、<https://support.typora.io/SmartyPants/#text-replacement>
- **emoji 输入** — 输入 `:smile:` 弹出自动补全;菜单 Edit→Emoji & Symbols 输入 UTF-8 emoji。<https://support.typora.io/Markdown-Reference/#emoji-happy>
- **字符引用(HTML entities)** — 直接输入 HTML 实体可渲染(官方建议直接输入 Unicode)。<https://support.typora.io/HTML/#html-entities>

### A-3 块级内容(Markdown 块语法与图形化编辑)

- **标题 1–6 级** — `#` 起行按回车生成;快捷键 Ctrl+1…6 切换、Ctrl+0 转段落、Ctrl+=/- 升降级。<https://support.typora.io/Markdown-Reference/#headings>、<https://support.typora.io/Shortcut-Keys/#paragraph>
- **引用块** — 输入 `>` 生成引用,自动续行与嵌套(多层 `>`),自动补 `>` 或换行。<https://support.typora.io/Markdown-Reference/#blockquotes>
- **无序/有序列表** — 输入 `*`/`+`/`-` 或 `1.` 即生成列表;Tab/Shift+Tab 或 Ctrl+[/] 缩进与反缩进(富编辑器式);可切换列表类型(菜单/右键/快捷键,官网列出「Change List Type」)。<https://support.typora.io/Markdown-Reference/#lists>、<https://support.typora.io/Shortcut-Keys/#paragraph>
- **任务列表(GFM)** — `- [ ]`/`- [x]` 渲染为可点击复选框,点击或菜单 Paragraph→Task Status 切换完成态;完成/未完成样式可 CSS 定制(官方配方如划线)。<https://support.typora.io/Task-List/>、<https://support.typora.io/Markdown-Reference/#task-list>
- **代码围栏(Fenced code blocks)** — 输入 ```` ``` ```` + 回车插入代码块;指定语言标识即语法高亮;支持约 130 种语言(CodeMirror 引擎,语言名大小写不敏感;未列语言可请求跟进 CodeMirror 支持)。<https://support.typora.io/Code-Fences/>、<https://support.typora.io/Code-Fences-Language-Support/>
- **代码块图形化工具** — 代码块右下角部件可改语言;右键/菜单 Code Tools:复制代码内容、自动缩进(Shift+Tab 行为可配);偏好可设行号显示、长行自动换行(打印/PDF 恒换行)、缩进宽度、默认代码语言(1.6+,可对菜单插入与语法插入分别生效/取最近使用)。<https://support.typora.io/Code-Fences/>
- **数学块(display math)** — 输入 `$$` + 回车进入公式块;用 ↑↓ 或 Ctrl+回车结束;MathJax v3(1.13 起 v4,`\\` 换行默认可用);公式编号三模式(不编号/AMS 规则/全部编号,偏好);physics 包、mhchem 化学式、`\label`/`\ref` 交叉引用;渲染异常可强制刷新(Edit→Math Tools);「应用 \\ 换行」选项等。v0.11 曾升 MathJax v3 为背景事实,导出部分格式不支持数学。<https://support.typora.io/Math/>、<https://support.typora.io/What's-New-1.13/>
- **行内数学(inline math)** — 偏好(Markdown 选项卡)开启后 `$...$` 行内渲染;默认按 Pandoc 规则界定(`$` 旁空格/数字边界),可切「legacy 兼容解析」;输入 `$` 后按 Esc 触发行内预览。<https://support.typora.io/Math/#inline-math>、<https://support.typora.io/Markdown-Reference/#inline-math>
- **表格(GFM)** — 输入表头行按回车即建表;光标入表弹出表格工具栏(调整行列/对齐/删除);右键增删行列、Ctrl+Enter/Tab 加行、Shift+Alt+Ctrl+L 或 Shift+Ctrl+退格删行;拖动表左/上边框可整体调宽高、拖行列边框可移动行列;图形化建表上限 6 列×10 行,超出可输入数字;对齐会写入 `<td style>` 仍可被主题 CSS 覆盖。<https://support.typora.io/Table-Editing/>、<https://support.typora.io/Markdown-Reference/#tables>
- **脚注** — 支持参考式脚注 `[^fn]` 与文末定义;悬停上标预览内容(导出仍为可点跳转)。<https://support.typora.io/Markdown-Reference/#footnotes>
- **分隔线** — 空行输入 `***` 或 `---` 回车生成水平线。<https://support.typora.io/Markdown-Reference/#horizontal-rules>
- **YAML Front Matter** — 文件首部 `---` 元数据块(回车或菜单插入);文档级配置键:`typora-root-url`(图片基准路径)、`typora-copy-images-to`(插图复制/上传动作)、导出相关(header/footer/sidebar/append-head/append-body 等);解析容错(避免编辑时大改),导出 HTML 标题/PDF 元数据与 pandoc 变量均读取之。<https://support.typora.io/YAML/>
- **目录块 [TOC]** — 输入 `[toc]` 回车或菜单插入;自动提取全部标题并随编辑更新;控制显示层级靠 CSS 配方;非标准 Markdown 语法(导出/其他引擎注意)。<https://support.typora.io/TOC/>
- **Callouts / GitHub-style Alerts** — 需先在偏好开启(1.8 引入);渲染 GitHub 风格警示块。<https://support.typora.io/Markdown-Reference/#callouts--github-style-alerts>
- **块级 HTML 渲染** — 块级 HTML(如 `<details>`、`<div>`)渲染为块,光标移入/点击进入源码编辑态,块内不解析 Markdown;`<script>`/`<meta>`/`<style>` 等不可见标签只显示源码不预览。<https://support.typora.io/HTML/#html-block>
- **图表扩展(需偏好开启)** — 代码块写 ` ```mermaid/sequence/flow ` 即渲染:mermaid(流程/时序/甘特/类/状态/饼图/需求/线图/架构 C4/思维导图/时间线/四象限/Sankey/ZenUML/XY 图/文氏与石川图(1.13 起 Mermaid 11.13))、js-sequence 时序图、flowchart.js 流程图;右键可另存 SVG/PNG/JPG 或复制;主题与选项可用 CSS 变量或图内 `%%{init}%%` 配置;导出 HTML/PDF/EPUB/docx 含图,Markdown→其他格式导出不支持图(官方建议插图而非写图)。<https://support.typora.io/Draw-Diagrams-With-Markdown/>、<https://support.typora.io/What's-New-1.13/>
- **HTML 注释** — `<!-- -->` 支持,编辑可见、打印/导出不可见。<https://support.typora.io/HTML/#comments>

### A-4 行内内容(span 语法与富媒体)

- **强调/粗体** — `*`/`_` 斜体、`**`/`__` 粗体(GFM 忽略词内下划线;官方建议用 `*`);反斜杠转义字面星号/下划线。<https://support.typora.io/Markdown-Reference/#emphasis>、<https://support.typora.io/Markdown-Reference/#strong>
- **行内代码** — 反引号包裹;代码内反引号可多反引号包裹(常见约定)。<https://support.typora.io/Markdown-Reference/#code>
- **删除线/下划线** — `~~text~~` 删除线(GFM);下划线需 HTML `<u>` 标签。<https://support.typora.io/Markdown-Reference/#strikethrough>、<https://support.typora.io/Markdown-Reference/#underlines>
- **高亮 / 下标 / 上标(偏好开启)** — `==text==` 高亮、`H~2~O` 下标、`X^2^` 上标;均需先在偏好 Markdown 选项卡开启。<https://support.typora.io/Markdown-Reference/#highlight>、<https://support.typora.io/Markdown-Reference/#subscript>、<https://support.typora.io/Markdown-Reference/#superscript>
- **链接语法面** — 内联 `[text](url "title")`、引用式 `[text][id]`(可 `[text][]` 简写)、自动链接 `<url>`、裸 URL 自动识别为链接;协议省略视为相对路径(官方建议不省略)。<https://support.typora.io/Links/>
- **链接交互** — 单击展开编辑,按住 Ctrl+单击跳转(文内标题锚点/打开文件/浏览器打开;链接到本机文件可省略扩展名并支持 `file.md#标题` 跳指定标题;目标不存在时引导创建)。<https://support.typora.io/Links/#open-links-in-typora>、<https://support.typora.io/File-Management/#links-to-file>
- **内部链接(标题锚点)** — `[text](#heading)` 跳本文标题;重名标题自动加 `-1/-2` 后缀;HTML 命名锚点亦可;跨文件 `file.md#heading`。<https://support.typora.io/Markdown-Reference/#internal-links>、<https://support.typora.io/Links/#internal-links>
- **行内 HTML** — 行内标签(span/sup/kbd 等)输入闭合标签即渲染;空标签与 `display:none` 内容在编辑态可见、导出隐藏;为安全不执行 `<script>`/`on*`,渲染时忽略 `class`/`id`/`data-*`(导出/打印仍包含)。<https://support.typora.io/HTML/>
- **视频/音频嵌入** — `<video>`/`<audio>` 标签嵌入本地或网络媒体;拖放视频文件自动插入;路径规则与图片相同(相对路径/root-url 选项适用)。<https://support.typora.io/Media/>
- **网页嵌入(iframe/分享码)** — 粘贴站点 iframe 分享码即渲染;部分 script 型分享码(如推文)在 sandbox iframe 中运行、无本地访问权(白名单配置「考虑中」);原生不再支持 PDF 内嵌(PDF 页为声明)。<https://support.typora.io/Media/#embed-web-contents>、<https://support.typora.io/HTML/#media-and-embedded-contents>

### A-5 快捷键体系

- **快捷键全集** — 各菜单项右侧显示快捷键(文件/编辑/段落/格式/视图各组,见页面表格);Windows 组合如:新文档 Ctrl+N、新窗口 Ctrl+Shift+N、保存 Ctrl+S、另存为 Ctrl+Shift+S、新建段落 Enter、查找 Ctrl+F、替换 Ctrl+H 等。<https://support.typora.io/Shortcut-Keys/>
- **自定义快捷键** — Win/Linux 通过高级配置 `conf.user.json` 的 `keyBinding` 字段改菜单命令键位(重启生效);macOS 走系统级 App 快捷键。<https://support.typora.io/Shortcut-Keys/#change-shortcut-keys>
- **视图切换快捷键** — 侧栏开关 Ctrl+Shift+L;Ctrl+Shift+1/2/3 分别切大纲/文章列表/文件树;源码模式 Ctrl+/;聚焦 F8、打字机 F9;全屏 F11;放大缩小(菜单/快捷键;Ctrl+滚轮需开启「ctrl/command 滚轮缩放」);放大时右上提示面板可调回。<https://support.typora.io/Shortcut-Keys/#view>、<https://support.typora.io/Zoom/>

---

## B. 导航与辅助

- **大纲面板(侧栏)** — 按标题层级列出当前文档结构;点击跳转;滚动/编辑时高亮当前所在标题;支持标题关键字过滤、平铺/可折叠两视图;「Highlight Current Header」定位当前标题;自编号仅平铺视图 + CSS 配方;浮动大纲按钮在窗口右上(可停靠左侧)。<https://support.typora.io/Outline/>
- **文内查找与替换** — Ctrl+F 查找、Ctrl+H 查找替换;支持正则(替换串可用 `$1` 捕获组)。<https://support.typora.io/Search/#find-and-replace-search-in-current-file>
- **跨文件全文搜索** — 侧栏顶部(滚到顶)/搜索图标呼出或 Ctrl+Shift+F;支持大小写、整词、正则;可点结果跳转(搜索 `#tag` 即全文搜文本,#标签无原生支持)。<https://support.typora.io/Search/#file-search-search-across-files>、<https://support.typora.io/File-Management/#global-search>
- **快速打开(Open Quickly)** — Ctrl+P(Windows)/Cmd+Shift+O:当前已打开文件夹或最近用文件的模糊搜索定位并打开。<https://support.typora.io/Search/#file-name-fuzzy-search-open-quickly>
- **重开已关闭文件** — Ctrl+Shift+T 重新打开最近关闭的文件。<https://support.typora.io/Shortcut-Keys/#file>
- **文档间切换/多窗口** — Ctrl+Tab 切换已打开文档;Ctrl+Shift+N 新窗口;Windows 版无「标签页」(New Tab 仅 macOS)。<https://support.typora.io/Shortcut-Keys/#file>
- **聚焦模式** — F8:除当前行/块外内容淡化,聚焦样式可 CSS 定制(官方钩子 `on-focus-mode`/`md-focus` 与 `--blur-text-color`)。<https://support.typora.io/Focus-and-Typewriter-Mode/>、<https://support.typora.io/Change-Styles-in-Focus-Mode/>
- **打字机模式** — F9:滚动保持光标行固定(默认始终居中,可关「always keep caret in middle」)。<https://support.typora.io/Focus-and-Typewriter-Mode/>
- **字数统计** — 状态栏/标题栏(悬停)常显;计数词数、字符数、行数、阅读时间;点击弹明细并可设计数单位;选中文本时显示选区统计;不含格式语法(字符数含);中文每字算一词;阅读速度(词/分)可设;显示与否在偏好(Appearance)→状态栏/悬停常显。<https://support.typora.io/Word-Count/>
- **拼写检查** — Win/Linux:Edit→Spell Check 面板/状态栏图标;用系统拼写(Windows≥8)或内置 hunspell 词典(缺词典可下载安装,仅装 Typora 或全系统);右键 learn/unlearn 单词;无中文/日文检查(选中文时用 en-US 查 ASCII 词)。<https://support.typora.io/Spellcheck/>

---

## C. 外观与主题

- **内置主题与主题菜单** — 6 个内置主题;主题即主题目录下一个 `.css` 文件,可增改(文件名转菜单名);主题目录经偏好「Open Theme Folder」打开(Win/Linux 下 `...\Roaming\Typora\themes` 类似位置)。<https://support.typora.io/About-Themes/>
- **明/暗模式分主题联动系统** — Win/macOS 可为浅色与深色各选一套主题,随系统色系自动切换;主题可用 `prefers-color-scheme` 媒体查询自适应。<https://support.typora.io/Dark-Mode/>、<https://support.typora.io/About-Themes/#use-themes-under-light-mode-and-dark-mode>
- **主题画廊** — 官方主题分享站 theme.typora.io,下载/分享第三方主题。<https://support.typora.io/About-Themes/#get-typora-themes>
- **自定义主题编写** — 官方《Write Custom Theme》指南 + 命名规则(小写字母与连字符)+ 调试 CSS(Windows:View→Toggle DevTools)。<https://support.typora.io/About-Themes/>
- **自定义 CSS 分层** — 加载序:基础样式→当前主题→`base.user.css`(全主题)→`{主题名}.user.css`(仅当前);用于不改主题文件做全局/局部微调;文件名大小写敏感。<https://support.typora.io/Add-Custom-CSS/>
- **CSS 定制配方库(官方文档汇总)** — 官方 Typeset 文档汇集以下「CSS 即功能」的定制配方:字体/字号/连字、行距与段距、两端对齐、居中、大写/小型大写标题、写作区宽度、背景图、列表序号样式(数字/中文/字母/罗马等)、代码块配色主题移植(CodeMirror `cm-s-inner`)、已完成任务划线、目录显示层级、标题/大纲/TOC 自动编号、聚焦模式样式、图像居中控制等——均属渲染层 CSS 开放能力而非面板开关。<https://support.typora.io/Typeset/>、<https://support.typora.io/List-Style/>、<https://support.typora.io/Code-Block-Styles/>、<https://support.typora.io/Auto-Numbering/>、<https://support.typora.io/TOC-levels/>、<https://support.typora.io/Line-Spacing/>、<https://support.typora.io/Backgound/>
- **正文字号偏好** — 偏好面板(Appearance;macOS 在 General)改字体大小,要求主题用 `rem` 单位才生效;字体族/代码字体走 CSS。<https://support.typora.io/Custom-Font/>
- **RTL 书写(实验)** — 通过自定义 CSS `direction: rtl` 支持,官方声明实验性、未充分测试。<https://support.typora.io/RTL/>
- **竖排书写(实验)** — 通过 CSS `writing-mode: vertical-rl` 支持,官方声明有限并列出已知问题。<https://support.typora.io/Typeset/#vertical-writing>
- **浮动编辑工具栏(1.14 新)** — 菜单 View→Toolbar 或 Settings→Appearance 开启选中文本的浮动格式工具栏。<https://support.typora.io/What's-New-1.14/>
- **界面语言(UI 翻译)** — 40+ 语言官方界面翻译(含简体中文;社区贡献,仓库 Typora-i18n);1.13 新增爱尔兰语。<https://support.typora.io/Languages-Support/>
- **状态栏开关** — Win/Linux 状态栏(承载字数/拼写/侧栏等)可在偏好 Appearance「Show Status Bar」或 View 菜单开关。<https://support.typora.io/Word-Count/#show--hide-word-count>
- **emoji 单色显示** — 高级配置 `monocolorEmoji` 令 Windows 上 emoji 与正文同色。<https://support.typora.io/Advance-Config/#monocoloremoji>
- **自动隐藏菜单栏** — 高级配置 `autoHideMenuBar` 隐藏菜单栏,Alt 键唤出(仅 Electron/Windows 语境)。<https://support.typora.io/Advance-Config/#auto-hide-menubar>

---

## D. 文件与树

- **打开文件夹 / 文件树侧栏** — File→Open 选择文件夹;打开单个文件时自动载入其父文件夹;侧栏「文件树」树形展示该文件夹(仅显示 Typora 支持的文件:Markdown、文本文件等);文件树 1.14 起支持键盘导航。<https://support.typora.io/File-Management/>、<https://support.typora.io/What's-New-1.14/>【已在范围:文件树侧栏本体】
- **文件列表面板(Articles)** — 侧栏另一种形态:当前文件夹文件平铺列表(可跨目录分组),Ctrl+Shift+2 切换;与大纲、文件树三形态并列为侧栏类型。<https://support.typora.io/File-Management/#files-sidebar>
- **侧栏内文件操作** — 悬停/右键:打开、新窗口打开、新建文件/文件夹、复制(Duplicate)、重命名、删除(移至回收站)、复制文件路径、在资源管理器中显示等;底部菜单含「Open Folder…」切换文件夹。<https://support.typora.io/File-Management/#actions-in-file-sidebar>
- **文件变更监视** — 自动监视文件夹内文件增删改并刷新树/列表;异常时侧栏菜单手动刷新。<https://support.typora.io/File-Management/#refresh-file-list--tree>
- **文件排序** — 按自然序(1-xxx,2-xxx,10-xxx)/字母/修改时间/创建时间,升降序;「Group by Folder」分组(树视图文件夹置前;列表视图按父目录分组)。<https://support.typora.io/File-Management/#sort-files>
- **拖拽移动文件** — 树内拖拽移动文件/文件夹;资源管理器/访达与侧栏之间互拖;拖到编辑区则插入指向该文件/文件夹的链接。<https://support.typora.io/File-Management/#move-file>
- **撤销文件操作** — 可撤销最近一次文件操作(移动/重命名/删除);仅最后一次;Win/Linux 删除不可撤销。<https://support.typora.io/File-Management/#undo-file-operation>
- **侧栏文件显示过滤(1.14 新)** — 选项:显示隐藏文件/文件夹、显示非 Markdown 文件、按规则配置侧栏显示/隐藏哪些文件。<https://support.typora.io/What's-New-1.14/>
- **最近位置与固定** — 侧栏 Recent Locations 列出最近打开的文件夹,可逐个移除、可 Pin 固定(固定项进 File→Open Recent 与 Open Quickly);清除历史(File→Open Recent→Clear Items,含清固定)。<https://support.typora.io/File-Management/#recent-files--folders>
- **最近文件/文件夹入口** — File→Open Recent、Open Quickly、任务栏/Dock 图标右键菜单等处可及。<https://support.typora.io/File-Management/#recent-files--folders>
- **Windows 跳转列表(JumpList)** — Windows 任务栏右键跳转列表含快速新建、最近文件/文件夹,可 Pin 常用文件/文件夹(仅 Windows)。<https://support.typora.io/File-Management/#jumplist-windows>、<https://support.typora.io/Typora-on-Windows/#jumplist>
- **启动行为设置** — 偏好设置启动动作:新建文档 / 恢复最后关闭的文件夹 / 恢复最后关闭的文件与文件夹 / 打开指定文件夹;另可命令行参数 `--new`、`--reopen-file` 覆盖之。<https://support.typora.io/Launch-Options/>、<https://support.typora.io/Launch-Arguments/>
- **自动保存(Win/Linux)** — 偏好开启(默认每 5 分钟);间隔经高级配置 `autoSaveTimer` 改;退出时提示未保存更改的确认策略另设。(macOS 走系统自动保存)【Win·Lin 事实】<https://support.typora.io/Auto-Save/>
- **崩溃/意外退出草稿恢复** — 无论自动保存开否,异常退出会留下草稿备份;偏好 File→「Recover Unsaved Drafts」找回;备份命名 `{日期}-{文件名}.md`,未命名文档以首标题/首句为名。<https://support.typora.io/Auto-Save/#recover-unsaved-drafts-windowslinux>、<https://support.typora.io/Version-Control/>
- **版本历史** — Windows/Linux 无内置版本控制(官方声明);macOS 继承系统「版本」。【已核实:Windows/Linux 无;macOS 项见来源】<https://support.typora.io/Version-Control/>
- **文件默认行尾** — Settings→Editor→Default Line Ending 可选 LF 或 CRLF(Windows 页 2025-09 截图佐证现行)。【仅 Windows 语境页】<https://support.typora.io/Typora-on-Windows/#line-ending>
- **命令行打开文件/文件夹** — 将 Typora 设为 .md 默认程序后 `start x.md` 打开;`typora.exe` 入 PATH 后 `typora example.md` / `typora .` 打开文件或文件夹;目标文件不存在时询问是否创建。<https://support.typora.io/Use-Typora-From-Shell-or-cmd/>
- **注册「新建 Markdown 文件」右键项** — Windows 资源管理器右键→新建菜单加「Markdown 文件」(偏好面板按钮一键注册或注册表);macOS 需第三方工具。<https://support.typora.io/New-File-in-Context/>、<https://support.typora.io/Typora-on-Windows/#new-markdown-file-from-context-menu>
- **文件间链接创建** — `[label](相对或绝对路径)` 链接其它文件/文件夹;不存在时弹「是否创建该文件」;`file.md#标题` 跳转指定标题。<https://support.typora.io/File-Management/#links-to-file>
- **第三方同步(数据同步) — 无内置** — 官方定位:文件即纯文本 .md,用 iCloud/OneDrive/Dropbox/Google Drive 等第三方同步;Typora 无自带同步。【已划出:云同步/多端;条目照录可见边界】<https://support.typora.io/Sync/>
- **移动端版本 — 官方不做** — 官方声明近期无移动版,推荐第三方 Markdown 编辑器配云盘使用。【已划出:云同步/多端】<https://support.typora.io/Sync/#mobile-support>
- **打开/导入非 .md 源文件** — 文件树/打开支持文本文件(txt 等);docx/rtf 等导入依赖 Pandoc 转换。【已划出:非 .md 源格式支持】<https://support.typora.io/File-Management/>、<https://support.typora.io/Install-and-Use-Pandoc/>

---

## E. 图片

- **插入途径(4 种)** — 手写语法/菜单插入(Format→Image→Insert Local Images)/拖放(可一次多张,含从浏览器)/剪贴板粘贴图片数据(需先告知存放位置;macOS 可从 iPhone 粘贴)。<https://support.typora.io/Images/#how-to-insert-images-in-typora>
- **插入时行为配置** — 默认保留原路径;可配「复制图片到指定文件夹」(全局或经 YAML `typora-copy-images-to` 按文档生效)或「上传图床」;Apply 规则可限定仅本地图。<https://support.typora.io/Images/#when-insert-images>
- **插入路径形态选项** — 「尽可能用相对路径」(相对当前文件;可强制加 `./` 前缀以兼容 VuePress 等)、「插入时自动转义图片 URL」(空格/中文转义,兼容差引擎);均偏好可配。<https://support.typora.io/Images/#preferred-image-syntax>
- **图片显示基准路径** — 默认相对当前 .md 文件解析;可用 YAML `typora-root-url` 指定站点根前缀以本地预览博客图(菜单 Format→Image→Use Image Root Path 可自动生成该键)。<https://support.typora.io/Images/#display-images-in-relative-path>
- **图床/云上传集成** — 集成第三方上传工具(iPic/uPic/Picsee/PicGo-Core/upgit 或自定义命令)把图片传至 Imgur/S3/GitHub 等;上传器可「Test Uploader」验证;自定义命令协议:Typora 以图片路径为参数调用,从输出末 N 行解析 URL 并回写文档;支持 `${filename}`/`${filepath}` 占位;自动上传时机可配(插入时,全局或文档级 `typora-copy-images-to: upload`)。【事实注:上传到第三方网络服务,隐私/稳定性由用户自负(官方警告)】<https://support.typora.io/Upload-Image/>
- **上传单张/全部** — 右键图片「Upload Image」上传选中;Format→Image→Upload All Local Images 一键上传全部本地图。<https://support.typora.io/Upload-Image/#usage>
- **删除图片** — 右键 Delete Image 连引用与原文件一起删;删引用保留原文件可手动删 Markdown 代码。<https://support.typora.io/Images/#delete-image>
- **移动/重命名/复制图片** — 右键 Move/Copy Image to…(可顺带改名);菜单 Format→Image→Move/Copy All Images to…(批量;远程图会先下载落地);由此亦可实现「下载全部远程图」。<https://support.typora.io/Images/#rename--move--copy-image>
- **图片对齐 — 无原生支持** — 官方声明「currently does not support image alignment」;默认单图段落居中(官方 CSS 规则),多图/自定义对齐走 HTML(`<center>` 等)或 CSS。【已核实来源:官方文档明示不支持】<https://support.typora.io/Images/#align-images>
- **图片缩放 — HTML 属性方式** — 官方不支持图形化缩放;用 `<img width/height/style=zoom>` 控制显示尺寸(编辑/预览即生效;style 中其它 CSS 编辑时不生效但影响导出)。<https://support.typora.io/Resize-Image/>
- **图片点击回源** — 渲染态点击图片展开/编辑其 Markdown 源码(与行内标记一致)。<https://support.typora.io/Markdown-Reference/#images>

---

## F. 导出

- **导出主流程** — File→Export 导出当前文档;内置四项:PDF、HTML、HTML(无样式)、Image(长图);其余格式经 Pandoc 提供(需另行安装 Pandoc ≥2.0);「Export with Previous / Export and Overwrite with Previous」按最近一次成功导出重导/覆盖导出。【已在范围:导出主流程本体;具体格式与管线形态仍由仲裁裁决】<https://support.typora.io/Export/>
- **导出项管理** — 偏好 Export 列表可对非内置导出项重排/改名/增删/绑快捷键(内置四项固定);新增可选模板:Typora 原生、Pandoc、自定义命令等。<https://support.typora.io/Export/#configure-export-items>
- **导出位置与导出后动作** — 默认导出目录可选(自动/与源文件同目录/自定义);成功后通知并可开导出目录或打开导出文件(单项可覆盖全局)。<https://support.typora.io/Export/#export-location>、<https://support.typora.io/Export/#configure-after-export-options>
- **PDF 选项** — 纸张/自定义尺寸与页边距;主题可另选(默认当前主题;**Win/Linux 版导出 PDF 与打印仅支持浅色主题**,小改走 `@media print` CSS);h1 间自动分页 + 脚注前分页(可关),文档内 `<div style="page-break-after:always">` 手动分页;页眉/页脚文本(支持 `${title}/${author}/${pageNo}/${pageCount}` 等变量);PDF 书签大纲自动生成;元数据(title/author/creator/subject/keywords 等)经 YAML 写入;「Append Extra Content」追加自定义 HTML(如封面)。<https://support.typora.io/Export/#pdf>
- **HTML 选项** — 可选附带大纲(侧栏,形态随当前平铺/折叠设置);`Append in <head/>`/`Append in <body/>` 注入自定义内容,`${title}` 等 YAML 变量在 title/meta 标签内替换(防 XSS 仅替换 meta 内);「HTML(无样式)」输出纯净 HTML 供自行加样式;导出的主题可另选。<https://support.typora.io/Export/#html>
- **Image 导出** — 面向社交媒体的整篇长图;可设宽度(默认 640px)/字号(默认 24px)/画质(Auto/Medium/High/Best)/主题;过长文档导出可能失败(官方注明)。<https://support.typora.io/Export/#image>
- **Pandoc 格式导出(内置模板)** — Word(.docx,可指样式参考文档,数学 `\ref` 引用在 docx 有 Pandoc 已知限制)、OpenOffice(.odt)、RTF、EPUB(自定义 CSS/目录级数默认 3/封面图/元数据)、LaTeX、MediaWiki、reStructuredText、Textile、OPML。<https://support.typora.io/Export/#file-format>
- **PDF(LaTeX/Pandoc)模板** — 可加导出项选 PDF 引擎(pdflatex/lualatex/xelatex 等)、LaTeX 模板、YAML 元数据与额外参数。<https://support.typora.io/Export/#pdf-latex--pandoc>
- **任意 Pandoc 目标格式** — 自配 Pandoc 导出项:目标格式/文件扩展名/raw type 兜底(如 `[toc]`→`__TOC__`)/额外参数;导出先转 pandoc native AST 再转目标(选中 native 可拿 AST);可做 RevealJS 幻灯片等演示导出。<https://support.typora.io/Export/#other-formats--configurations-using-pandoc>
- **自定义命令导出** — 导出项可绑定任意命令行(支持 `${currentPath}/${today}` 等变量;命令在文件所在目录执行),可控制是否弹保存框、展示命令输出;官方示例:导出即 `git add…commit…push` 发布、prettier 格式化。<https://support.typora.io/Export/#other-formats-using-custom-commands>
- **导出变量体系** — `${outputPath}`、`${outputFileName}`、`${currentPath}`、`${currentFileFullName}`、`${currentFolder}`、`${today}`、`${pageNo}`/`${pageCount}`(PDF)及 YAML 任意键 `${keyword}`/`${a.b}`;可用于页眉页脚与自定义命令/自定义内容。<https://support.typora.io/Export/#variables>
- **YAML 文档级导出覆盖** — PDF/HTML 等可经 YAML 键(header/footer/sidebar/append-head/append-body/append-head-extra/append-body-extra)覆盖或追加全局设置;因文件可能来自他人,须先开启偏好「Read and overwrite export settings from YAML front matter」。<https://support.typora.io/YAML/#export>
- **导出为其他 Markdown 规格** — 「Markdown(Other Spec)」模板可把 md 转其它 Markdown 变体;附带行宽/EOL(LF|CRLF)/缩进/仅 ASCII 等格式化选项;官方提醒「导出≠重排」——经 AST 转换,引用式链接等细节可能被改写。<https://support.typora.io/Markdown-Export/>
- **打印** — 打印走与 PDF 相同渲染通道;行内分隔线/连续空格等导出/打印是否保留在偏好(Markdown→Whitespace / LineBreak→Export/Print)单独可配。<https://support.typora.io/Line-Break/>
- **导入(反方向)** — 经 Pandoc 导入 .docx/.rtf 等(Export 页说明「pandoc 亦用于导入非 Markdown 文件」)。【已划出:非 .md 源格式】<https://support.typora.io/Export/#export-using-pandoc>
- **图表导出边界** — 图表随 HTML/PDF/EPUB/docx 导出;导出为其他格式(经 Pandoc)时图不支持;导出换主题时部分 mermaid CSS 配置不生效(官方注明)。<https://support.typora.io/Draw-Diagrams-With-Markdown/>
- **HTML 兼容性边界** — 富 HTML(含 style)在 PDF/HTML/EPUB 导出中保留;转 Word/LaTeX 等时 HTML 内容可能变纯文本;数学在不同导出格式支持不一。 <https://support.typora.io/HTML/#limitations>

---

## G. 其他

### G-1 平台事实与划出项

- **Linux 版** — 官方提供 Linux 版(deb/apt 源、x64/arm64 二进制、Snap 包(沙箱限制));安装/差异详见平台页。【已划出:Linux 版(决议于 01 平台范围票)】<https://support.typora.io/Typora-on-Linux/>
- **macOS 专属功能面** — Touch Bar 上下文编辑、Continuity Camera 插图、系统级 Services/替换/语法检查、三指查词/链接预览、系统「版本」历史、Tab 页、Quick Look 无官方插件等,整组为 macOS 平台能力(官方 Typora-on-macOS 页)。【已划出:仅 macOS(平台票 01:macOS 不承诺、不规划;结构不堵死)】<https://support.typora.io/Typora-on-macOS/>
- **Windows 平台便利能力** — .md 默认程序关联、任务栏 JumpList(见 D)、右键「新建 Markdown 文件」注册(见 D)、「Always on Top」置顶窗口、无管理员权限安装(仅当前用户)与静默安装参数(安装器行为,非编辑器功能)。<https://support.typora.io/Typora-on-Windows/>
- **系统要求** — 官网 System-Requirements 页:Windows 8/10/11(x86/x64/ARM);官网 typora.io 下载区写「Requires Windows 10, 11」。【存疑:两处官方页面不一致(8 是否支持),采集时未进一步核实】<https://support.typora.io/System-Requirements/>、<https://typora.io/>
- **许可与激活** — 商业闭源、付费激活(15 天试用,官网);激活/许可管理有专门文档页;与本产品无关,仅作背景。【非功能条目】<https://support.typora.io/activation/>

### G-2 高级配置与扩展

- **高级设置文件 conf.user.json** — 偏好未公开的部分设置存 JSON 配置(可注释):如默认字体族映射、`autoHideMenuBar`、右键自定义搜索服务 `searchService`、`keyBinding`、`monocolorEmoji`、启动 `flags`、`autoSaveTimer`;改后重启生效,可一键 Reset。<https://support.typora.io/Advance-Config/>
- **选中文本自定义搜索/翻译(右键菜单)** — 经 `searchService` 配置把选中文本 `%s` 送入自定搜索引擎(默认 Google),右键菜单直达。<https://support.typora.io/Add-Search-Service/>
- **Chrome 系启动参数** — `--disable-gpu`、`--proxy-server`、`--no-sandbox`、`--client-certificate` 等经命令行或 `flags` 传入(故障排查/网络代理场景)。<https://support.typora.io/Launch-Arguments/>
- **官方 VS Code/Cursor 扩展「Open in Typora」** — 1.13 起官方发布的扩展:资源管理器/编辑器右键在 Typora 打开 Markdown 文件(生态附属,非内置)。<https://support.typora.io/What's-New-1.13/>
- **主题与增强生态** — 官方主题画廊 theme.typora.io;VLOOK 第三方主题包+增强插件(面向导出的 HTML 美化,官方文档收录安装指引);Sublime/macOS 社区插件(第三方)。<https://support.typora.io/Install-and-Use-VLOOK/>、<https://support.typora.io/About-Themes/>
- **匿名数据上报** — 1.13 起新安装默认关闭匿名信息上报;相关设置随偏好(1.13 变更)。<https://support.typora.io/What's-New-1.13/>

---

## 条目统计(共 130 条,`- **` 级条目逐节计)

| 分组 | 条数 |
|---|---|
| A. 编辑内容 | 45 |
| B. 导航与辅助 | 10 |
| C. 外观与主题 | 14 |
| D. 文件与树 | 22 |
| E. 图片 | 11 |
| F. 导出 | 17 |
| G. 其他 | 11 |

## 采集附注与已知缺口

- 本文逐页覆盖 support.typora.io 文档站现行英文页面中与编辑器功能面相关的全部页面;未收录:客服类(报错/日志/故障排查/旧版系统支持)、许可与隐私页(见 G-1 许可条目)、历史版 What's-New(0.9–1.12,能力已体现在现行功能文档)。
- 偏好面板全量选项并无单一官方页面可交叉核对;凡条目行为均出自其对应功能页,不另臆造偏好名。
- 无法核实项均已就地标注【存疑】;本清单未发现必须编造补全的条目。
