// 会话层类型(当前打开文档/变更通知条),App 与 UI 组件共用。从 App.tsx 拆分(22)。

/** 当前打开的文档(编辑会话主体;head = front matter 原样字节或 null)。 */
export interface OpenNote {
  path: string;
  name: string;
  head: string | null;
}

/** 变更通知条内容(10/11 单步撤销与动作按钮;最近一次文件操作)。 */
export interface ChangeNotice {
  id: number;
  label: string;
  undo?: () => void;
  action?: { label: string; run: () => void };
}
