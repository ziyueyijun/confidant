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
