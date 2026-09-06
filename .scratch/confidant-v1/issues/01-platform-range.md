# 平台范围

Type: grilling
Status: resolved

## Question

首版(v1)的目标平台范围是什么?仅 Windows,还是 Windows + macOS(Linux 是否也在考虑内)?

背景:PRODUCT.md 记载开发与首验环境为 Windows 11,打包目标 OS 范围未确认;Typora 本体跨 Windows/macOS/Linux。决策影响:打包与签名、文件对话框差异、快捷键约定(Ctrl vs ⌘)、测试矩阵、规格中所有涉及平台的条目(如导出、图片粘贴路径、文件监视行为)。

参照基准:大众用户桌面市场分布;产品三原则不预设平台立场。

## Answer

**决议:首版平台 = 仅 Windows。**

- 规格一切平台相关条目(快捷键、路径、换行、文件监视、文件对话框)按 Windows 单平台写死,不加多平台变体。
- 目标系统下限:Windows 10/11(跟随 Electron 官方支持面;对 Windows 7/8 无承诺)。
- Linux:划出本 effort(已记入地图 Out of scope)——Typora 提供 Linux 版只是交互参照,不构成发行平台义务;将来要补属目的地重画。
- macOS:不承诺、不规划;不引入双平台打包矩阵与 ⌘ 约定。Electron 结构不主动堵死后补,但规格不为其留位。
- 依据:单人开发 + 仅 Windows 首验环境;macOS 发布需要 Apple 账号/公证/真机验证,当前无闭环;「大众」任一主流市场 Windows 覆盖最大。
- 影响面:本票只锁平台范围;打包/签名/发布渠道属实现 effort 的决策,不进规格。
