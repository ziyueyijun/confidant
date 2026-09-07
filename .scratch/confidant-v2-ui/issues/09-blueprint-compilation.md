# 09-blueprint-compilation

Status: resolved
Type: task
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08

## Question

**蓝图汇编**：把各票的决议汇总为一份「仿 Typora 界面改造蓝图」完整文档，并拟定对照验收清单，交付用户评审。这是本 map 的目的地本体。

待完成：

1. 汇总票 01-typora-visual-baseline（视觉基线）与 02~08 七个 grilling 票的 Answer，按主题组织为蓝图文档：视觉方向、窗口骨架与菜单、主题系统、编辑区排版、视图模式、大纲面板、状态信息条、浮层重设计，每节含「现状 → 目标 → 决议依据」与取舍理由。
2. 蓝图附录：**对照验收清单**——逐项列「Typora 有而 confidant 没有 / 双方都有但行为不同 / confidant 独有」，每项标注目标行为与验收方式（Typora 42.2.0 就在本机，可并排比对）。
3. 蓝图附录：实施顺序建议（依赖关系与阶段划分），供后续实施 effort 使用。
4. 交付用户评审一次；评审意见（若有）在蓝图内更新后，本票 resolve，map 完成。

产出：`.scratch/confidant-v2-ui/blueprint.md`，记录于本票 Answer（含评审结论）。

## Answer

（2026-09-07。蓝图初稿交付评审；用户以调用 /to-spec 表示评审通过，无修改意见。）

产出：`.scratch/confidant-v2-ui/blueprint.md`（§1 视觉方向 + §2-8 各决议主题 + 附录 A 对照验收清单 / 附录 B 实施顺序 / 附录 C 待办风险）。

评审结论：通过（用户直接进入 /to-spec，未提出修改意见）。蓝图作为 to-spec 的输入；后续 spec 阶段若发现蓝图缺漏，回修蓝图并在此记录。
