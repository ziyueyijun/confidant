# 05: 搜索顶部条与浮层主题化

**What to build:** 搜索界面从浮动卡片改为 Typora 式顶部通栏（约 39px 高、输入框 26px 直角透明、12px、吃主题变量）；作用域「当前文件/整个工作区」双胶囊改为 76px 下拉；现有查找行为全保留（当前文件实时匹配、工作区 180ms 防抖、Enter 下一个/Shift+Enter 上一个/Esc 关闭并清除高亮）；命中高亮换基线观感（琥珀 `rgba(248,192,116,.3)` + 当前项黑底白字）；「视图 → 全工作区搜索 Ctrl+Shift+F」行为改为唤起顶部条并预选「整个工作区」；链接面板、代码块复制按钮交互保留、样式并入主题；横幅（文件缺失/操作通知）与输入对话框颜色全部并入主题变量。

**Blocked by:** 01 (can start after)

**Status:** ready-for-agent

- [ ] 顶部通栏形态落地（位置/尺寸/吃主题变量）
- [ ] 作用域下拉 76px（当前文件/整个工作区），两作用域行为与原一致（实时匹配/防抖、分组、跳转）
- [ ] Enter/Shift+Enter/Esc 行为保留；Esc 关闭并清除高亮
- [ ] 命中高亮琥珀色、当前项黑底白字（替代原黄色系）
- [ ] Ctrl+Shift+F 唤起顶部条并预选「整个工作区」
- [ ] 链接面板交互细节不变（编辑态/选区态预填、移除链接、Enter/Esc、焦点归还），样式吃主题变量
- [ ] 代码块复制按钮交互不变（悬停浮现、复制纯源码、1.5s 反馈），样式并入主题
- [ ] DocMissingBanner/ChangeNoticeToast/TextPrompt 颜色吃主题变量（三主题各自适配）
- [ ] 三主题下搜索条与浮层截图存档

## Answer

已实施并实机复验(smoke:顶部条几何探针贴顶 + 输入框 26px、查找/工作区搜索/Esc 清高亮全绿)。

- SearchPanel 改 Typora 式顶部通栏:贴顶全宽、约 39px 输入行、输入框 26px 直角透明 12px、吃主题变量;作用域双胶囊改 76px 下拉(当前文件/整个工作区,无工作区时选项禁用)。
- 行为全保留:当前文件实时匹配、工作区 180ms 防抖、Enter 下一个/Shift+Enter 上一个/Esc 关闭并清除高亮。
- 命中高亮:CSS 变量化(01 落地)——github/newsprint 琥珀 `rgba(248,192,116,.3)` + 当前项黑底白字;night 用基线饱和系 `rgba(199,140,60,.81)` + `#428bca` 底白字。
- Ctrl+Shift+F 唤起顶部条并预选「整个工作区」(既有通道)。
- 浮层主题化:DocMissingBanner(`--banner-bg/border`)、ChangeNoticeToast(`--toast-bg/fg/action`)、LinkPanel 提交钮(`--accent`);TextPrompt/CodeBlockActions 已全变量。
- 排障记录:工作区命中跳转高亮竞态(面板重挂载清除 effect 抹掉刚设的高亮)——高亮改经 `jump` prop 由面板在清除 effect 之后应用,顺序确定。
