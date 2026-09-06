# 编辑引擎现状研究

Type: research
Status: resolved

## Question

盘点能承载「Typora 式所见即所得 Markdown 编辑体验」的可行方案,产出给后续引擎选型决策(独立的 HITL 票)作输入。

调研要求:

- 候选范围:开源优先,主流编辑器内核及其 Markdown 上层均可入列(如 CodeMirror 6、ProseMirror 及其上层 TipTap / Milkdown、Lexical,以及「源码编辑 + 独立实时预览」的混合结构);若存在非内核的完整解决方案也如实列入。
- 输出内容:候选清单;能力边界矩阵(表格编辑、图片粘贴与内联、WYSIWYG 双向编辑/实时预览、性能体感、Electron + React + TypeScript 集成、许可证与维护活跃度);各方案对「本地 .md 文件,打开即写、所见即所得」模式的适配难点。
- 结论:给出建议进入原型验证的 1–2 名,并注明理由与风险。
- 证据纪律:以一手来源为准(官方文档、仓库、维护者声明);查证不到的能力标注「未验证」,不猜不补。
- 语种:中文产出。

## 决议

(由 research 子代理执行并记录;本票可在建图会话内直接开火。)

## Answer

候选池八项(CM6/ProseMirror/TipTap/Milkdown/Lexical/MarkText/Vditor/TOAST UI,均 MIT,TOAST UI 已归档),全部结论已标【已核实】/【推测】/【未验证】;建议进入原型验证 TipTap(首选,官方 @tiptap/markdown 双向桥 2025-10)+ Milkdown(备选对照,同属 ProseMirror 族,官方定位即 Typora 式 WYSIWYG markdown);CM6+自研渲染与 Lexical 列观察位,若「源文 1:1 不重排」定为硬约束则优先级反转。详见 docs/research/engine-survey.md。
