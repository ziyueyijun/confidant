// 菜单模板与命令注册表(03 票框架;后续票只需 register + 点亮)。
//
// 原则:模板 = 规格 §7 默认结构的唯一来源;native 菜单 = 常驻可见的可发现性通道。
// 每条命令(id)绑定:启用规则(按上下文)、处理器。已注册才可启用;
// 注册前一律置灰(未实现命令不得有副作用)。
// 快捷键固定清单就写在模板 accelerator 上,不支持用户自定义键位(规格 §7)。

import type { MenuItemState, MenuItemTemplate } from "@shared/ipc";

export type MenuContext = {
  /** 有打开的文档(编辑/撤销/重做等命令的前提)。 */
  docOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

export type CommandRun = () => void | Promise<void>;

/** 各菜单命令的固定 id(模板与注册表共用;状态更新按 id 寻址)。 */
export const Cmd = {
  // 文件
  newNote: "new-note",
  openFolder: "open-folder",
  openRecent: "open-recent",
  save: "save",
  exportPdf: "export-pdf",
  print: "print",
  quit: "quit",
  // 编辑
  undo: "undo",
  redo: "redo",
  find: "find",
  // 段落
  heading1: "heading-1",
  heading2: "heading-2",
  heading3: "heading-3",
  heading4: "heading-4",
  heading5: "heading-5",
  heading6: "heading-6",
  paragraph: "paragraph",
  bulletList: "bullet-list",
  orderedList: "ordered-list",
  taskList: "task-list",
  quote: "quote",
  codeBlock: "code-block",
  insertTable: "insert-table",
  // 格式
  bold: "bold",
  italic: "italic",
  strike: "strike",
  link: "link",
  clearFormat: "clear-format",
  /** 「插入图片…」(05 落盘通道的菜单入口;选文件后复制落盘同目录)。 */
  insertImage: "insert-image",
  // 视图
  toggleSidebar: "toggle-sidebar",
  workspaceSearch: "workspace-search",
  themeSystem: "theme-system",
  themeLight: "theme-light",
  themeDark: "theme-dark",
  // 帮助
  about: "about",
} as const;

export type CommandId = (typeof Cmd)[keyof typeof Cmd];

const sep = (): MenuItemTemplate => ({ id: `sep-${Math.random().toString(36).slice(2)}`, type: "separator" });

/** 规格 §7 默认菜单结构(zh-CN;accelerator 即固定快捷键清单)。 */
export function buildMenuTemplate(): MenuItemTemplate[] {
  const disabledItem = (id: string, label: string, accelerator?: string): MenuItemTemplate => ({
    id,
    label,
    accelerator,
  });
  return [
    {
      id: "menu-file",
      type: "submenu",
      label: "文件",
      submenu: [
        disabledItem(Cmd.newNote, "新建笔记"),
        disabledItem(Cmd.openFolder, "打开文件夹"),
        disabledItem(Cmd.openRecent, "最近打开"),
        sep(),
        disabledItem(Cmd.save, "保存", "Ctrl+S"),
        sep(),
        disabledItem(Cmd.exportPdf, "导出 PDF"),
        disabledItem(Cmd.print, "打印"),
        sep(),
        disabledItem(Cmd.quit, "退出"),
      ],
    },
    {
      id: "menu-edit",
      type: "submenu",
      label: "编辑",
      submenu: [
        disabledItem(Cmd.undo, "撤销", "Ctrl+Z"),
        disabledItem(Cmd.redo, "重做", "Ctrl+Y"),
        sep(),
        { id: "cut", type: "role", role: "cut" },
        { id: "copy", type: "role", role: "copy" },
        { id: "paste", type: "role", role: "paste" },
        { id: "delete", type: "role", role: "delete" },
        sep(),
        disabledItem(Cmd.find, "查找", "Ctrl+F"),
      ],
    },
    {
      id: "menu-paragraph",
      type: "submenu",
      label: "段落",
      submenu: [
        disabledItem(Cmd.heading1, "标题 1"),
        disabledItem(Cmd.heading2, "标题 2"),
        disabledItem(Cmd.heading3, "标题 3"),
        disabledItem(Cmd.heading4, "标题 4"),
        disabledItem(Cmd.heading5, "标题 5"),
        disabledItem(Cmd.heading6, "标题 6"),
        disabledItem(Cmd.paragraph, "正文"),
        sep(),
        disabledItem(Cmd.bulletList, "无序列表"),
        disabledItem(Cmd.orderedList, "有序列表"),
        disabledItem(Cmd.taskList, "任务列表"),
        disabledItem(Cmd.quote, "引用"),
        disabledItem(Cmd.codeBlock, "代码块"),
        disabledItem(Cmd.insertTable, "表格"),
      ],
    },
    {
      id: "menu-format",
      type: "submenu",
      label: "格式",
      submenu: [
        disabledItem(Cmd.bold, "加粗", "Ctrl+B"),
        disabledItem(Cmd.italic, "斜体", "Ctrl+I"),
        disabledItem(Cmd.strike, "删除线"),
        disabledItem(Cmd.link, "链接"),
        disabledItem(Cmd.clearFormat, "清除格式"),
        sep(),
        disabledItem(Cmd.insertImage, "插入图片…"),
      ],
    },
    {
      id: "menu-view",
      type: "submenu",
      label: "视图",
      submenu: [
        disabledItem(Cmd.toggleSidebar, "侧栏显示/隐藏"),
        disabledItem(Cmd.workspaceSearch, "全工作区搜索", "Ctrl+Shift+F"),
        sep(),
        {
          id: "menu-appearance",
          type: "submenu",
          label: "外观",
          submenu: [
            disabledItem(Cmd.themeSystem, "跟随系统"),
            disabledItem(Cmd.themeLight, "浅色"),
            disabledItem(Cmd.themeDark, "深色"),
          ],
        },
      ],
    },
    {
      id: "menu-help",
      type: "submenu",
      label: "帮助",
      submenu: [disabledItem(Cmd.about, "关于 confidant")],
    },
  ];
}

type EnabledRule = (ctx: MenuContext) => boolean;

export interface MenuBridge {
  /** 首次建立:整表下发 native 菜单 + 订阅命令事件。 */
  init(): void;
  /** 注册/更新命令实现(注册后该 id 才能按规则点亮)。 */
  register(id: CommandId, rule: EnabledRule, run: CommandRun): void;
  /** 撤销注册(命令下线时置灰)。 */
  unregister(id: CommandId): void;
  /** 上下文变化(文档切换/引擎历史变化)后刷新全部启用态。 */
  setContext(ctx: MenuContext): void;
  /** 执行指定 id 命令(供测试/主进程驱动)。 */
  invoke(id: CommandId): void;
}

export function createMenuBridge(): MenuBridge {
  const handlers = new Map<CommandId, { rule: EnabledRule; run: CommandRun }>();
  let context: MenuContext = { docOpen: false, canUndo: false, canRedo: false };
  const lastState = new Map<string, boolean>();
  let unsubCommand: (() => void) | null = null;

  function allStates(): MenuItemState[] {
    const out: MenuItemState[] = [];
    const collect = (items: MenuItemTemplate[]): void => {
      for (const item of items) {
        if (item.type === "separator") continue;
        if (item.type === "role") {
          out.push({ id: item.id, enabled: true });
          continue;
        }
        const h = handlers.get(item.id as CommandId);
        const enabled = item.type === "submenu" ? true : h ? h.rule(context) : false;
        out.push({ id: item.id, enabled });
        if (item.submenu) collect(item.submenu);
      }
    };
    collect(buildMenuTemplate());
    return out;
  }

  return {
    init() {
      window.confidant.setMenuTemplate(buildMenuTemplate());
      unsubCommand ??= window.confidant.onMenuCommand((id) => {
        const h = handlers.get(id as CommandId);
        if (!h || !h.rule(context)) return; // 未注册或失活命令不执行
        try {
          void h.run();
        } catch (err) {
          console.error(`[menu] command ${id} failed:`, err);
        }
      });
      this.setContext(context);
    },

    register(id, rule, run) {
      handlers.set(id, { rule, run });
      this.setContext(context);
    },

    unregister(id) {
      handlers.delete(id);
      this.setContext(context);
    },

    setContext(ctx) {
      context = ctx;
      const states = allStates();
      const diff: MenuItemState[] = [];
      for (const s of states) {
        if (lastState.get(s.id) === s.enabled) continue;
        lastState.set(s.id, s.enabled);
        diff.push({ id: s.id, enabled: s.enabled });
      }
      if (diff.length) window.confidant.updateMenuItems(diff);
    },

    invoke(id) {
      const h = handlers.get(id);
      if (!h) return;
      if (!h.rule(context)) return;
      void h.run();
    },
  };
}
