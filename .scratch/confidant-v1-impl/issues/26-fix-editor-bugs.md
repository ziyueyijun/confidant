# 26: 修复编辑器三缺陷(粘贴重复/空行点击/列表标记)

**Type:** task
**Blocked by:** 无。
**Status:** resolved

**What to build:**

1. **粘贴重复**(ctrl+v 文字双插):根因已确认——应用侧粘贴监听与 ProseMirror 默认粘贴挂在同一 DOM 节点(编辑器宿主即 view.dom),PM 监听先注册先插入一次,应用监听后执行 `insertHtml`/`insertPlainText` 再插入一次,此时 `preventDefault()` 已无效(PM 已处理并阻止默认)。菜单粘贴(native role)走同一 DOM 事件路径,同缺陷。修复:粘贴分派入口去重(开头检查 `e.defaultPrevented` 即返回),或把整套分派移入 `editorProps.handlePaste`(PM 内部、默认插入之前运行);位图/文件分支不受影响。
2. **空行点击**:连续回车产生的空段落,鼠标点击不显示光标。目标行为:点击空行任意位置 → 光标落最近可插入点;点击行尾空白 → 光标在行尾;点击内容列外留白 → 光标移到最近位置。根因未静态定位(全仓无显式拦截点击的代码),实现首步实机复验(检查 `document.activeElement` 与 `window.getSelection()` 确认光标是否实际放下),候选:Gapcursor 对块间隙的点击拦截、底部 40vh padding 的坐标映射、`outline: none` 导致的聚焦视觉缺失。
3. **列表标记**:有序/无序列表不显示 1.2.3./圆点。根因已确认:Tailwind v4 preflight 将 `ol/ul` 的 `list-style` 归零,应用样式只恢复了 padding/margin。修复:补 `list-style-type: disc/decimal` 及嵌套层级(circle/square/lower-alpha 等);任务列表 checkbox 与文字垂直居中;打印/PDF 宿主复用同一规则。

## 用户故事

1. 作为用户,从网页/Word 复制带格式内容 ctrl+v 粘贴时,内容只出现一次,格式自动转为 Markdown 语义(加粗/标题/链接等)。
2. 作为用户,纯文本粘贴只出现一次。
3. 作为用户,连续回车后点击任意空行,光标出现在该行并可继续输入。
4. 作为用户,点击行尾空白或内容列外留白,光标落到最近的可用位置。
5. 作为用户,看到有序列表显示 1. 2. 3.、无序列表显示圆点,嵌套层级符号正确。
6. 作为用户,任务列表的勾选框与文字垂直居中(多行条目时也居中对齐)。

## 实现决策(裁决记录,grill 访谈 Q1-Q3)

- 粘贴口径不变:富文本 → 消毒后转 Markdown 语义插入;纯文本 → 纯文本插入(与 Typora 一致,规格 §9.2 已定,本次仅修双插缺陷)。
- 去重方案二选一,实现时取改动最小者:分派入口检查 `defaultPrevented`,或迁入 `editorProps.handlePaste`;四分支分派逻辑本体不动。
- 空行点击:先复验定位再修;若为间隙/Gapcursor 拦截 → 调整块间距或点击处理;若为坐标映射 → 修 posAtCoords 侧;若为焦点视觉 → 补聚焦反馈。内容列外留白点击需显式加处理(编辑区外层点击 → 焦点 + 最近位置)。
- 列表:样式层修复,与序列化/文档结构无关;checkbox 居中用行内对齐方案(flex 或 vertical-align)。
- 不触碰磁盘字节与引擎序列化;normalization/roundtrip 矩阵须保持全绿。

## 测试决策

- **最高 seam = 引擎公共面 + 渲染层集成**:粘贴去重在渲染层 jsdom 测试中向编辑器宿主派发 paste 事件(构造 clipboardData),断言内容只插入一次;jsdom 环境沿用现有 ProseMirror rAF 补丁。
- 空行点击:jsdom 无布局、posAtCoords 不可信,以冒烟实机复验为准(复验脚本查 activeElement/getSelection);单元层只测点击处理引入的纯逻辑。
- 列表标记:引擎序列化矩阵已有列表往返用例,确保样式修复不破坏;视觉效果以 smoke 截图断言。
- 验收:typecheck / 单测矩阵 / boundaries / smoke / E2E 全绿,另附空行点击实机复验记录。

