# 25: 界面微调(窗口状态记忆/欢迎页去主按钮/标语行/编辑菜单中文与段落格式快捷键)

**What to build:** 四项界面微调(grill 访谈裁决已定,均按推荐执行;裁决记录见下)。

1. **窗口状态记忆**:`state.json` 新增 `window` 键(是否最大化 + 正常态 bounds);resize/move/maximize/unmaximize/close 时记录(防抖落盘);启动时恢复——最大化在显示前套用,避免闪现;保存位置与任一显示器工作区无交集时回退默认尺寸;最小化不作为持久记忆。
2. **欢迎页移除【打开文件夹】按钮**:仅保留产品名、标语行、最近打开列表;文件菜单「打开文件夹」补 **Ctrl+O**(首用主入口);`Welcome` 的 `onOpenFolder` prop 一并删除。
3. **标语行**:欢迎页副标题改为「**最懂你的笔记软件**」(原「confidant · 像写字板一样,直接写在你的文件夹里」,全仓库唯一出现处 Welcome.tsx)。
4. **编辑菜单全中文 + 段落/格式快捷键**:
   - 剪切/复制/粘贴/删除 4 个 role 项补显式中文 label(系统英文环境下不再显示英文)。
   - 段落:标题 1-6 **Ctrl+1..6**、正文 **Ctrl+0**、无序 **Ctrl+Shift+]**、有序 **Ctrl+Shift+[**、任务 **Ctrl+Shift+9**、引用 **Ctrl+Shift+Q**、代码块 **Ctrl+Shift+K**、表格 **Ctrl+T**。
   - 格式:删除线 **Ctrl+Shift+S**、链接 **Ctrl+K**、清除格式 **Ctrl+Shift+L**、插入图片… **Ctrl+Shift+I**(开发期 DevTools 惯用键让位,已裁决接受)。
   - 编辑器 TipTap 默认键位(Ctrl+Alt+1..6 等)保留为次级绑定,与新键无冲突。

**Blocked by:** 无。

**Status:** ready-for-agent

## 裁决记录(25,grill 访谈 Q1-Q11)

- Q1 记忆范围:持久化「是否最大化 + 正常态 bounds(最大化前值)」;重启忠实还原大小与位置。
- Q2 显示器兜底:bounds 与任一显示器工作区无交集 → 回退默认尺寸(OS 默认放置);有交集原样恢复。
- Q3 最小化退出:忽略最小化,恢复上次记忆的最大化/正常态。
- Q4 标语行边界:界面只改欢迎页一处(全仓库唯一);文档无旧标语,无需同步;去掉「confidant · 」前缀。
- Q5 快捷键方案:以 Typora 蓝本为主线,冲突检查后逐项定(见上);删除线因与 TipTap 默认一致取 Ctrl+Shift+S,任务列表取 Ctrl+Shift+9(与 TipTap 默认一致)。
- Q6 首用发现性:按用户要求彻底移除按钮;入口收敛为菜单(Ctrl+O 补上)。
- Q9 文档同步:规格 §6 欢迎页描述去掉「主按钮」;§7 快捷键固定清单扩表。
- Q10 smoke 判据:欢迎页标记由「不含『打开文件夹』」改为「不含标语行」。
- Q11 流程:四项合一,票 25;验收 typecheck/矩阵/smoke/E2E + 窗口记忆重启实测。

## 验收

- [x] `npm run typecheck` / `npm test`(135)全绿。
- [x] `npm run lint:boundaries` 0 违规。
- [x] smoke(菜单结构/中文 label/新 accelerator/欢迎页标语断言)+ E2E 复验通过。
- [x] 窗口记忆实测:注入 maximized/bounds → 重启,state.json 闭环证据(见实现记录)。

## 实现记录(25)

- 提交:`feat(25): 界面微调…`(见 git log)。
- 窗口状态记忆:`AppStateV1` 新增 `window` 键(不升版本,旧 state.json 合并默认);新模块 [src/main/window-state.ts](src/main/window-state.ts) 承载恢复/捕获/屏外兜底;创建窗口恢复几何,最大化在 `show` 前套用;resize/move/maximize/unmaximize/close 全挂捕获。
- 顺带修复:`flushState()` 原实现只等"已在途"写入,300ms 防抖计时器未触发则丢弃 state——窗口状态恰在 close 瞬间捕获,正常退出必丢;改为计时器未触发时补一次立即写(对所有 state 键是纯改进)。
- 欢迎页:移除按钮与 `onOpenFolder` prop;标语行改「最懂你的笔记软件」;菜单「打开文件夹」补 Ctrl+O。
- 菜单:4 个 role 项(cut/copy/paste/delete)补显式中文 label;段落 9 键 + 格式 4 键按裁决表落地(含引擎 TipTap 默认键位保留为次级绑定)。
- 验证:typecheck ✓;135 单测 ✓;boundaries 0 ✓;smoke 首屏(新标语断言)+ 菜单断言(剪切中文/Ctrl+1/Ctrl+O)✓;E2E 自动保存 + 菜单命令保存 ✓;关窗 flush 变体 ✓(exit 0 + 磁盘标记)。
- 窗口记忆闭环实测(注入 state.json → 冒烟重启 → 关窗再捕获比对):
  - 正常态捕获/恢复:close 落盘 1200×800 默认位置;注入 1300×900 @(20,20) → 还原,再捕获一致。
  - 最大化:注入 `maximized:true` → 窗口以最大化启动,close 再捕获仍为 `true`(恢复未生效会被重写为 false,以此闭环)。
  - 屏外兜底:注入 (-5000,-5000) → 回退默认尺寸,close 再捕获为屏内默认坐标。
- 规格同步:§6(欢迎页去主按钮 + 窗口状态记忆条款)、§7(快捷键固定清单扩表 + role 显式中文);新建仓库首个 CONTEXT.md(欢迎页/标语行/窗口状态/工作区)。
