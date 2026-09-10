# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目是什么

confidant(知己笔记):本地优先、所见即所得(WYSIWYG)的 Markdown 桌面笔记(Electron + React + Vite + TypeScript)。用户像使用 Typora 一样打开本地文件夹作为工作区,直接读写磁盘上普通的 `.md` 文件。单窗口形态;首版仅面向 Windows 10/11;界面简体中文、不设 i18n。

- 产品口径以 [PRODUCT.md](PRODUCT.md) 为准;**首版规格在 [.scratch/confidant-v1/spec.md](.scratch/confidant-v1/spec.md)**——代码与票中反复出现的「规格 §N」均指该文件章节号(如 §9.3 关窗数据保护、§4.3 front matter 保留);v2-ui 界面改造规格另在 [.scratch/confidant-v2-ui-impl/spec.md](.scratch/confidant-v2-ui-impl/spec.md)(决议汇编于 [.scratch/confidant-v2-ui/blueprint.md](.scratch/confidant-v2-ui/blueprint.md) 与 [research/typora-visual-baseline.md](.scratch/confidant-v2-ui/research/typora-visual-baseline.md))。
- [AGENTS.md](AGENTS.md) 与 [packages/README.md](packages/README.md) 是对 agent 的行为规则,动工前先读。
- 语言:文档、规格、票与 commit message 用中文;代码标识符与路径用英文。commit 遵循 conventional commits,scope 用工单号(如 `feat(15): 全工作区搜索…`)。
- PRODUCT.md 记技术栈含 shadcn/ui;仓库目前没有 components.json 与 Radix 依赖,现有组件是基于 class-variance-authority + tailwind-merge + lucide-react 的自研实现。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | electron-vite 开发(渲染层热更) |
| `npm run typecheck` | 全仓 `tsc --noEmit` |
| `npm test` / `npm run test:watch` | vitest run / watch |
| `npx vitest run <文件路径>` | 只跑单个测试,如 `npx vitest run packages/engine/tests/frontmatter.test.ts` |
| `npm run lint:boundaries` | dependency-cruiser 包边界检查(新增/挪动包后必跑) |
| `npm run dist:dir` | electron-vite build + electron-builder win dir → `out/dist/win-unpacked/confidant.exe` |

测试 = vitest + jsdom(`src/test/setup.ts` 给 ProseMirror/TipTap 打 rAF 补丁)。include 规则见 [vitest.config.ts](vitest.config.ts):包测试放 `packages/*/tests/`,应用测试与源文件同目录(`src/**/*.test.ts`)。

自检/冒烟(dev 辅助,实现于 [src/main/smoke.ts](src/main/smoke.ts)):设环境变量后启动应用即自动执行,成功时进程退出码为 0——

- `CONFIDANT_SMOKE=1`:首屏探针 + 截图;
- `CONFIDANT_E2E_FILE=<fixture .md 绝对路径>`:打开 → 编辑区键入 → 自动保存 → 磁盘校验的端到端竖切;再加 `CONFIDANT_E2E_FLUSHONCLOSE=1` 时验证关窗 flush 不丢内容。
- `CONFIDANT_E2E_WS=<工作区目录>`(可加 `CONFIDANT_E2E_WS_EMPTY=<空目录>`):工作区竖切(树操作/拖拽移动/三主题截图/表格断言等),会写夹具目录(新建文件、删 a.md 等),**每次运行须用全新目录或重建夹具**,否则残留导致断言错位。

任何环境门存在时 userData 自动隔离到 `%TEMP%\confidant-e2e-state`,不污染真实应用状态(见 [src/main/index.ts](src/main/index.ts) 顶部)。打包产物的实测记录见 [.scratch/confidant-v1-impl/issues/20-packaging-and-verification.md](.scratch/confidant-v1-impl/issues/20-packaging-and-verification.md)。

## 架构

四区布局(electron-vite 三进程 + 共享层,别名见 [electron.vite.config.ts](electron.vite.config.ts) 与 [tsconfig.json](tsconfig.json)):

- `src/shared/` —— **IPC 协议单一事实源**([ipc.ts](src/shared/ipc.ts):通道名常量、`ConfidantApi`、`Result<T>` ok/error 判别式 + `ErrorInfo`),另有路径纯函数。三侧共用,别名 `@shared`。
- `src/main/` —— 主进程。[index.ts](src/main/index.ts):窗口生命周期 + IPC 承载,关窗前请求渲染层 flush 未落盘内容(2s 超时兜底);[workspace.ts](src/main/workspace.ts):chokidar 监听 + 250ms 去抖整体重扫后广播树更新;[menu.ts](src/main/menu.ts):按渲染层模板构建 native 菜单;[state-store.ts](src/main/state-store.ts):持久状态防抖落盘;[asset-protocol.ts](src/main/asset-protocol.ts):自定义 `confidant-img://` 资产协议供渲染层加载本地图片。
- `src/preload/` —— contextBridge 暴露类型化 `ConfidantApi`(与 shared 契约一致);渲染层不直接触 ipcRenderer。
- `src/renderer/` —— React 19 + Tailwind v4 界面与 TipTap 编辑,别名 `@` 指其 `src/`。

