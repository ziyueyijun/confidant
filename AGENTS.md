# AGENTS.md

功能包都是 deep module:新增或导入包之前,先读 [packages/README.md](./packages/README.md) 了解入口点边界。

## Agent skills

### Issue tracker

本仓库的工作项以本地 markdown 文件跟踪,存于 `.scratch/<feature>/` 下。见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认 triage 角色标签,标签字符串与角色名一致。见 `docs/agents/triage-labels.md`。

### Domain docs

Single-context 布局:`CONTEXT.md` 与 `docs/adr/` 位于仓库根目录。见 `docs/agents/domain.md`。
