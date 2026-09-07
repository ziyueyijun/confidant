# 06: 表格去隔行换色反馈轮

**What to build:** 用户一条界面反馈(grill-me 访谈决议,2026-09-08):

1. **去掉表格隔行换色**:删除 `.editor-prose tr:nth-child(even) td` 规则
   (偶数行 `background: var(--block-bg)`);表头行(th)底色保留(另一条
   规则,非隔行)——内容行三主题下全部透明底。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 删除 nth-child(even) 规则;表头底色保留
- [ ] 实机确认三主题下表格观感

## Answer

已实施:删除 `.editor-prose tr:nth-child(even) td` 规则,内容行三主题下
全部透明底;表头(th)底色与加粗保留(仍与内容行有区分)。纯 CSS 删除,
无功能断言受影响;实机观感待用户确认。
