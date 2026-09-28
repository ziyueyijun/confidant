# Confidant 实现规格

**版本**：1.0  
**日期**：2026-09-28  
**状态**：Final

本规格整合了地图 [#1](https://github.com/ziyueyijun/confidant/issues/1) 中所有已关闭 ticket 的决定，是交给实现 agent 的完整蓝图。

---

## 1. 产品命题与 MVP 功能边界

### 1.1 核心命题

**「Typora 式真 inline WYSIWYG markdown 编辑器，但保持磁盘纯净度」**

- **Typora 式**：光标进入节点时露出标记（`**`），离开时隐藏，真正的所见即所得
- **磁盘纯净度**：未编辑区域字节级不变，空行、缩进、CRLF、软换行位置、列表标记选择全保留
- **库管理**：文件夹 + 文件树 + 标签页，磁盘上永远是纯 `.md` 文件

### 1.2 MVP 功能清单（In Scope）

**编辑**：
- ✅ Typora 式 inline WYSIWYG（标题、列表、粗体、斜体、代码、链接、引用、代码块、表格）
- ✅ Input rules（`# ` 变标题、`- ` 变列表、`**x**` 自动变粗）
- ✅ 快捷键（Ctrl+B 粗体、Ctrl+I 斜体、Ctrl+1~6 标题、Tab 缩进）
- ✅ 撤销/重做（按输入停顿分组，500ms）
- ✅ 中文 IME 支持

**文件库**：
- ✅ 单窗口单库（一个库 = 一个文件夹）
- ✅ 文件树（显示 .md/.txt/图片/PDF，过滤隐藏文件）
- ✅ 标签页（多文件同时打开）
- ✅ 自动保存（500ms 触发，原子保存）
- ✅ 外部变更检测（静默重载、冲突提示）
- ✅ CRUD（新建、重命名、删除进回收站）

**搜索**：
- ✅ 快速跳转（Ctrl+P，文件名模糊匹配）
- ✅ 全文搜索（Ctrl+Shift+F，现场扫描）
- ✅ 当前文档查找（Ctrl+F）

**图片**：
- ✅ 粘贴/拖拽图片自动保存到 `attachments/`
- ✅ 相对路径（兼容 Typora/VS Code）
- ✅ 编辑器内渲染，点击放大

**界面**：
- ✅ 侧边栏（文件树，260px，可折叠）+ 标签页 + 编辑区（居中 800px）
- ✅ 亮色/暗色主题
- ✅ Frontmatter 呈现（顶部灰色背景块）

### 1.3 Out of Scope（明确不做）

**编辑器功能**：
- ❌ 双链 `[[WikiLink]]`
- ❌ 标签 `#tag`
- ❌ 脚注 `[^1]`
- ❌ 数学公式 `$...$`
- ❌ Mermaid 图表
- ❌ 高亮标记 `==text==`
- ❌ 上下标 `~下~` / `^上^`
- ❌ 实时协作
- ❌ 版本历史
- ❌ 插件系统

**搜索功能**：
- ❌ 替换（单文档和跨文件替换）
- ❌ 搜索索引（MVP 用现场扫描）

**附件**：
- ❌ 非图片附件（PDF/DOCX/ZIP）

**高级功能**：
- ❌ 多库同时打开
- ❌ Git 集成
- ❌ 发布/导出为 HTML/PDF
- ❌ 移动端

**不认识的语法**：
- 原样保留字节级不变，编辑器里纯文本显示（不删除、不误判）

---

## 2. 技术栈与版本

### 2.1 核心技术栈

| 技术 | 版本/选择 | 理由 |
|------|----------|------|
| **运行时** | Electron 33.x（最新稳定） | 跨平台桌面应用，Windows 优先 |
| **编辑器内核** | CodeMirror 6.x | 唯一满足「最小 diff 保真」硬需求 |
| **构建工具** | electron-vite 5.x | 开箱即用，默认三层目录结构，集成 electron-builder |
| **打包** | electron-builder | 生成 NSIS 安装包（支持文件关联）+ Portable 版 |
| **语言** | TypeScript | 类型安全 |
| **UI 框架** | 原生 DOM（无 React/Vue） | 减少依赖，直接操作 DOM |
| **文件监听** | chokidar 4.x | 跨平台，处理 Windows 重复事件/rename 拆分 |

### 2.2 关键依赖

**CodeMirror 6 核心包**：
- `@codemirror/view`
- `@codemirror/state`
- `@codemirror/language`
- `@codemirror/lang-markdown`
- `@codemirror/commands`

**Markdown 解析**：
- `markdown-it`（或 `unified`/`remark`）：解析 markdown AST，驱动 WYSIWYG 渲染

**其他**：
- `chokidar`：文件监听
- `electron-store`：配置存储（`%APPDATA%`）

### 2.3 最低要求

- **操作系统**：Windows 10/11（主要目标），macOS/Linux 可选
- **Electron 版本**：>= 33.x（确保 Chromium #523134891 IME 修复已集成）
- **Node.js**：>= 18.x

---

## 3. 进程与模块架构

### 3.1 进程职责划分

#### 主进程（Main Process）

**职责**：
- 文件 I/O（读、写、删、重命名）
- 文件监听（chokidar）
- 窗口管理
- 菜单与快捷键注册
- 配置管理（electron-store）

**不做**：
- 不解析 markdown（交给渲染进程）
- 不渲染 UI

#### 渲染进程（Renderer Process）

**职责**：
- CodeMirror 6 编辑器初始化与交互
- Markdown 解析与 WYSIWYG 渲染
- UI 渲染（文件树、标签页、搜索面板）
- 用户交互响应

**安全边界**：
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`（#11 调研建议）

#### Preload Script

**职责**：
- 通过 `contextBridge` 暴露安全的 IPC 接口给渲染进程
- **不暴露 `fs` 模块**（#11 调研：sandbox 下 preload 不能用 fs）

### 3.2 IPC 接口清单

#### 文件操作

```typescript
// 主进程 → 渲染进程
ipcMain.handle('file:read', async (event, filePath: string) => string)
ipcMain.handle('file:write', async (event, filePath: string, content: string) => void)
ipcMain.handle('file:delete', async (event, filePath: string) => void)
ipcMain.handle('file:rename', async (event, oldPath: string, newPath: string) => void)
ipcMain.handle('file:exists', async (event, filePath: string) => boolean)
ipcMain.handle('file:stat', async (event, filePath: string) => { mtime: number, size: number })

// 文件树
ipcMain.handle('vault:list', async (event, vaultPath: string) => FileNode[])
ipcMain.handle('vault:open', async (event, vaultPath: string) => void)

// 搜索
ipcMain.handle('search:fullText', async (event, query: string, options: SearchOptions) => SearchResult[])
```

#### 文件监听

```typescript
// 主进程 → 渲染进程（单向推送）
ipcRenderer.on('file:changed', (event, filePath: string, etag: string) => void)
ipcRenderer.on('file:deleted', (event, filePath: string) => void)
ipcRenderer.on('file:renamed', (event, oldPath: string, newPath: string) => void)
```

#### 配置

```typescript
ipcMain.handle('config:get', async (event, key: string) => any)
ipcMain.handle('config:set', async (event, key: string, value: any) => void)
```

### 3.3 模块结构

```
src/
├── main/               # 主进程
│   ├── index.ts        # 入口
│   ├── fileSystem.ts   # 文件 I/O
│   ├── watcher.ts      # 文件监听（chokidar）
│   ├── search.ts       # 全文搜索（现场扫描）
│   └── config.ts       # 配置管理
├── preload/            # Preload
│   └── index.ts        # contextBridge API
└── renderer/           # 渲染进程
    ├── index.html
    ├── index.ts        # 入口
    ├── editor/         # 编辑器模块
    │   ├── init.ts     # CM6 初始化
    │   ├── wysiwyg.ts  # WYSIWYG 渲染逻辑
    │   ├── inputRules.ts  # Input rules
    │   └── keybindings.ts # 快捷键
    ├── ui/             # UI 组件
    │   ├── sidebar.ts  # 文件树
    │   ├── tabs.ts     # 标签页
    │   └── search.ts   # 搜索面板
    └── lib/            # 工具库
        ├── markdown.ts # Markdown 解析
        └── ipc.ts      # IPC 封装
```

---

## 4. 数据模型与磁盘契约

### 4.1 库结构

```
库根目录/
├── attachments/                # 图片附件（库级共享）
│   ├── 20260928-a3f7.png
│   └── 20260928-k9x2.jpg
├── 工作笔记/                   # 用户自定义文件夹
│   ├── 项目规划.md
│   └── 会议记录.md
└── 学习笔记/
    └── 技术调研.md
```

**规则**：
- 一个库 = 一个文件夹
- 支持任意层级子文件夹
- `attachments/` 在库根，所有笔记共享
- 不创建隐藏的 `.confidant/` 配置目录（与 Obsidian 区分）

### 4.2 `%APPDATA%` 存储

路径：`%APPDATA%/confidant/`（Windows）或 `~/Library/Application Support/confidant/`（macOS）

```
confidant/
├── config.json         # 全局配置
└── recent-vaults.json  # 最近打开的库列表（最多 5 个）
```

**config.json 示例**：
```json
{
  "theme": "light",              // "light" | "dark"
  "editorWidth": "800px",        // "800px" | "1000px" | "100%"
  "showHiddenFiles": false,
  "caseSensitiveSearch": false,
  "enableRemoteImages": true
}
```

**recent-vaults.json 示例**：
```json
[
  {
    "path": "D:/Documents/Notes",
    "lastOpened": 1695888000000
  },
  {
    "path": "D:/Work/ProjectNotes",
    "lastOpened": 1695801600000
  }
]
```

### 4.3 Markdown 规范化规则

**风格**（#6 决定）：
- 无序列表：`-`
- 强调：`*` 斜体、`**` 粗体
- 标题：ATX（`#`）
- 代码块：围栏 ``` 
- 有序列表编号：递增（`1. 2. 3.`）

**转义策略**：
- 默认按语义理解（输入 `*` 触发斜体）
- Ctrl+\ 进入字面模式（下一个字符不触发语法）
- 立即 Backspace 撤销触发

**行尾与编码**：
- 检测并沿用原文件的 CRLF/LF/BOM
- 新建文件用 CRLF（Windows 默认）
- 强制 UTF-8

**空白**：
- 检测并保留行尾两空格硬换行
- MVP 不做删除保护和可见化

### 4.4 Frontmatter 与未知语法

**Frontmatter**：
- 检测开头的 `---` YAML 块
- 编辑器顶部灰色背景块显示，保持源码可见可编辑
- 落盘时原样保留

**未知语法**（HTML/脚注/公式/mermaid/WikiLink）：
- **铁律**：原样保留，字节级不变
- 编辑器里纯文本显示（语法高亮，但不渲染）
- 不删除、不误判、不转换

---

## 5. WYSIWYG 渲染策略

### 5.1 语法标记显隐规则

**核心原则**：光标进入节点时露出标记，离开时隐藏，只露当前节点。

| 场景 | 标记可见性 |
|------|-----------|
| 光标在节点内 | ✅ 显示（如光标在 `**粗体**` 内 → 显示 `**`） |
| 光标在节点外 | ❌ 隐藏（光标在段落其他位置 → 隐藏 `**`，只显示「粗体」） |
| 选区跨多个节点 | ✅ 全部显示（选中「这是**粗体**和*斜体*」→ 全部标记可见） |
| 失焦 | ❌ 全部隐藏（完全 WYSIWYG 渲染） |

**粒度**：只露当前节点，不露整个段落的所有标记。

### 5.2 Input Rules

**自动触发**（#12 决定）：

| 输入 | 触发时机 | 结果 | Backspace 撤销 |
|------|---------|------|---------------|
| `# ` | 行首 | h1 | ✅ |
| `## ` ~ `###### ` | 行首 | h2 ~ h6 | ✅ |
| `- ` / `* ` | 行首 | 无序列表 | ✅ |
| `1. ` | 行首 | 有序列表 | ✅ |
| `> ` | 行首 | 引用块 | ✅ |
| `- [ ] ` / `- [x] ` | 行首 | 任务列表 | ✅ |
| ` ``` ` | 行首 | 代码块 | ✅ |
| `**文本**` | 输入第二个 `**` | 粗体 | ✅ |
| `*文本*` | 输入第二个 `*` | 斜体 | ✅ |
| `` `文本` `` | 输入第二个 `` ` `` | 行内代码 | ✅ |

**撤销机制**：立即 Backspace → 回到源码形态；超时（输入其他内容）→ 需要 Undo（Ctrl+Z）。

### 5.3 各节点类型处理

| 节点类型 | 渲染方式 |
|---------|---------|
| **标题** | 光标在行内显示 `#`，离开隐藏，显示标题样式（h1 32px、h2 24px、h3 20px） |
| **列表** | 光标在项内显示 `-` 或 `1.`，离开隐藏，显示项目符号 |
| **粗体/斜体** | 光标在内显示 `**` / `*`，离开隐藏，显示加粗/斜体样式 |
| **行内代码** | 光标在内显示 `` ` ``，离开隐藏，显示灰色背景 |
| **代码块** | 始终显示围栏 ``` 和语言标注，内部纯文本编辑 |
| **引用** | 光标在内显示 `>`，离开隐藏，显示引用样式（左侧蓝色竖线） |
| **链接** | 光标在内显示 `[文本](url)`，离开隐藏，显示可点击文本 |
| **图片** | 光标在行显示 `![alt](url)`，离开渲染图片 |
| **表格** | 整块编辑模式：点击进入源码编辑，失焦渲染表格 |

### 5.4 代码块特例

**问题**：CodeMirror 6 行模型不支持表格的多列布局（#2 调研：Marijn 确认）。

**方案**：表格采用**整块编辑模式**：
- 渲染态：显示渲染后的表格
- 点击表格 → 切换为源码编辑模式（显示完整 markdown 语法）
- 失焦 → 自动渲染回表格

**Tab 键行为**：
- 在表格源码模式下，Tab 插入制表符（或跳到下一个单元格分隔符 `|`）
- MVP 不实现 Typora 式「Tab 跳单元格」

---

## 6. 文件系统行为

### 6.1 自动保存

**触发时机**：
- 用户停止输入 **500ms** 后
- 切换标签页时
- 失焦时
- 关闭标签页时

**原子保存**（#8 决定）：
1. 写入临时文件 `文件名.md.tmp`
2. 写入成功后 `fs.rename()` 替换原文件
3. 删除临时文件

**崩溃恢复**：
- 可接受丢失量：最多 500ms 的输入内容
- MVP 不做额外恢复机制（不写 localStorage 备份）

### 6.2 外部变更检测

**实现**（#11 调研）：
- 用 chokidar 4.x 监听库目录
- Debounce 100ms（云同步目录延长到 300ms）
- 忽略临时文件（`~$*`、`*.tmp`、`.~lock.*`）
- 用 `mtime + size` 计算 etag，区分自己写入 vs 外部变更

**行为**（#8 决定）：

| 场景 | 行为 |
|------|------|
| **无冲突静默重载** | 文件外部变更 + 本地无未保存改动 → 重载内容，保留光标位置和滚动位置 |
| **文件被删除** | 标签页标题变红 `[已删除]`，状态栏提示「此文件已被外部删除，改动将无法保存」，提供「另存为」按钮 |
| **真冲突** | 本地有未落盘改动 + 外部也变了 → 弹对话框「文件冲突」，三选一：保留我的版本 / 使用外部版本 / 另存一份 |

### 6.3 异常处理

| 异常 | 行为 |
|------|------|
| **只读文件** | 状态栏显示 `[只读]`，保存时弹错误「文件为只读，无法保存」，提供「另存为」 |
| **权限不足** | 同上，错误信息改为「权限不足」 |
| **磁盘满** | 弹错误「磁盘空间不足，无法保存」，提供「另存为到其他位置」 |
| **大文件** | 10MB 警告、50MB 拒绝 |
| **非 UTF-8** | 弹对话框「文件编码不是 UTF-8，是否转换？」 |
| **二进制文件** | 检测 null 字节 → 拒绝打开 |

---

## 7. 搜索实现

### 7.1 快速跳转（Ctrl+P）

**实现**：
- 屏幕中央弹出浮层（600px 宽）
- 模糊匹配文件名（子串 + 驼峰缩写）
- 显示最近打开的文件（前 3 个，⏱ 图标标记）
- 最多显示 10 个结果
- 键盘导航：↑/↓ 选择，Enter 打开，Esc 关闭

### 7.2 全文搜索（Ctrl+Shift+F）

**实现**（#9 决定）：
- 侧边栏「搜索」面板
- **现场扫描**（不做索引）：主进程遍历 `.md` 文件，用正则匹配，流式返回结果
- Debounce 300ms（用户输入停顿后触发）
- 超时 5 秒显示「搜索中...」+ 取消按钮

**搜索选项**：
- 大小写敏感（默认关闭）
- 全词匹配（默认关闭）
- 正则表达式（默认关闭）
- 中文用子串匹配，不做分词

**结果呈现**：
- 按文件分组
- 每个文件显示：文件名 + 命中数
- 展开显示前 5 条命中：行号 + 上下文（前后各 1 行）
- 命中关键词黄色高亮
- 点击跳到文件并高亮该行（3 秒后消失）

### 7.3 当前文档查找（Ctrl+F）

**实现**：
- 编辑区右上角浮动框
- 实时高亮所有匹配（黄色背景）
- 当前匹配橙色背景
- 显示「第 X / Y 个匹配」
- 按钮：↑ 上一个、↓ 下一个、× 关闭
- Enter / F3：下一个；Shift+Enter：上一个；Esc：关闭

**与 WYSIWYG 兼容**：
- 搜索**渲染后的文本**（不含 markdown 标记）
- 高亮绘制在 CM6 的 decoration layer 上

---

## 8. 界面布局与视觉规范

### 8.1 主布局

**参考原型**：`prototypes/ui-layout/layout.html`

**结构**：
- 左侧：侧边栏（260px，可折叠）
- 中间：标签页（顶部）+ 编辑区（居中 800px 最大宽度）

**侧边栏**：
- 文件树（默认）/ 搜索面板（Ctrl+Shift+F 切换）
- 标签页切换

**标签页**：
- 顶部横向排列，溢出横向滚动
- 活动标签底部蓝色下划线
- 鼠标悬停显示关闭按钮（×）

**编辑区**：
- 居中排版，最大宽度 800px（可在设置中调整为 1000px 或 100%）
- 正文 16px，行高 1.8
- 标题：h1 32px、h2 24px、h3 20px
- 代码块：灰色背景，1px 边框，Consolas 字体
- 引用块：左侧蓝色竖线，斜体，灰色文字

### 8.2 主题

**亮色主题**：
- 背景：`#ffffff`（主区域）、`#f5f5f5`（侧边栏）
- 文字：`#1a1a1a`（主文字）、`#666666`（次要文字）
- 强调色：`#0066cc`

**暗色主题**：
- 背景：`#1e1e1e`（主区域）、`#252526`（侧边栏）
- 文字：`#d4d4d4`（主文字）、`#858585`（次要文字）
- 强调色：`#4a9eff`

### 8.3 Frontmatter 呈现

- 编辑器顶部灰色背景块
- 保持 YAML 源码可见可编辑
- Consolas 字体，13px，灰色文字

---

## 9. 图片与附件处理

### 9.1 命名与存储

**命名格式**：`时间戳-随机短码.扩展名`

**示例**：`20260928-a3f7.png`

**存储位置**：库根 `attachments/` 文件夹

### 9.2 来源处理

| 来源 | 行为 |
|------|------|
| 剪贴板位图（截图 Ctrl+V） | 保存为 PNG 到 `attachments/` |
| 剪贴板图片文件 | 复制文件到 `attachments/`，保持原格式 |
| 从浏览器拖入 | 下载图片到 `attachments/` |
| 从资源管理器拖入 | 复制文件到 `attachments/`（而非引用原位置） |

### 9.3 相对路径

**基准**：相对于笔记文件所在位置

**示例**：
- 库根 `note.md`：`![](attachments/20260928-a3f7.png)`
- 子目录 `工作笔记/项目规划.md`：`![](../attachments/20260928-a3f7.png)`

**可移植性**：确保 Typora/VS Code 兼容

### 9.4 显示

- 默认宽度：原始宽度，最大 800px
- 超大图：限制最大高度 1000px
- 点击放大：全屏预览（黑色遮罩，按 Esc 关闭）
- 加载失败：显示占位符「🖼 图片加载失败」+ 文件路径

### 9.5 孤儿附件

**策略**：不自动删除，提供手动清理工具

**工具**：菜单 → 工具 → 「清理未使用的附件」
- 扫描 `attachments/` 和所有 `.md` 的图片链接
- 列出未被引用的附件
- 用户勾选，确认后移到回收站

---

## 10. 验收标准与验证方式

### 10.1 一等验收标准

**最小 diff 保真**：
- 打开现有 markdown 文件，不做任何编辑，直接关闭
- 验证：`git diff` 显示无变更（0 字节改动）
- 修改单个单词后保存，验证：`git diff` 只显示该单词所在行变更

**中文 IME 稳定性**：
- 微软拼音 + 搜狗拼音
- 场景：标题/列表/粗体/表格中快速连续输入中文
- 验证：无吞字、候选框不跳位、光标不错位、撤销恢复中文而非拼音字母

**长文档性能**：
- 加载 1 万字文档，验证：滚动流畅、输入无延迟
- 加载 10 万字文档（极端），验证：给出警告，加载时间 < 5 秒

**Typora 兼容性**：
- 在本软件中编辑笔记并保存
- 用 Typora 打开同一文件，验证：图片正常显示、格式无变化

### 10.2 功能验证清单

**编辑**：
- [ ] Input rules 全部生效（`# ` 变标题、`- ` 变列表、`**x**` 自动变粗）
- [ ] 立即 Backspace 撤销触发
- [ ] Ctrl+B/I/1~6 快捷键生效
- [ ] 撤销/重做按输入停顿分组
- [ ] 光标进入节点显示标记，离开隐藏
- [ ] 表格整块编辑模式：点击进入源码，失焦渲染

**文件库**：
- [ ] 打开库，文件树正确显示（过滤隐藏文件）
- [ ] 新建/重命名/删除文件生效
- [ ] 自动保存：停止输入 500ms 后落盘
- [ ] 外部变更：无冲突静默重载，真冲突弹提示
- [ ] 文件被外部删除：标签页变红，提示另存

**搜索**：
- [ ] Ctrl+P 快速跳转：模糊匹配文件名，最近文件优先
- [ ] Ctrl+Shift+F 全文搜索：侧边栏显示结果，按文件分组
- [ ] Ctrl+F 当前文档查找：实时高亮，显示匹配数

**图片**：
- [ ] 粘贴截图保存到 `attachments/`，插入相对路径
- [ ] 拖拽本地图片复制到 `attachments/`
- [ ] 编辑器内渲染图片，点击放大
- [ ] 子目录笔记的图片链接用 `../attachments/`

**界面**：
- [ ] 侧边栏可折叠
- [ ] 标签页溢出横向滚动
- [ ] 亮色/暗色主题切换生效
- [ ] Frontmatter 显示为灰色背景块

### 10.3 性能基准

| 指标 | 目标 |
|------|------|
| **启动时间** | 冷启动 < 2 秒 |
| **文件加载** | 1 万字文档 < 200ms |
| **搜索** | 1000 个文件全文搜索 < 2 秒 |
| **自动保存延迟** | 停止输入后 500ms 内触发 |
| **内存占用** | 打开 10 个标签页 < 500MB |

---

## 11. 实现顺序建议

### Phase 1: 核心编辑器（最早跑起来）

1. **搭建 Electron + electron-vite 脚手架**
   - 主进程、渲染进程、preload 基础结构
   - IPC 接口框架

2. **初始化 CodeMirror 6**
   - 基础编辑器实例
   - Markdown 语言支持
   - 暗色/亮色主题

3. **实现 WYSIWYG 核心**
   - 标题、列表、粗体、斜体的显隐规则
   - 光标进入/离开节点的检测
   - Decoration layer 渲染

4. **Input Rules**
   - `# ` 变标题、`- ` 变列表
   - 立即 Backspace 撤销

5. **文件读写**
   - 主进程 `file:read` / `file:write`
   - 渲染进程加载文件到编辑器
   - 自动保存（500ms debounce）

**里程碑**：能打开单个 markdown 文件，进行 WYSIWYG 编辑，自动保存。

### Phase 2: 文件库管理

6. **文件树 UI**
   - 侧边栏布局
   - 递归遍历文件夹
   - 显示 .md 文件

7. **标签页**
   - 多文件同时打开
   - 标签页切换
   - 关闭标签页

8. **CRUD**
   - 新建、重命名、删除文件
   - 菜单与快捷键

9. **文件监听**
   - chokidar 监听库目录
   - 静默重载、冲突检测

**里程碑**：能打开库文件夹，浏览文件树，多标签页编辑，外部变更自动同步。

### Phase 3: 搜索与图片

10. **快速跳转（Ctrl+P）**
    - 浮层 UI
    - 文件名模糊匹配

11. **全文搜索（Ctrl+Shift+F）**
    - 侧边栏搜索面板
    - 主进程现场扫描
    - 结果按文件分组

12. **当前文档查找（Ctrl+F）**
    - 浮动查找框
    - 实时高亮

13. **图片处理**
    - 粘贴/拖拽保存到 `attachments/`
    - 相对路径插入
    - 编辑器内渲染
    - 点击放大

**里程碑**：搜索和图片功能完整可用。

### Phase 4: 完善与打磨

14. **快捷键完整实现**
    - Ctrl+B/I、Ctrl+1~6、Tab 缩进等

15. **表格整块编辑模式**
    - 点击进入源码、失焦渲染

16. **异常处理**
    - 只读文件、磁盘满、大文件警告

17. **主题与视觉细节**
    - Frontmatter 呈现
    - 编辑区排版微调

18. **打包与分发**
    - electron-builder 配置
    - NSIS 安装包 + Portable 版
    - Windows 文件关联

**里程碑**：MVP 功能完整，可交付。

---

## 12. 已知坑与缓解方案

### 12.1 CodeMirror 6 的已知问题（#2 #4）

**问题**：
- 光标定位失控（行尾点击，光标落在 `**` 内还是外不一致）
- 方向键无法跨越 widget（隐藏的语法标记会挡住方向键）
- 长文档后半段 decoration 失效、embed widget 闪烁

**缓解方案**：
- 用 `atomicRanges` 标记语法标记为不可分割单元
- 独立 decoration layer 减少 DOM 干扰
- 虚拟滚动 / 增量渲染（视口外不渲染）

**接受度判断**：
- 若无法接受，退路：回到 #4 重选内核（放弃「最小 diff」硬需求，转 ProseMirror）

### 12.2 中文 IME 问题（#2）

**问题**（两条路线共患）：
- 光标掉进隐藏标记
- widget 触发 composition 重启

**缓解方案**（CM6 官方做法）：
- `side: 1` 让 decoration 不干扰光标
- 独立 decoration layer
- composition 进行中冻结光标所在节点的 DOM 更新

**验证要求**：#5 原型必须压测微软拼音 + 搜狗拼音，覆盖标题/正文/代码块/表格。

### 12.3 Windows 文件监听（#11）

**问题**：
- 重复事件
- rename 拆分为 DELETE + CREATE
- 原子保存（写 .tmp 再 rename）的延迟

**缓解方案**：
- Debounce 100ms
- DELETE 后 100ms 内 CREATE → 合并为 UPDATED
- 用 `mtime + size` etag 区分自己写入 vs 外部变更
- 忽略临时文件模式（`~$*`、`*.tmp`）

---

## 附录：关键决定来源

所有决定均来自地图 #1 的已关闭 ticket：

- [#2 内核与生态事实调研](https://github.com/ziyueyijun/confidant/issues/2)
- [#3 最小 diff 保真要不要当硬需求](https://github.com/ziyueyijun/confidant/issues/3)
- [#4 选定编辑器内核](https://github.com/ziyueyijun/confidant/issues/4)
- [#5 可行性压测原型](https://github.com/ziyueyijun/confidant/issues/5)
- [#6 markdown 规范化策略](https://github.com/ziyueyijun/confidant/issues/6)
- [#7 界面布局原型](https://github.com/ziyueyijun/confidant/issues/7)
- [#8 文件库与文件系统行为](https://github.com/ziyueyijun/confidant/issues/8)
- [#9 搜索体验与实现](https://github.com/ziyueyijun/confidant/issues/9)
- [#10 图片与附件处理](https://github.com/ziyueyijun/confidant/issues/10)
- [#11 Electron 脚手架事实调研](https://github.com/ziyueyijun/confidant/issues/11)
- [#12 编辑交互细节](https://github.com/ziyueyijun/confidant/issues/12)

---

**规格终稿**。所有设计决定已完成，可交接给实现 agent。
