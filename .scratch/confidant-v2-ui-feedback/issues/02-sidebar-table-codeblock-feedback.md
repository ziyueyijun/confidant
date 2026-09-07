# 02: 侧边栏/表格/代码块/查找条反馈轮

**What to build:** 用户六条界面反馈(grill-me 访谈决议,2026-09-08):

1. **侧边栏顶部去工作区名**:顶部那行字是工作区名(非品牌 logo;规格无品牌要求、
   原生标题栏无拖拽区问题)。删除头区,【文件/大纲】顶上去、顶部留白 10px;
   工作区名不补别处(窗口标题兜底)。
2. **搜索框间距**:搜索知识库输入框与标签栏间距 6px → 12px。
3. **表格默认 5 行 3 列 + 缩小**:`engine.insertTable` 默认 (2,2) → (5,3)
   (含表头 1 + 数据 4;快捷键 Ctrl+T / 菜单 / 工具栏三入口共用一处默认值,
   无法只改快捷键入口);表格字号 16px → 15px、行高 1.7 → 1.5、
   单元格 padding `4px 10px` → `3px 8px`;smoke 两列分隔线断言改三列;
   补无参调用默认值单测。
4. **代码块语言标签上移**:悬停浮层左上语言标签从 pre 内部(+6px)移到 pre 上方、
   底边贴住代码块顶部(间隙 0);块位于视口顶部无空间时允许覆盖上一段
   (不翻转回块内,翻转会重新压行号);复制按钮原位不动。
5. **语言选择自动定位**:打开 LangSelect 时列表滚动定位到当前语言
   (输入框不预填,保持「输入即过滤」);手输别名/未注册语言不在列表 → 停在顶部;
   顺手修反馈轮 01 遗留:切换语言后按钮文案不即时刷新(switchLanguage 后 setLang)。
6. **原生 select 主题适配**:查找条作用域下拉 + 格式工具栏标题下拉均为原生
   `<select>`(展开列表 OS 渲染,night 下白底,CSS 变量管不到)——自绘共用
   DropdownSelect 组件(`--surface`/`--border`/`--shadow`,复用 LangSelect 模式),
   全应用原生 select 共 2 处,修完即绝;testid 保留(search-scope-select/
   scope-workspace/ft-heading-select),smoke 的 scope-workspace 轮询改「展开后
   断言」真实路径。顺带走查:FormatToolbar 分隔线 `rgba(127,127,127,.3)` →
   `var(--toolbar-border)`;Footer 激活白字(深蓝底可读)、阴影类(黑阴影三主题
   成立)、Welcome 回退值核验后不改。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 侧边栏去工作区名;顶部留白 10px;搜索框间距 12px
- [ ] 表格默认 5×3 + 样式缩小(15px / 1.5 / `3px 8px`);smoke 分隔线三列;
      无参默认单测
- [ ] 语言标签上移贴块顶(复制按钮不动);顶部无空间覆盖上一段
- [ ] LangSelect 打开滚动定位当前语言;切换语言后按钮文案即时刷新
- [ ] DropdownSelect 自绘下拉替换 2 处原生 select;分隔线换 token;
      smoke 工作区搜索改展开后断言
- [ ] 全量测试 + lint:boundaries + smoke 全绿

## Answer

已实施并实机复验(E2E smoke 全绿;全量 192 测试;typecheck 与 lint:boundaries
无违规)。

- **侧边栏去工作区名头区**:顶部那行字实为工作区名(非品牌 logo),删除头区后
  【文件/大纲】顶到侧栏顶部(顶部留白 10px);搜索框与标签栏间距 6px → 12px;
  工作区名不补别处(窗口标题兜底)。
- **表格默认 5 行 3 列 + 缩小**:engine.insertTable 默认 (2,2) → (5,3)(含表头,
  快捷键/菜单/工具栏三入口共用一处);样式:字号 15px、行高 1.5、单元格
  padding `3px 8px`;smoke 分隔线断言改三列;新增无参默认 5×3 单测
  (管道行 6 = 表头 + 分隔线 + 数据 4)。
- **代码块语言标签上移**:悬停浮层语言标签移到 pre 上方、底边贴块顶(间隙 0,
  按钮固定高 19px 作 place 估算基准),不再压行号;复制按钮原位不动;
  顶部无空间时允许覆盖上一段(不翻转回块内)。
- **语言选择自动定位**:LangSelect 打开时列表滚动到当前语言(`block: center`)并
  高亮;别名/未注册语言不在列表停在顶部;输入框不预填。
- **切换语言后文案即时刷新**:switchLanguage 补 setLang,不再等下一次 mousemove。
- **原生 select 全量自绘**:新增共用 DropdownSelect(`--surface`/`--border`/
  `--shadow`,三主题全适配),替换查找条作用域下拉 + 格式工具栏标题下拉
  (全应用原生 select 共 2 处,修完即绝);testid 保留,smoke 工作区搜索改
  「展开后断言」真实路径;FormatToolbar 分隔线 rgba 硬编码 →
  `var(--toolbar-border)`;Footer 白字/阴影类/Welcome 回退核验后不改。
- **实施中排障**:E2E fixture 误放 %TEMP%(整树扫描海量文件失败)与 front matter
  title 非「复验」不匹配探针——均属 fixture 问题,与改动无关。
