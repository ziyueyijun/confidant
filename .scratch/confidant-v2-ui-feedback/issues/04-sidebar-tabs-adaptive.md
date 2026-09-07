# 04: 侧边栏选项卡自适应反馈轮

**What to build:** 用户一条界面反馈(grill-me 访谈决议,2026-09-08):

1. **【文件】【大纲】选项卡自适应宽度**:两个 tab 固定 84px → 各占标签栏
   一半(`flex: 1` 均分,随侧边栏 180–480px 宽度拉伸,标签栏被两个按钮
   完整填满;替代 v2 蓝图「tab 宽 84px」的固定值);文字 13px 居中、
   激活态加粗 + 底部 4px currentColor 色条不变。

**Blocked by:** None

**Status:** ready-for-agent

- [ ] tab `flex: 1` 均分;窄(180px)宽(480px)侧栏下均正确填满
- [ ] typecheck + 全量测试 + lint:boundaries 通过

## Answer

已实施:tab 固定 84px → `flex: 1` 均分,侧栏 180–480px 任意宽度下两按钮
各占标签栏一半、完整填满;激活态(加粗 + 底部 4px currentColor 色条)与
文字居中不变。纯样式改动,typecheck / 全量 192 测试 / lint:boundaries
均通过(无相关行为断言)。
