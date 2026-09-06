# 21: 应用图标(打包小项)

**What to build:** 终结 20 登记项「未配置应用图标(默认 Electron 图标)」。先立管线:同源色板取色的占位图标随包嵌入(win-unpacked 的 exe 显示应用图标),最终设计稿由人工到位后**只替换生成脚本源参重跑,不动打包配置**。

- 取色同源:浅色 accent `#1f6fcf` / 深色 accent `#6aa9f2`(src/renderer/src/index.css 色板,规格 §12 单点维护——图标生成脚本若需调色应引用同一批 hex,并在脚本注释标注来源)。
- 产物:`build/icon.ico`(多尺寸 PNG-in-ICO:16/20/24/32/40/48/64/128/256);electron-builder win 目标自动使用,package.json `build.win.icon` 显式写明;`build/generate-icon.ps1`(可重跑,源参常量置顶)。
- 生成脚本属可重跑管线(终稿素材到位后的换源入口),入库;图标位图本身入库(构建依赖,不在 .gitignore 范围)。
- 终稿素材替换口径:人工提供设计稿后改脚本源参重跑 → 重打包 → 视觉复核;不承诺设计(终稿为人工项,本票交付占位形态与管线)。

**Blocked by:** 20(打包配置在场;图标随包嵌入在 20 产物之上验证)。

**Status:** ready-for-agent

- [x] exe 图标不再是默认 Electron 图标:打包产物 `out/dist/win-unpacked/confidant.exe` 提取关联图标,像素采样确认蓝底白卡占位设计(32px:上/左缘 accent 蓝 r44,122,221 / r34,107,196、中心白卡、圆角 alpha 过渡)——非默认 Electron 标。
- [x] 生成脚本可重跑:删除 ico 重跑一次,md5 与首跑一致(d5249311…);9 尺寸(16–256)齐全。
- [ ] 人工项:最终图标设计稿确认 → 换源重跑 → 重打包复核(终稿素材到位前占位图标可随 20 人工尾一并发布,不阻塞)。

## 实现记录(21)

- 提交:`feat(21): 应用图标…`。
- 占位设计:accent 蓝圆角方底(上 `#2E7DE3` 下 `#1558A5` 垂直渐变,浅 accent 系取色,源参注释标 index.css 色板出处)+ 白色圆角纸卡(细描边 `#D8E6F5` 防浅任务栏同化)+ 三条圆头正文线(两长 `#84B0E5` 一短 accent `#1F6FCF`);几何比例参数化,16px 仍可读。
- 管线:`build/generate-icon.ps1`(纯 ASCII,PS 5.1 编码坑:UTF-8 中文注释会导致解析错乱——脚本内注释禁用中文,取色出处以 ASCII 指向 index.css);产物 `build/icon.ico`(PNG-in-ICO ×9);package.json `build.win.icon` 显式接线。
- 证据:重打包 `npm run dist:dir` 通过(首次 EBUSY 为安全扫描瞬时锁,重试即过);嵌入图标像素采样见上;采样图留 out/icon-check/(gitignore 内,不入库)。
- 陷阱登记:PS 5.1 读无 BOM UTF-8 会把多字节序列与换行错配导致解析错乱——生成类脚本一律纯 ASCII。
