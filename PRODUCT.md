# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Electron + React + Vite + TypeScript + shadcn/ui(用户确认;shadcn/ui 于 2026-09-06 补认,基于 Tailwind + Radix 的组件体系)。UI 渲染于桌面窗口,可直接读写本地文件系统。
开发与首验环境为 Windows 11;打包目标 OS:仅 Windows(Windows 10/11,决议见 .scratch/confidant-v1/issues/01-platform-range.md);Linux 与 macOS 不在首版范围。

## Users

面向大众的普通用户(用户确认),不预设技术门槛。具体目标画像未细分(未确认)。

## Product Purpose

本地的所见即所得 Markdown 编辑器,同时可当作本地笔记软件:用户像使用 Typora 一样打开本地文件夹,以 WYSIWYG 方式书写与组织 `.md` 文件,数据直接落在本地磁盘、由用户自己管理。

## Operating Context

- 桌面应用(Electron 窗口内使用),不是网页;界面与交互按桌面应用习惯设计(推断自所选形态)。
- 直接读写本地 `.md` 文件、本地文件夹作为工作区;「本地 markdown 工具」的固有意涵是本地优先。

## Capabilities and Constraints

已确认:

- 首版范围:完整 Typora 式替代 —— 文件树侧栏 + 所见即所得 Markdown 编辑 + 导出(用户选定「完整 Typora 式替代」)。
- 技术栈约束:Electron、React、Vite、TypeScript。

参照 Typora 推定、尚未逐项确认:文件树/文件管理交互细节、导出格式、图片粘贴与存放、全文搜索、主题与外观自定义、表格及进阶 Markdown 支持等 —— 以 Typora 为参照基线,具体清单留待构建规划时逐项确认,不得当作已承诺功能。

## Brand Commitments

- 名称:`confidant`,中文名「知己笔记」(README 唯一内容,仓库名)。
- 无其他品牌资产、配色、字体或风格承诺。

## Evidence on Hand

- README.md 一行产品描述:「confidant 知己笔记」。
- 无原型、截图、用户反馈、竞品调研资料;后续构建不得凭空编造这些证据。

## Product Principles

1. 本地优先:数据就是磁盘上普通的 `.md` 文件,用户随时可带走、备份、用其他工具打开。
2. 所见即所得:写作与阅读一体,不让用户为格式打断思路(参照 Typora 的核心体验)。
3. 大众可用:面向非专业用户,首次打开即能理解如何书写与组织笔记,不预设学习成本。
