# 01: 应用骨架与最小编辑闭环

**What to build:** 从仓库工程骨架(packages/example)起步,立起整条可运行的最小竖切:桌面窗口启动 → 打开一个文件夹作为工作区 → 打开其中一份 .md 笔记 → 所见即所得编辑 → 保存写回磁盘。此票把技术栈基线、深模块包划分与「打开→编辑→保存」主循环一次打通,后续各票都在这条主循环上加能力。

- Electron + Vite + React + TypeScript 单窗口应用;窗口为系统标准装饰,单窗口形态(无标签页、无托盘、无状态栏、无应用内多窗口)。
- 功能包遵循 deep-module 规则(packages/README.md:入口点/私有实现/禁 barrel),编辑引擎以独立包封装;`npm run lint:boundaries` 通过。
- 引擎基线:TipTap 3.x + @tiptap/markdown(开启 GFM),扩展按规格显式注册清单接入(StarterKit 之外:Table/TableRow/TableCell/TableHeader、TaskList/TaskItem、Image——Image 必须注册,否则图片语法会被解析成纯文本丢链接);TipTap 与 markdown 桥锁小版本。
- 打开文件夹用过渡形态(欢迎占位页「打开文件夹」按钮 + 原生文件对话框选 .md 即可,文件树在 04 立起后替换此过渡入口);打开文件 → 渲染为所见即所得,普通文本输入直接可用。
- 保存(手动触发即可,Ctrl+S 或界面按钮):写回同一文件;自动保存与规范化由 02 接管,此票不承诺规范化。
- 输入基线:Enter 新段落/块,Shift+Enter 段内硬换行(保存回行尾两空格形式的序列化细节由 02 验收)。
- 首开体验不阻塞:占位页即可,欢迎页在 13 票做完整版。

**Blocked by:** None(可立即开工)。

**Status:** ready-for-agent

- [x] 应用启动显示桌面窗口,关闭/退出干净(单实例语义不在此票,仅窗口生命周期)。
- [x] 「打开文件夹」→ 选 .md → 编辑区显示文档的所见即所得渲染(标题、段落、列表、引用、代码、表格、任务列表等结构可读),不是源码。
- [x] 键入内容后保存,磁盘上的 .md 文件出现对应改动,内容仍为合法 Markdown,可被任意编辑器打开。
- [x] 打开含 YAML front matter 的笔记不崩溃、能编辑正文;front matter 区域不参与格式语义(字节保真承诺与等宽呈现由 02 验收,此票只保证不因加载即破坏——打开→保存后该块可读且结构完整)。
- [x] 打开含图片语法的笔记,保存后图片引用不丢(Image 显式注册生效;渲染解析在 06)。
- [x] Enter 换行产生新块,Shift+Enter 为段内硬换行。
- [x] 引擎包为独立 deep module,入口点边界清晰,`lint:boundaries` 通过;测试可从入口点导入运行(TipTap 扩展注册与基本往返有冒烟测试)。
- [x] 依赖锁定:TipTap、@tiptap/markdown 锁定小版本号。

## 实现记录(01)

- 提交:`feat(01): 应用骨架…`(分支 impl/confidant-v1)。
- 技术基线落定:electron-vite 5 + Electron 44 + React 19 + TS 5.9 + vitest(jsdom)+ Tailwind 4。
- 包:`packages/engine`(入口 index.ts:createEngine/Engine + splitFrontMatter;扩展显式清单 = StarterKit(3.31 含 Link/Underline)+ Table/Row/Cell/Header + TaskList/TaskItem + Image + @tiptap/markdown(gfm),锁 ^3.31.3);`packages/files`(原子写 writeTextFileAtomic,fs 适配器可注入)。
- 自动化证据:40 单测通过;`npm run lint:boundaries` 0 违规;Electron 真机自检 `CONFIDANT_SMOKE=1`(首屏探针 + 截图)与 `CONFIDANT_E2E_FILE=<fixture>`(打开→键入→点保存→磁盘校验:front matter 头字节不变、标记落盘、单换行结尾)通过。
- 人工复核项(观感/真 IME 手感/原生对话框)登记至 20;硬换行/图片语法往返由引擎单测覆盖。