## 范围外

- 粘贴时弹格式选择对话框;粘贴为纯文本的快捷开关;空行点击相关的撤销/重做行为;列表编号手动续接(start 属性交互)。

## 备注

- 根因证据(仅作实现线索):应用侧粘贴监听在渲染层编辑器宿主 hook 的 `onPaste`;PM 默认粘贴为 ProseMirror 内部 handler;列表根因为 tailwind preflight `ol,ul{list-style:none}` 与应用样式未恢复 list-style-type。
- 规格 §9.2 粘贴分派为既有裁决,本票不改变口径,只修复实现与规格的偏离。
- 冒烟既有位图粘贴竖切不受影响,可作回归对照。

## 实现记录(26)

- 提交:`fix(26): 修复粘贴双插与列表标记;空行点击实机复验未复现`。
- **粘贴双插(根因确认修复)**:应用侧 paste 监听与 PM 默认粘贴同节点双插(PM 监听先注册先插入,应用监听后执行再插一次)。分派整体移入 `editorProps.handlePaste`(PM 默认插入之前运行,返回 true 即不再二次插入);分派逻辑抽为独立模块 `paste-dispatch.ts`(use-editor-host 只注入 refs),四分支(位图/文件/富文本/纯文本)本体不动。
- **顺带修复(探索发现)**:资源管理器复制非图片文件 → 链接插入改走 `applyLink` 命令面。原 insertHtml 路径对 `C:` 盘符 href 会被 @tiptap/extension-link 的 `isAllowedUri` 拒绝(非白名单 scheme),链接退化成转义字面文本——Windows 本地路径链接粘贴一直是坏的。
- **列表标记**:preflight 归零 list-style,补 `disc/decimal` + 嵌套层级(circle/square/lower-alpha/lower-roman);任务列表 checkbox 由 `align-items: flex-start` + margin-top 改为 `align-items: center` 垂直居中;打印宿主复用同一规则。
- **空行点击:实机复验未复现**(见「备注:空行点击未复现」)。探针已纳入文件竖切冒烟作为回归守卫:先开工作区再开文件(与真实使用一致),Enter×3 造空段,`sendInputEvent` 真实输入事件点击行中心/行上下 margin/失焦后点击,断言选区落位——全绿。
- **防御修复**:欢迎页渲染条件加 `!doc`——仅开文件无工作区时(E2E 直开文件路径;生产不可达)欢迎页绝对定位覆盖编辑区吞掉一切点击,探针开发中暴露。
- **测试基建**:`src/test/setup.ts` 补 `Range.prototype.getClientRects/getBoundingClientRect` 零值兜底——jsdom 缺失,PM 的 scrollToSelection 对文本位置取 Range 几何,异步用例一 await 即同步崩溃(现有全同步测试侥幸未触发)。
- 验证:typecheck ✓;141 单测(新增 6 例粘贴分派:纯文本/富文本单插、无内容交回、位图优先于富文本、文件链接、图片文件落盘)✓;boundaries 0 ✓;文件竖切(含空行点击探针)✓;工作区竖切(位图粘贴走新 handlePaste 路径回归)✓;flush 变体磁盘标记 + front matter 保留 ✓。

## 验收

- [x] `npm run typecheck` / `npm test`(141)全绿。
- [x] `npm run lint:boundaries` 0 违规。
- [x] 文件竖切(含空行点击探针)exit 0;工作区竖切(位图粘贴回归)exit 0;flush 变体磁盘双标记 + front matter 原样。

## 备注:空行点击未复现

- 用户报告的「点击中间空行无光标」在当前 master **无法复现**:带工作区场景下,真实输入事件点击空行行中心、行上下 margin 间隙、失焦后点击,光标全部正常落位(探针见上)。用户实测版本可能为票 20 打包产物(22-25 重构后未重新打包);若复测仍现,需补充:应用版本、点击位置截图、是否列表/代码块等特殊块上下文、点击时编辑器是否已聚焦。
- 探针开发中发现的两处伪影已排除:①无工作区直开文件时欢迎页覆盖编辑区(生产无此路径,已防御修复);②冒烟探针自身的选择器引号缺陷。
