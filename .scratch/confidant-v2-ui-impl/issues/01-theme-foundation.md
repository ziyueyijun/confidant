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

## Answer

已实施并实机复验(workspace E2E 全绿,三主题切换断言 + 每主题截图存档 `out/smoke/theme-{github,night,newsprint}.png`)。

- `data-theme` 三值(github 默认/night/newsprint),三组 CSS 变量整体覆盖;变量集沿用既有语义体系、按需补充(`--blur-text`、`--tree-active-*`、`--search-hit-*`、`--toolbar-*`、`--footer-*`、`--banner-*`、`--toast-*`、`--code-ln`、`--lang-tag`、`--heading-border`、`--font-body/ui/code`、`--link`)。色值依据 research/typora-visual-baseline.md §1 三主题表;newsprint 代码高亮 token 复用亮色(08 实测依据)。
- 「跟随系统」彻底移除:`prefers-color-scheme` 逻辑删除、「视图 → 外观」子菜单不存在;`use-app-theme` 改三态 + 持久化迁移(light→github、dark→night、system/非法→github,`normalizeTheme` 单测守护)。
- 「视图 → 主题」子菜单三勾选(setChecked 联动);07 提级为顶级菜单。
- 主题状态机纯函数 `theme/theme-state.ts` + 单测 5 例;smoke 5.6 段改三主题断言。
- 无回归:打开/保存/侧边栏/查找/代码块等全部既有探针绿。
