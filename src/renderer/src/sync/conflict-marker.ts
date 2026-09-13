// 冲突副本的树标记依据(决议 55;纯逻辑,可单测)。
//
// 名称模式与识别函数来自同步包(单一事实源:packages/sync/lib/conflict.ts),
// 本模块只补渲染层要用的展示语义,不重复实现匹配,避免两端漂移。
//
// 标记由**文件名派生**,不扩 TreeEntry 协议:重启后标记仍在,也不需要动
// IPC 契约与包边界。

import { isConflictCopyName } from "../../../../packages/sync/conflict";

export { isConflictCopyName };

/**
 * 徽标文案。标的是「**这个文件是冲突副本**」,不是「这个文件有冲突」——
 * 措辞必须只陈述文件自身身份,避免用户误以为原笔记处于冲突状态。
 */
export const CONFLICT_COPY_BADGE = "冲突副本";

/** 徽标悬停说明(把「保留的另一版本」这层含义讲清楚)。 */
export const CONFLICT_COPY_TITLE =
  "同步冲突副本:上次同步时两端都改了同一文件,这是保留的另一版本。原笔记未处于冲突状态。";
