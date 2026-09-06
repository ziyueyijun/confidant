// packages/engine —— 编辑引擎(deep module,公共表面仅本文件)。
// 行为:
//   - 承载 TipTap(ProseMirror)实例与显式扩展注册清单(规格 §5);
//   - markdown 文本 ↔ 所见即所得文档的装载/序列化(语义级往返,规范化行为见 lib);
//   - front matter 拆分/回拼工具(原始字节保留,规格 §4.3)。
// 本包不感知 React、不感知文件系统、不感知 UI 壳。

export { createEngine } from "./lib/engine";
export type { Engine, EngineCallbacks } from "./lib/engine";

export { splitFrontMatter } from "./lib/frontmatter";
export type { FrontMatterSplit } from "./lib/frontmatter";
