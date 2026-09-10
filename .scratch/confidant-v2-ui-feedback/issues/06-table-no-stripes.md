# 06: 表格去隔行换色反馈轮

**What to build:** 用户一条界面反馈(grill-me 访谈决议,2026-09-08):

1. **去掉表格隔行换色**:删除 `.editor-prose tr:nth-child(even) td` 规则
   (偶数行 `background: var(--block-bg)`);表头行(th)底色保留(另一条
   规则,非隔行)——内容行三主题下全部透明底。

**Blocked by:** None

**Status:** resolved

- [x] 删除 nth-child(even) 规则;表头底色保留(渲染层样式全仓 grep `tr:nth-child` 0 命中)
- [x] 实机确认三主题下表格观感(2026-09-10 冒烟夹具三主题截图 + computed 断言,见 Answer)

## Answer

已实施:删除 `.editor-prose tr:nth-child(even) td` 规则,内容行三主题下
全部透明底;表头(th)底色与加粗保留(仍与内容行有区分)。纯 CSS 删除,
无功能断言受影响;实机观感待用户确认。

**2026-09-10 收尾**:工作区冒烟新增表格夹具(`表格观感.md`,5×3)与
逐主题断言——内容行 `backgroundColor` 为 `rgba(0, 0, 0, 0)`、表头保留
`var(--block-bg)` 底色,三主题(github/night/newsprint)全部通过;截图即
表格观感直接证据(`out/smoke/theme-{github,night,newsprint}.png`,gitignore 内)。
观感如仍不满意,用户可随时推翻(回滚一处 CSS 删除即可)。
