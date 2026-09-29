# Confidant

Typora 风格的内联 WYSIWYG Markdown 笔记应用，使用纯 .md 文件存储。

## 功能特性

- **内联 WYSIWYG 编辑**：基于 CodeMirror 6 的所见即所得 Markdown 编辑器
- **文件库管理**：文件树浏览，多标签页编辑
- **全文搜索**：快速搜索整个文件库
- **快速切换**：Ctrl+P 快速打开文件
- **图片支持**：粘贴、拖放图片自动保存到 attachments 文件夹
- **外部更改检测**：自动检测并处理文件的外部修改
- **异常处理**：完善的错误处理（只读、权限、磁盘空间、大文件等）
- **单实例运行**：重复启动时激活已有窗口
- **文件关联**：支持设置为 .md 文件的默认打开程序

## 开发

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 测试

```bash
npm run test
```

## 打包

### 构建 Windows 版本

```bash
npm run build:win
```

生成文件位于 `dist/` 目录：
- `Confidant Setup 0.1.0.exe` - NSIS 安装包（支持文件关联配置）
- `Confidant-0.1.0-portable.exe` - 便携版（无需安装）

### 仅构建 NSIS 安装包

```bash
npm run build:win:nsis
```

### 仅构建便携版

```bash
npm run build:win:portable
```

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **CodeMirror 6** - 现代化的代码编辑器
- **TypeScript** - 类型安全的 JavaScript
- **Vite** - 快速的构建工具
- **electron-builder** - Electron 应用打包工具

## 架构

- `src/main/` - Electron 主进程（文件系统、IPC）
- `src/renderer/` - 渲染进程（UI、编辑器）
- `src/preload/` - 预加载脚本（安全的 IPC 桥接）
- `src/shared/` - 共享类型和工具

## 许可证

MIT
