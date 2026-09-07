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
  /** 选区/光标在表格内(块级段落命令置灰;表格交互走右键,规格 9.6)。 */
  inTable: boolean;
  /** 有工作区(文件操作命令前提,10)。 */
  hasWorkspace: boolean;
  /** 有树内选中项(重命名/删除等按选中生效,10)。 */
  hasSelection: boolean;
  /** 源码模式(30):WYSIWYG 专属命令(段落/格式/查找)置灰,撤销重做转发文本区。 */
  sourceMode: boolean;
};

export type CommandRun = () => void | Promise<void>;

/** 各菜单命令的固定 id(模板与注册表共用;状态更新按 id 寻址)。 */
export const Cmd = {
  // 文件
  newNote: "new-note",
  newFolder: "new-folder",
  openFolder: "open-folder",
  openRecent: "open-recent",
  save: "save",
  exportPdf: "export-pdf",
  print: "print",
  rename: "file-rename",
  delete: "file-delete",
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
  sourceMode: "source-mode",
  focusMode: "focus-mode",
  typewriterMode: "typewriter-mode",
  fullscreen: "fullscreen",
  workspaceSearch: "workspace-search",
  themeGithub: "theme-github",
  themeNight: "theme-night",
  themeNewsprint: "theme-newsprint",
  // 设置(28)
  settingsCodeWrap: "settings-code-wrap",
  settingsCodeLineNumbers: "settings-code-line-numbers",
  // 帮助
  about: "about",
} as const;

export type CommandId = (typeof Cmd)[keyof typeof Cmd];

const sep = (): MenuItemTemplate => ({ id: `sep-${Math.random().toString(36).slice(2)}`, type: "separator" });

/** 「最近打开」条目(13):name 展示;同名列追加父目录名消歧。 */
export interface RecentItem {
  path: string;
  name: string;
}

function recentSubmenu(recent: RecentItem[]): MenuItemTemplate {
  if (recent.length === 0) {
    return { id: "menu-recent", type: "submenu", label: "最近打开", submenu: [{ id: "recent-empty", label: "无最近记录", enabled: false }] };
  }
  const count: Record<string, number> = {};
  for (const r of recent) count[r.name] = (count[r.name] ?? 0) + 1;
  return {
    id: "menu-recent",
    type: "submenu",
    label: "最近打开",
    submenu: recent.map((r, i) => {
      const duplicate = (count[r.name] ?? 0) > 1;
      const parent = r.path.replace(/[\\/]+$/, "").split(/[\\/]/).slice(0, -1).pop() ?? "";
      return {
        id: `recent-${i}`,
        label: duplicate ? `${r.name}(…/${parent})` : r.name,
      };
    }),
  };
}

