# 03: 侧边栏间距/下拉浮层/代码块工具区反馈轮

**What to build:** 用户四条界面反馈(grill-me 访谈决议,2026-09-08):

1. **搜索输入框上边距**:输入框与【文件/大纲】标签栏间距 12px → 16px。
2. **标题下拉弹窗位置与显示不全**:根因 = DropdownSelect 浮层宽度 = 按钮宽度
   (标题按钮仅 ~33px),「标题 1」折行截断——浮层宽度改内容自适应
   (`white-space: nowrap` + minWidth = 按钮宽,左对齐按钮)。
3. **查找条作用域下拉内容换行**:同上根因(scope 按钮 76px,「整个工作区」需
   ~82px)——同一修法,「当前文件」「整个工作区」各独占一行。
4. **代码块工具区常驻**:语言标签 + 复制按钮放回代码块内、第 1 行上方的常驻
   工具区(占内容流,pre padding-top 38px 让位,行号 gutter 同步下移、
   行号从内容第 1 行开始编号);替代反馈轮 01 悬停浮层与 02 浮块外方案,
   移除 hover 跟踪;打印/PDF 无功能(菜单项禁用态),不做隐藏处理。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 搜索输入框上边距 16px
- [ ] DropdownSelect 浮层内容自适应宽度 + nowrap(scope/标题两处同修)
- [ ] 代码块常驻工具区:pre 顶部让位、行号对齐内容第 1 行、语言/复制按钮
      absolute 定位;移除 hover 浮层逻辑
- [ ] smoke 代码块探针改常驻断言(去 hover 模拟)
- [ ] 全量测试 + lint:boundaries + smoke 全绿

## Answer

已实施并实机复验(E2E smoke 全绿;全量 192 测试;typecheck 与 lint:boundaries
无违规)。

- **搜索输入框上边距**:12px → 16px(Sidebar 搜索框 wrapper padding)。
  **修正(用户复验)**:三值 padding 简写理解错误——`0 8px 16px` 实为上 0 下 16,
  加在了底边距;改为输入框自身 `margin-top: 16px`(上外边距),wrapper 恢复
  `0 8px 6px`(下方 6px 原样)。
- **下拉浮层宽度自适应**:DropdownSelect 浮层 `width` → `minWidth`(按钮宽),
  选项行 `white-space: nowrap`——「整个工作区」「标题 1」各独占一行,
  不再按按钮宽折行截断;查找条作用域与工具栏标题两处同修(同一组件)。
- **代码块工具区常驻**:pre `padding-top` 12px → 38px 让位、行号 gutter
  `padding-top` 同步 38px(行号仍从内容第 1 行编号,与代码逐行对齐);
  语言标签(左)+ 复制按钮(右)absolute 定位在工具区内,常驻显示;
  CodeBlockOverlay 重写:MutationObserver + rAF 合并重扫结构/位置/语言,
  浅比较跳过无变化重渲染(打字时不卡);移除反馈轮 01 的 mousemove/mouseleave
  hover 跟踪;复制降级与 1.5s「已复制」反馈保留;打印/PDF 无需处理
  (菜单项为禁用态)。
- **smoke 探针**:代码块复制按钮与语言标签断言去掉 hover 模拟
  (sendInputEvent mouseMove),改常驻直接断言;语言切换 typescript 全链路保留。
- **实施中排障**:首轮 E2E 保存写入报「文件可能被占用」(偶发,上轮 dev 进程
  退出后句柄未释放),重跑全绿,与改动无关。
