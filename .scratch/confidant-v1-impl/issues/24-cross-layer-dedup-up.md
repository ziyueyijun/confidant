# 24: 跨层/包内重复上收(judgement calls)

**What to build:** 清偿 tech-debt.md 第 2 条。把散在多层、语义同一的纯函数收为单一事实源,消灭「改一处漏一处」的漂移面。**上收只动位置与导入,不改变语义与签名外的行为**;原调用侧行为等价。

上收清单(23 票探查 + tech-debt 登记,目标 @shared/path 系):

1. 图片扩展名判定正则 `IMG_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i` 两份同款:`src/main/asset-protocol.ts` 与 `src/renderer/src/editor/image-insert.ts` → @shared 单一常量/判定函数,两处改引。
2. `noteStemOf`/`noteDirOf` 系:`packages/files/lib/image-save.ts`(经 index 导出)、`src/renderer/src/editor/image-insert.ts` → 同源实现,渲染层不再自写。
3. `countMarkdown`(App.tsx/workspace.ts)vs `countMdInTree`(packages/files/lib/tree.ts)→ 收敛命名与语义为单一实现(主进程侧为真源,渲染层改调或收敛到 shared 纯函数,按 dependency 方向定夺)。
4. `finalizeMarkdown`(renderer/note-document.ts)vs `ensureSingleTrailingNewline`(engine/lib/engine.ts)→ 单一实现;注意 engine 是零外部依赖 deep module,上收目标若引入 engine→shared 依赖需先过 lint:boundaries 与 packages/README 规则,否则以「渲染层单向复用 engine 导出 + 删除自写」落定。
5. SearchPanel ref 值进 effect(`treeTickRef.current`)→ 一并进 state(tech-debt 第 2 条末项;树刷新与搜索刷新的时序语义不变)。

**Blocked by:** 23(第 1 项清单来源之一,23 发现项并入;先 23 后 24 免同函数重叠改)。

**Status:** ready-for-agent

- [x] `npm run typecheck` / `npm test`(135)(涉及矩阵:front matter、roundtrip、image-save、tree、note-document、html-sanitize 相关全绿)。
- [x] `npm run lint:boundaries` 0 违规。
- [x] 全仓无重复实现残留:检索复核 IMAGE_EXT_RE / noteStemOf / countMarkdown / finalizeMarkdown 各只剩单一定义(余者为 import/再导出/别名)。
- [x] SearchPanel 树刷新行为回归:树节拍改为 state,treeTick 进 effect 依赖(修复 ref 变更不触发重跑);行为经 smoke/E2E 抽样。

## 实现记录(24)

- 提交:`refactor(24): 跨层重复上收…`(492301b)。
- 上收落点:图片扩展名正则 ×3(主进程 asset-protocol/渲染 image-source/image-insert)→ @shared/path 单一 `IMAGE_EXT_RE`;noteStemOf/noteDirOf(renderer 自写 + files/image-save)→ @shared/path(files index 改再导出,主进程侧语义切换为 shared 近似 win32 dirname,已在测试覆盖);countMarkdown/countMdInTree → @shared/tree 单一实现(files index 与 workspace 均再导出,既有调用面不变);尾换行兜底 → engine.finalizeMarkdown 导出,note-document 旧名别名保留(测试/调用面不变)。
- SearchPanel:treeTickRef 自增改 treeTick state(树广播即重跑工作区搜索,原 ref 方案不触发 effect)。
- 验证:135 单测、boundaries 0 违规、重打包 smoke + E2E 通过。
