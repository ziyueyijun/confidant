# 02: 编辑区视觉基线

**What to build:** 编辑区观感 Typora 化（github 基线）：内容宽度分级限宽（860px，≥1400px 视口 1024px、≥1800px 视口 1200px，窄窗两侧 ≥16px 留白）；标题体系对齐基线（h1 2.25em/h2 1.75em/h3 1.5em/h4 1.25em/h5·h6 1em、bold、h1/h2 1px 下边框）；正文行高 1.7、块间距 0.8em、引用 4px 灰字、表格表头/偶数行底色、40vh 底部滚动余量保留；代码块视觉（圆角 3px、字号 0.9em、行号 #999 右对齐、语言标签）；front matter 预览块颜色进主题（字节行为不变）；三主题西文字体资产（github/night Open Sans、newsprint PT Serif，Google Fonts 官方源引入）+ 中文微软雅黑显式声明。

**Blocked by:** 01 (can start after)

**Status:** ready-for-agent

- [ ] 宽度分级实测生效（普通窗口 860px；≥1400px 视口 1024px；≥1800px 视口 1200px；窄窗 ≥16px 留白）
- [ ] 标题体系对齐（字号比例、bold、h1/h2 下边框吃主题变量）
- [ ] 行高 1.7、块间距 0.8em、引用 4px 灰字、表格表头/偶数行底色生效；40vh 滚动余量保留
- [ ] 代码块圆角 3px、0.9em、行号 #999 右对齐；语言标签显示（验证引擎 codeBlock language 属性；拿不到则降级「不显示标签」并在票内记录依据）
- [ ] front matter 预览块颜色吃主题变量；打开→保存字节一致（不变量守护）
- [ ] newsprint 主题下排版适配（引用/表格按纸感变体基线）
- [ ] 字体资产落地：Open Sans/PT Serif 随主题生效、中文走微软雅黑、代码链 Consolas/微软雅黑/monospace
- [ ] 引擎回归矩阵跑绿
- [ ] smoke：默认主题下编辑区截图存档

## Answer

已实施并实机复验(smoke 排版探针:h1 36px/bold/~1px 下边框、p 0.8em、宽度分级 860/1024/1200px 实测;字体加载断言;语言标签断言;引擎回归矩阵 83 例绿)。

- 宽度分级:`.editor-prose` max-width 860px,视口 ≥1400→1024、≥1800→1200,窄窗两侧 ≥16px 留白(media query);源码编辑器与 front matter 块同宽分级。
- 标题体系:h1 2.25em/h2 1.75em/h3 1.5em/h4 1.25em/h5·h6 1em、统一 bold、h1/h2 1px 下边框(`--heading-border`);h6 灰字。
- 块级:行高 1.7 保留、块间距 0.8em、引用 4px 左边框 + 灰字、表格表头/偶数行底色(`--block-bg`)、40vh 底部余量保留。
- 代码块:圆角 3px、0.9em、行号 `--code-ln`(#999 系)右对齐、语言标签砖红 `--lang-tag` 左上(行号开启时让位 3.4em)。
- **语言标签实现路径(实施中验证并修正)**:引擎 codeBlock 节点 `language` 属性可拿到(与 lowlight 高亮同源)。渲染层直写 `pre[data-language]` 会被 ProseMirror DOM 观察器当外部变更重渲染抹掉(Chromium 实测,ws 多次复现)——改为引擎侧 widget 装饰(纯视图态,与行号同机制,文档/序列化零改动)。无语言围栏不显示标签。
- 引擎新增只读 `getDoc()` 访问器(渲染层派生数据 seam;不变量不受影响,seam 集成测试守护)。
- front matter 预览块颜色进主题(`--muted` 灰字,字节行为不变——磁盘校验探针绿)。
- 字体:Open Sans(可变字体单文件 400-700)/PT Serif 400/700/400italic 自 Google Fonts 官方源下载打包(woff2,SIL OFL,四个文件共 ~146KB);github/night 用 Open Sans、newsprint 用 PT Serif,中文微软雅黑体系,代码链 Consolas/微软雅黑/monospace。
- 修复既有竞态:工作区命中跳转高亮改由面板在挂载清除后补写(SearchPanel `jump` prop,08 修),消除 React 提交时机导致的高亮被清(ws 时好时坏,ws10-17 多轮定位)。
