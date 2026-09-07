# 技术债登记(实现 effort 复查后)

来源:impl/confidant-v1 分支 /code-review 双轴复查(Standards)共识清单;
按可维护性影响排序,分批清偿,不在本分支再动为限。
清偿跟踪票:21-24(confidant-v1-impl issues),清偿状态见各票记录。

## 已清偿(2026-09-06,票 21-24)

1. **巨型文件拆分(核心债)**
   - `src/renderer/src/App.tsx`:1669 → 537 行,按域抽 `hooks/`(use-app-theme、
     use-sidebar-layout、use-tree-expansion、use-doc-missing、use-editor-host、
     use-file-operations、use-menu-bridge-registration、use-recent-folders、
     use-startup-recovery)+ `components/`(Welcome/OverlayBanners/EmptyStates)
     + `session/`(types/ops-shared)。行为 smoke/E2E 复验(票 22)。
   - `packages/engine/lib/engine.ts`:1009 → 631 行,抽同包私有模块
     search-highlight/extensions/keyboard/link-range/task-list-ops(票 23)。
   - 先例:`src/main/index.ts` 自检/竖切驱动抽至 `src/main/smoke.ts`。
   - 留档:createEngine 桥封装主体仍 ~490 行,chain 方法分组列为后续可选清理(见票 23 记录)。

2. **跨层/包内重复(judgement calls)**——已上收(票 24):
   - 图片扩展名正则 ×3 → `@shared/path` 单一 `IMAGE_EXT_RE`;
   - `noteStemOf/noteDirOf` → `@shared/path`(files index 改再导出);
   - `countMarkdown` vs `countMdInTree` → `@shared/tree` 单一实现(两侧再导出,调用面不变);
   - `finalizeMarkdown` vs `ensureSingleTrailingNewline` → 单一实现归 engine(导出 + 别名保留);
   - `SearchPanel` 树节拍 ref 值进 effect → 改 state(`treeTick`)。

3. **测试钩子与生产同源**:`data-testid` 散布 + `CONFIDANT_*` 环境门为主进程文件顶层常量;
   可拆独立入口或统一 test-hook 命名空间(低优先,已文档化自检设计)。——**未清偿,保持登记**。

4. **打包小项:应用图标**——已清偿(票 21):`build/icon.ico` + 可重跑
   `build/generate-icon.ps1`(同源色板占位;终稿素材为人工项,换源重跑即可)。
