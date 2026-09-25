# confidant

本地优先的个人知识管理桌面应用**知己笔记**。笔记是用户自己的纯 Markdown 文件。

**命名**：中文名 **知己笔记**，英文名 **`confidant`**——名字本身就是这四个字与这九个字母，不加任何装饰标记。命令行、包名、路径、appId 一律用 `confidant`。

## 当前状态

**规划阶段：当前工作是定案，不是实现。** 功能范围与技术方案在 [wayfinder map](https://github.com/ziyueyijun/confidant/issues/1)（#1）下逐项定案，终点交付物是**一份可直接开工的 spec**。

## 何时读什么

| 触发条件 | 材料 |
|---|---|
| 要命名任何东西（issue、代码、文档、变量） | `CONTEXT.md` —— 术语表。用它的词，别漂移到 `_Avoid_` 列出的同义词 |
| 要做架构决策，或质疑某个既有做法 | `docs/adr/` —— 已定决策与理由。先确认不是重复踩坑 |
| 要断言任何技术事实 | `docs/research/` —— **事实基座**。`0001` 是索引式总集（含大量实机实测数据），其余是专项调研。查过再开口，不要重复调研 |
| 要写 issue、文档、提交信息 | `docs/agents/privacy.md` —— **本仓库公开**，绝不写入路径、凭据、机器指纹、第三方信息、版权内容 |

## 工作方式

Issue 在 GitHub Issues，用 `gh` CLI。创建、读取、关闭的约定见 `docs/agents/issue-tracker.md`；工作流标签见 `docs/agents/triage-labels.md`；域文档的组织约定见 `docs/agents/domain.md`。
