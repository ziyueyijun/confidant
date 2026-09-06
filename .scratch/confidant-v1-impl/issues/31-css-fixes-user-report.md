# 31: 修复用户实测反馈(内容宽度自适应/复制按钮尺寸/行号单列)

**Type:** task
**Blocked by:** 无。
**Status:** resolved

**What to build:**

1. **内容区宽度自适应撑满**:内容列从固定 `min(860px, 100% - 32px)` 改为 `min(60vw, 100% - 32px)`(左右留白 ≈ 20%,与用户口径「内边距为 20% 就可以」一致;窄窗 16px 留白下限由 min() 保证)。实测:1920 窗口内容列 812 → 1144px。
2. **代码块复制按钮尺寸**:按钮同时设 `left`(计算位置)与 `right: 8`,绝对定位被拉伸成整宽(实测 495px)。改为只定位 `top`,水平贴右缘 shrink-to-fit(实测 45px)。
3. **行号单列**:`.code-linenums` 的 `white-space: pre` 声明在 CSS 文件中 computed 为 `normal`(机制未明:规则在 CSSOM 中声明正确、同规则其他属性生效、inline/!important 均生效;疑似 Chromium Text Level 4 white-space 拆分下的怪癖),多行数字被折叠折行成「2 列」。行号改为**每行一个块级 span**(`.code-ln`,display:block + flex column),彻底不依赖 white-space。

## 诊断记录(31, diagnosing-bugs 流程)

- 反馈回路:文件竖切 E2E 内置 `[DEBUG-css]` 探针(读 computed style/rect/innerText/规则枚举,已删除),dev 与打包产物均可跑。
- 关键证据:`.code-linenums` 规则 CSSOM 声明 `white-space: pre` 正确;computed `normal`;inline style 与 `!important` 均生效;递归枚举样式表无其他 white-space 声明;`font: inherit` 排除(注释后依旧 normal)。根因机制未完全定位,采用不依赖该属性的 span 块方案(100% 确定行为)。
- 行号「2 列」复现:3 行代码块下行号 `innerText` 为 `"1 2 3"`(折叠后 46px 宽折行);修复后 `"1\n2\n3"`。
- 已知 smoke 偶发(非本票引入):工作区竖切 6.3 链接锚点偶发超时(重跑即绿),待后续排查。

## 验收

- [x] typecheck / 149 单测(行号断言改为 span 结构)全绿。
- [x] 文件竖切(3 行代码块夹具)、工作区竖切、首屏冒烟全绿。
- [x] 重新打包后产物两竖切全绿。

## 实现记录(31)

- 提交:`fix(31): 内容区宽度自适应 60vw;复制按钮尺寸;行号单列(span 块)`。
- index.css:`.editor-prose`/`.fm-block` `max-width: min(60vw, 100% - 32px)`、左右 padding 归零;`.code-linenums` 改 flex column + `.code-ln` 块级 span(移除对 white-space 的依赖)。
- CodeBlockActions:place 只算 top;按钮不再设 left。
- code-block-view.ts:行号 widget 生成 N 个 `.code-ln` span。
- 测试:code-block-view.test.ts 行号断言改为 `.code-ln` 列表;冒烟 6.4 代码块断言不变(单行)。
