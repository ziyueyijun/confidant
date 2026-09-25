# 用 CodeMirror 6，不用 ProseMirror / TipTap

编辑器内核选择 CodeMirror 6——**直接在 Markdown 文本上做渲染装饰**，而不是用 ProseMirror/TipTap 那类带独立文档模型的富文本内核。

后者有自己的一套 JSON 文档树，界面上编辑的是那棵树，需要序列化回 Markdown 才能存盘——于是必然存在「文件里的文本」与「编辑器里的文档」两个状态。用 Typora 或记事本改一次文件，编辑器就要做一次 Markdown → JSON 的反向解析，而**这个解析是有损的**：Markdown 能表达的东西里总有一部分会被那个模型吃掉或改写。那正是本项目要躲开的东西（见 ADR-0003）。

代价是真实的：块级交互（拖动一段文字、多列排版）体验不如 ProseMirror 路线顺滑。但本项目已定**文件为原子单位、链接只做到小节级**，这个优势对本项目没有价值。

## 相关

- 参照：note-gen 混用 CodeMirror 6 与 TipTap 3，同时踩了 IME 与 Tauri 拖放的坑（`docs/research/0001-技术事实基础.md` §1、§2）
