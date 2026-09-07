# 01: 主题机制地基

**What to build:** 三主题切换机制落地——`data-theme` 两值扩三值（github/night/newsprint），三组 CSS 变量整体覆盖（newsprint 先用占位近似色值，票 02 精调视觉）；主题选择持久化、重启恢复；删除「跟随系统」（prefers-color-scheme 逻辑与「视图 → 外观」三态子菜单）；「视图 → 主题」子菜单三勾选占位（票 07 提级为顶级菜单）；按需补充新 token（`--blur-text`、`--tree-active-border` 等）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `data-theme` 三值切换即时生效，全界面（编辑区/侧边栏/浮层/横幅）随主题整体换色
- [ ] 主题选择持久化：重启应用后保持所选主题
- [ ] 「跟随系统」彻底移除：无 prefers-color-scheme 逻辑；「视图 → 外观」（跟随系统/浅色/深色）子菜单不存在
- [ ] 「视图 → 主题」子菜单列出三主题勾选（勾选态与 data-theme 联动）
- [ ] 主题状态机单测通过（三态切换、持久化读写）
- [ ] smoke 断言：`data-theme` 三值分别可设；三主题各截一屏存档
- [ ] 现有功能无回归（菜单、打开/保存、侧边栏照常）