功能包一律为 **deep module**(规则见 [packages/README.md](packages/README.md),dependency-cruiser 强制:包外只能 import 包根入口点、`lib/` 内部私有、测试只能经入口点、禁 barrel、无环):

- `packages/engine` —— 编辑引擎(TipTap 3 + `@tiptap/markdown`,GFM):markdown ↔ WYSIWYG 文档装载/序列化、front matter 拆拼(原始字节保留)、查找高亮(decoration 临时层,不进文档不落盘)。不感知 React/文件系统/UI;**只被渲染层引用**。
- `packages/files` —— 主进程磁盘服务:文本读写与原子写、整树扫描、图片落盘与防撞命名、移动/改名/回收站。不依赖 Electron API;**只被主进程引用**(`src/shared/ipc.ts` 对它的 import 仅为类型转发)。
- `packages/example` —— 新包的复制起点。

渲染层数据流:打开 `.md` → IPC 读文件 → [editor/note-document.ts](src/renderer/src/editor/note-document.ts) 解析 → `createEngine`(唯一引擎实例,见 App.tsx)装载 → 编辑 → 序列化回拼 → [editor/save-pipeline.ts](src/renderer/src/editor/save-pipeline.ts)(防抖自动保存、IME 组合期门控、关窗 flush)→ IPC → `writeTextFileAtomic`。命令与菜单:渲染层 [menu/menu-bridge.ts](src/renderer/src/menu/menu-bridge.ts) 是单一命令面(注册表 + 下发菜单模板)→ 主进程建 native 菜单 → 点按回传命令 id。引擎扩展必须显式注册(Image 不注册会被静默降级成纯文本,违反「不得静默丢内容」)。`App.tsx`(约 740 行)编排文件操作、外部变更处置(自回声 2s 时间盒抑制)、启动恢复等;其余 UI 逻辑经票 22–24 按域拆到 `components/`(Sidebar/Footer/FormatToolbar/OutlinePanel 等)、`hooks/`、`theme/`(三主题状态机)、`preferences/`(偏好设置窗口)、`workspace/`、`session/`、`print/` 等目录(拆分记录见 [docs/tech-debt.md](docs/tech-debt.md));可单测的纯逻辑集中在 `editor/` 下。

核心不变量(有测试矩阵守护):front matter 字节原样保留;源文除明确规范化(统一行尾、单尾换行)外不被改写;任何语法不得静默丢失(引擎有 normalization-matrix / roundtrip 等测试)。新增能力若触碰这三条,须同步补矩阵用例。

## 工作流约定

- 工作项以本地 markdown 跟踪在 `.scratch/<effort>/`(不上 GitHub Issues),约定见 [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) 与 [docs/agents/triage-labels.md](docs/agents/triage-labels.md)。两个 effort:`confidant-v1`(规格决议,汇编产物 spec.md)与 `confidant-v1-impl`(实现,票 01–20 按依赖序,票头 `Status:`/`Blocked by:`,决议追加 `## Answer`)。代码注释里的 `(05)`、`(10-12)` 即 impl 票号。
- 现状:v1 已完结——confidant-v1 决议 + confidant-v1-impl 实施票 01–31 全部提交 master(26–31 为用户复验修复轮),记录见 [docs/tech-debt.md](docs/tech-debt.md) 与 [CONTEXT.md](CONTEXT.md);收官口径(2026-09-10):票 20 按用户指示收官(人工首验清单 1–6/DPI/干净机安装未逐条留档,票内保留补验入口)、票 21 图标 v2 终稿经用户实机确认。**v1 附录 B 画像假设检验:用户裁决不再执行**(记录单已删,回溯见 git 历史;v2 正式范围不再以其为前置)。
- **v2-ui 界面改造(仿 Typora)三阶段 effort 已完成并合入 master(2026-09-10 自 `research/typora-visual-baseline` fast-forward 合并,分支已删)**:① 蓝图 effort [.scratch/confidant-v2-ui/](.scratch/confidant-v2-ui/)(map.md + blueprint.md + 票 01–09;视觉基线实读自本机 Typora 42.2.0 三主题 CSS);② 实施 effort [.scratch/confidant-v2-ui-impl/](.scratch/confidant-v2-ui-impl/)(spec.md + 票 01–08,commit 前缀 `v2-NN`);③ 反馈轮 effort [.scratch/confidant-v2-ui-feedback/](.scratch/confidant-v2-ui-feedback/)(票 01–06,commit 前缀「反馈轮NN」,内容为 grill-me 访谈决议的界面微调,决议要求 HITL 与用户本人对话、agent 不得代答;各票 Answer 附实测结论)。实施票引用「蓝图附录 A」「基线 §N」即 blueprint.md 与 research/typora-visual-baseline.md 对应章节。
- 一次性产物(原型、临时脚本、构建残留)不入库(`engine-prototype/`、`.claude/`、`out/` 已在 .gitignore)。
- 领域词汇与裁决依据沉淀在规格与票中;仓库尚无 CONTEXT.md 与 ADR(按 docs/agents/domain.md 惯例,需要时惰性建立,不必预设)。
