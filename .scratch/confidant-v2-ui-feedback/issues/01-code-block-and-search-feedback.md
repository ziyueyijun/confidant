# 01: 代码块浮层与侧边栏搜索反馈轮

**What to build:** 用户三条界面反馈 + 两条衍生决策(grill-me 访谈决议,2026-09-08):

1. **代码块语言标签与复制按钮浮层**:语言标签左上、与复制按钮同浮层(悬停浮现,不占内容流);
   点击标签弹可过滤语言选择(lowlight common 集 + 无语言),切换即改 ``` 标记、进历史、
   自动保存,高亮随语言变化;冷门语言无高亮(引擎既有边界,不扩)。
2. **行号对齐修复 + 代码块默认不换行**:根因 = `.editor-prose code` 0.9em 与 pre 0.9em
   嵌套相乘(0.81em vs 行号 0.9em,行高差 2.45px/行,逐行累积错位)——pre 内 code 字号改
   inherit;代码块默认 `white-space: pre`(横向滚动,与 Typora 一致),「代码块自动换行」
   设置项保留(默认关)。
3. **内容区宽度 72vw 百分比自适应**(上限 1400px、窄窗 16px 留白),front matter 块与
   源码模式跟随同一策略;替代 860/1024/1200 分级限宽。
4. **侧边栏搜索框就地化 + 知识库文件搜索语义**:点击搜索框就地展开输入(不弹顶部条),
   结果显示文件名匹配 + 内容命中(searchWorkspace),点击命中打开文件;Ctrl+F 顶部条
   当前文件查找与全局搜索快捷键不变。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 行号与代码文本逐行对齐(同字号同行高)
- [ ] 代码块默认不换行;设置项切换换行/不换行正常
- [ ] 内容区 72vw 自适应(上限 1400);front matter/源码模式跟随;smoke 探针更新
- [ ] 语言标签+复制按钮浮层(悬停浮现、左上/右上);引擎 .code-lang widget 移除
- [ ] 点击标签 → 可过滤语言选择;切换后 ``` 标记更新、高亮变化、自动保存
- [ ] 侧边栏搜索就地输入;文件名匹配+内容命中列表;点击打开;Ctrl+F 顶部条不变
- [ ] 引擎 setCodeBlockLanguageAt/supportedLanguages 单测;全量测试 + smoke 全绿

## Answer

已实施并实机复验(workspace smoke 多次全绿;全量 191 测试;lint:boundaries 无违规)。

- **代码块语言标签与复制按钮浮层**:悬停代码块浮现——左上语言标签(可点击)、右上复制
  按钮,同浮层同层级(portal 于编辑区外,不受 PM 观察器影响);语言数据经引擎
  `getDoc()` 按序 zip(editor/code-block-lang.ts 纯函数 + 单测)。
- **语言切换**:点击标签 → LangSelect(输入过滤 + 引擎 `supportedLanguages()` 主名集 +
  「无语言」;手输别名如 js/ts 可用——lowlight.registered 按别名判定高亮,序列化保留
  别名写法);选择后经引擎 `setCodeBlockLanguageAt`(按 DOM 定位节点、setNodeMarkup
  改 ``` 标记)——进撤销历史、自动保存;高亮随语言重算(引擎单测 4 例:切换/移除/
  非代码块/undo)。引擎 `.code-lang` widget 移除(02 方案被浮层取代)。
- **行号对齐根因修复**:`.editor-prose code` 的 0.9em 与 pre 的 0.9em 嵌套相乘
  (0.81em vs 行号 0.9em,行高差 2.45px/行逐行累积)——`pre code` 字号改 inherit;
  smoke 断言行号与代码文本 computed 字号一致。
- **代码块默认不换行**(横向滚动,与 Typora 一致;折行不再与行号错位);「代码块自动
  换行」设置保留(默认关——use-editor-settings 与主进程 state-store DEFAULT_STATE
  同步改)。
- **内容区宽度 72vw 百分比自适应**(`min(72vw, 1400px, 100% - 32px)`,替代
  860/1024/1200 分级限宽);front matter 块与源码模式跟随同一策略;smoke 探针按
  innerWidth 动态断言。
- **侧边栏就地搜索**:点击搜索框就地输入(不弹顶部条)——文件名匹配(客户端树过滤)+
  内容命中(searchWorkspace 180ms 防抖);点击命中打开文件(内容命中带首个高亮);
  Esc 清空收起;Ctrl+F 顶部条当前文件查找与全局搜索快捷键不变(smoke 断言两者独立)。
- **实施中排障**:① 链接编辑探针的 PM 选区异步同步竞态(加 120ms 同步窗口);
  ② smoke 隔离 userData 的 Windows pid 复用残留(目录名加时间戳);
  ③ 主进程 DEFAULT_STATE.editorSettings 旧默认未同步(改 codeWrap: false);
  ④ 复制按钮 navigator.clipboard 非用户手势偶发被拒(降级 textarea+execCommand;
     smoke 复制前清剪贴板)。