/** 规格 §7 默认菜单结构(zh-CN;accelerator 即固定快捷键清单)。 */
export function buildMenuTemplate(recent: RecentItem[] = []): MenuItemTemplate[] {
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
        disabledItem(Cmd.newFolder, "新建文件夹"),
        disabledItem(Cmd.openFolder, "打开文件夹", "Ctrl+O"),
        recentSubmenu(recent),
        sep(),
        disabledItem(Cmd.save, "保存", "Ctrl+S"),
        sep(),
        disabledItem(Cmd.rename, "重命名"),
        disabledItem(Cmd.delete, "删除"),
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
        // role 项显式中文 label(25):规避系统 locale 下显示英文
        { id: "cut", type: "role", role: "cut", label: "剪切" },
        { id: "copy", type: "role", role: "copy", label: "复制" },
        { id: "paste", type: "role", role: "paste", label: "粘贴" },
        { id: "delete", type: "role", role: "delete", label: "删除" },
        sep(),
        disabledItem(Cmd.find, "查找", "Ctrl+F"),
      ],
    },
    {
      id: "menu-paragraph",
      type: "submenu",
      label: "段落",
      submenu: [
        disabledItem(Cmd.heading1, "标题 1", "Ctrl+1"),
        disabledItem(Cmd.heading2, "标题 2", "Ctrl+2"),
        disabledItem(Cmd.heading3, "标题 3", "Ctrl+3"),
        disabledItem(Cmd.heading4, "标题 4", "Ctrl+4"),
        disabledItem(Cmd.heading5, "标题 5", "Ctrl+5"),
        disabledItem(Cmd.heading6, "标题 6", "Ctrl+6"),
        disabledItem(Cmd.paragraph, "正文", "Ctrl+0"),
        sep(),
        disabledItem(Cmd.bulletList, "无序列表", "Ctrl+Shift+]"),
        disabledItem(Cmd.orderedList, "有序列表", "Ctrl+Shift+["),
        disabledItem(Cmd.taskList, "任务列表", "Ctrl+Shift+9"),
        disabledItem(Cmd.quote, "引用", "Ctrl+Shift+Q"),
        disabledItem(Cmd.codeBlock, "代码块", "Ctrl+Shift+K"),
        disabledItem(Cmd.insertTable, "表格", "Ctrl+T"),
      ],
    },
    {
      id: "menu-format",
      type: "submenu",
      label: "格式",
      submenu: [
        disabledItem(Cmd.bold, "加粗", "Ctrl+B"),
        disabledItem(Cmd.italic, "斜体", "Ctrl+I"),
        disabledItem(Cmd.strike, "删除线", "Ctrl+Shift+S"),
        disabledItem(Cmd.link, "链接", "Ctrl+K"),
        disabledItem(Cmd.clearFormat, "清除格式", "Ctrl+Shift+L"),
        sep(),
        disabledItem(Cmd.insertImage, "插入图片…", "Ctrl+Shift+I"),
      ],
    },
    {
      id: "menu-view",
      type: "submenu",
      label: "视图",
      submenu: [
        disabledItem(Cmd.toggleSidebar, "侧栏显示/隐藏", "Ctrl+Shift+B"),
        disabledItem(Cmd.sourceMode, "源码模式", "Ctrl+/"),
        // 06:专注/打字机(F8/F9,勾选态由 App 同步;与源码模式互斥置灰)
        disabledItem(Cmd.focusMode, "专注模式", "F8"),
        disabledItem(Cmd.typewriterMode, "打字机模式", "F9"),
        disabledItem(Cmd.fullscreen, "全屏", "F11"),
        sep(),
        disabledItem(Cmd.workspaceSearch, "全工作区搜索", "Ctrl+Shift+F"),
        sep(),
        // 01:「外观」子菜单(跟随系统/浅色/深色)删除;「主题」子菜单三勾选占位
        // (07 提级为顶级菜单)
        {
          id: "menu-theme",
          type: "submenu",
          label: "主题",
          submenu: [
            disabledItem(Cmd.themeGithub, "GitHub"),
            disabledItem(Cmd.themeNight, "Night"),
            disabledItem(Cmd.themeNewsprint, "Newsprint"),
          ],
        },
      ],
    },
    {
      id: "menu-settings",
      type: "submenu",
      label: "设置",
      submenu: [
        {
          id: "menu-editor",
          type: "submenu",
          label: "编辑器",
          submenu: [
            disabledItem(Cmd.settingsCodeWrap, "代码块自动换行"),
            disabledItem(Cmd.settingsCodeLineNumbers, "代码块显示行号"),
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
  init(recent?: RecentItem[]): void;
  /** 「最近打开」列表变化:整表重建(13)。 */
  rebuildRecent(recent: RecentItem[]): void;
  /** 注册/更新命令实现(注册后该 id 才能按规则点亮;动态 id(最近打开)同样适用)。 */
  register(id: string, rule: EnabledRule, run: CommandRun): void;
  /** 撤销注册(命令下线时置灰)。 */
  unregister(id: string): void;
  /** 设置菜单项勾选态(外观三态等;与启用态独立 diff)。 */
  setChecked(id: string, checked: boolean): void;
  /** 上下文变化(文档切换/引擎历史变化)后刷新全部启用态。 */
  setContext(ctx: MenuContext): void;
  /** 执行指定 id 命令(供测试/主进程驱动)。 */
  invoke(id: string): void;
  /** 释放:退订命令事件并清空注册(StrictMode 双挂载防双订阅,28)。 */
  dispose(): void;
}

export function createMenuBridge(): MenuBridge {
  const handlers = new Map<string, { rule: EnabledRule; run: CommandRun }>();
  let context: MenuContext = {
    docOpen: false,
    canUndo: false,
    canRedo: false,
    inTable: false,
    hasWorkspace: false,
    hasSelection: false,
    sourceMode: false,
  };
  let recentItems: RecentItem[] = [];
  const lastState = new Map<string, boolean>();
  const lastChecked = new Map<string, boolean>();
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
        const h = handlers.get(item.id);
        const enabled = item.type === "submenu" ? true : h ? h.rule(context) : false;
        out.push({ id: item.id, enabled });
        if (item.submenu) collect(item.submenu);
      }
    };
    collect(buildMenuTemplate(recentItems));
    return out;
  }

  return {
    init(recent: RecentItem[] = []) {
      recentItems = recent;
      window.confidant.setMenuTemplate(buildMenuTemplate(recentItems));
      unsubCommand ??= window.confidant.onMenuCommand((id) => {
        const h = handlers.get(id);
        if (!h || !h.rule(context)) return; // 未注册或失活命令不执行
        try {
          void h.run();
        } catch (err) {
          console.error(`[menu] command ${id} failed:`, err);
        }
      });
      this.setContext(context);
    },

    rebuildRecent(recent: RecentItem[]) {
      recentItems = recent;
      window.confidant.setMenuTemplate(buildMenuTemplate(recentItems));
      lastState.clear();
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
        // 勾选态与启用态独立维护:全量刷新时带上已设置的 checked(28 设置项)
        diff.push({ id: s.id, enabled: s.enabled, checked: lastChecked.get(s.id) });
      }
      if (diff.length) window.confidant.updateMenuItems(diff);
    },

    setChecked(id, checked) {
      if (lastChecked.get(id) === checked) return;
      lastChecked.set(id, checked);
      window.confidant.updateMenuItems([
        { id, enabled: lastState.get(id) ?? false, checked },
      ]);
    },

    invoke(id) {
      const h = handlers.get(id);
      if (!h) return;
      if (!h.rule(context)) return;
      void h.run();
    },

    dispose() {
      unsubCommand?.();
      unsubCommand = null;
      handlers.clear();
      lastState.clear();
      lastChecked.clear();
    },
  };
}
