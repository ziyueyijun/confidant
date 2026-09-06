# 技术债登记(实现 effort 复查后)

来源:impl/confidant-v1 分支 /code-review 双轴复查(Standards)共识清单;
按可维护性影响排序,分批清偿,不在本分支再动为限。

1. **巨型文件拆分(核心债)**
   - `src/renderer/src/App.tsx`(1669 行):单组件 ~35 useCallback。建议按域抽 hook/模块:
     主题(18)、启动恢复(13)、文件操作编排(10-12)、菜单接线(03)、浮层 JSX(07/14-15)。
   - `packages/engine/lib/engine.ts`(1009 行):可抽 查找高亮插件(14)、标题锚点(16)、
     表格/任务结构化命令(09)、键盘语义(09)为同包内独立私有模块,入口面不变。
   - 已清偿:`src/main/index.ts` 的自检/竖切驱动已抽至 `src/main/smoke.ts`(本次)。

2. **跨层/包内重复(judgement calls,待上收)**
   - 跨层字符串件:三处图片扩展名正则、`noteStemOf/noteDirOf`、`countMarkdown` vs `countMdInTree`、
     `finalizeMarkdown` vs `ensureSingleTrailingNewline`——纯函数可上收 `@shared/path` 或单一私有 util。
   - `SearchPanel` 用 ref 值进 effect 依赖(`treeTickRef.current`)刷新搜索结果:改为一并进 state。

3. **测试钩子与生产同源**:`data-testid` 散布 + `CONFIDANT_*` 环境门为主进程文件顶层常量;
   可拆独立入口或统一 test-hook 命名空间(低优先,已文档化自检设计)。

4. **打包小项**:应用图标未配置(默认 Electron 图标),随 20 人工项执行。
