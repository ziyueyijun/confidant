# 05: 代码块工具条固定反馈轮

**What to build:** 用户两条现象反馈(grill-me 访谈决议,2026-09-08):

1. **滚动时语言/复制按钮「一直跳」**:根因 = 按钮 absolute 坐标跟随
   (scroll 事件 → rAF → getBoundingClientRect → 重算 top),滚动中始终
   滞后一帧,快速滚动观感跳动。
2. **有的代码块没有显示这两个功能**:根因 = 定位祖先为编辑区父 div,
   而坐标按滚动容器计算——文档带 front matter 时 fm-block 在滚动容器
   上方占位,按钮整体偏移漂出代码块(视觉「没有」)。

**决议(推荐方案)**:按钮改为「长在代码块上」——引擎层 code-block-view.ts
为每个代码块插入常驻 `.code-tools` 装饰 widget(与行号同款机制,置于代码
文本起点、absolute 于 pre 顶部工具区);渲染层 portal 语言/复制按钮进容器。
滚动时按钮随 pre 天然移动,零 JS 重算零滞后;按钮与代码块同生命周期,
任何代码块都有,front matter 偏移类坐标错误根本不存在。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 引擎:getDecorations 插 .code-tools widget(不受行号开关影响)
- [ ] CSS:.code-tools 样式(absolute 于 pre 顶部 38px 工具区,按钮可点)
- [ ] 渲染层:CodeBlockOverlay 重写为 portal 进容器(MutationObserver 重扫
      容器/语言 zip,浅比较;滚动零处理);复制剥离 .code-tools 容器
- [ ] smoke 代码块探针(常驻断言)不受影响
- [ ] 全量测试 + lint:boundaries + smoke 全绿

## Answer

已实施并实机复验(E2E smoke 全绿;全量 192 测试;typecheck 与 lint:boundaries
无违规)。

- **引擎**:`getDecorations` 为每个代码块插入常驻 `.code-tools` widget
  (code-block-view.ts,与行号同款 `Decoration.widget(pos+1, ..., {side:-1})`,
  不受行号开关影响);CSS `.code-tools` absolute 于 pre 顶部 38px 工具区
  (flex 两端布局,容器 pointer-events none、按钮 auto)。
- **渲染层**:CodeBlockOverlay 重写为 portal 进容器——MutationObserver
  (编辑区滚动容器子树)+ rAF 合并重扫容器列表与语言 zip,浅比较跳过无变化
  重渲染;**滚动零处理**(按钮长在 pre 上天然跟随),absolute 坐标跟随与
  scroll/resize 监听全部移除;复制剥离 `.code-tools`(防按钮文字混入源码)。
- **smoke**:代码块探针(按钮常驻、点击复制、语言切换 typescript)原样通过。
- **用户现象根因**:①「滚动跳」= 坐标跟随滞后一帧;②「有的代码块没有」
  = front matter 块(fm-block)占位导致按钮定位偏移漂出代码块。widget 方案
  两项根治。
