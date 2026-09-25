# Windows 集成与更新：文件关联与自动更新

> 本文件是知己笔记在 Windows 上「双击 .md 打开」+「自动更新」两项能力的技术事实调研。
>
> 调研日期：2026-09-25。凡标注**已查源码**的结论直接引自 electron-builder / electron-updater / Electron 的当前源码或发布包；凡标注**未确证**的，公开来源中确实不存在。**不要编造**。
>
> 前提事实基座见 `0001-技术事实基础.md`（Electron 而非 Tauri；CodeMirror 6 而非 ProseMirror）。本文件不重复那些内容。
>
> 版本坐标（已核实）：electron-builder 稳定线 **26.16.1**（npm `v26` tag，2026-09-07 发布），`latest` tag 是 26.15.3；**27.0.0-alpha.8** 在 `next` tag。electron-updater 稳定线 6.x，7.0.0-alpha 在 alpha 通道。本文凡涉及 v27 的地方会明确标注。

---

## 一、Windows 文件关联

### 1.1 electron-builder 的 `fileAssociations` 到底写了哪些注册表项

**字段定义**（已查源码 `packages/app-builder-lib/src/options/FileAssociation.ts`，master 与已发布的 26.16.1 一致）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ext` | `string \| string[]` | 必填。扩展名，**不含前导点** |
| `name` | `string` | 默认等于 `ext` |
| `description` | `string` | **仅 Windows** |
| `mimeType` | `string` | 仅 Linux |
| `icon` | `string` | `.ico`（Win）/ `.icns`（mac），相对 `build/`；默认用应用图标 |
| `role` | `string` | **仅 macOS**（`CFBundleTypeRole`）：`Editor`/`Viewer`/`Shell`/`None`，默认 `Editor` |
| `isPackage` | `boolean` | 仅 macOS（`LSTypeIsPackage`） |
| `rank` | `string` | 仅 macOS（`LSHandlerRank`）：`Owner`/`Default`/`Alternate`/`None`，默认 `Default` |

**真正写注册表的是 NSIS 宏 `APP_ASSOCIATE`**（已查源码 `packages/app-builder-lib/templates/nsis/include/FileAssociation.nsh`）。它写的是：

```
<SHELL_CONTEXT>\Software\Classes\.<ext>                        (Default) = <ProgID>
<SHELL_CONTEXT>\Software\Classes\.<ext>\OpenWithProgids        <ProgID>  (REG_NONE)
<SHELL_CONTEXT>\Software\Classes\<ProgID>                      (Default) = <description>
<SHELL_CONTEXT>\Software\Classes\<ProgID>\DefaultIcon          (Default) = <icon>
<SHELL_CONTEXT>\Software\Classes\<ProgID>\shell                (Default) = "open"
<SHELL_CONTEXT>\Software\Classes\<ProgID>\shell\open           (Default) = "Open with <ProductName>"
<SHELL_CONTEXT>\Software\Classes\<ProgID>\shell\open\command   (Default) = "$appExe $\"%1$\""
```

`SHELL_CONTEXT` 是 NSIS 的 `SHCTX` 别名。NSIS 官方文档原文（已核实）：

> If root_key is SHCTX or SHELL_CONTEXT, it will be replaced with HKLM if SetShellVarContext is set to all and with HKCU if SetShellVarContext is set to current.

即：**这些项写到 `HKLM\Software\Classes` 还是 `HKCU\Software\Classes`，取决于安装模式**，而不是硬编码。

**per-machine 还是 per-user？需要管理员权限吗？**

- `nsis.perMachine` 默认 **`false`**（已查源码 `CommonWindowsInstallerConfiguration.ts`：`Whether to install per all users (per-machine). @default false`）。
- `nsis.oneClick` 默认 **`true`**。
- 一次点击安装（oneClick，默认）+ `perMachine: false` → `initMultiUser` 走 `setInstallModePerUser` → `SetShellVarContext current` → **写 HKCU，不弹 UAC**。
- `perMachine: true` → 定义 `INSTALL_MODE_PER_ALL_USERS` → `installer.nsi` 里 `RequestExecutionLevel admin`（**安装包自身请求提权**），且 `SetShellVarContext all` → 写 HKLM。

**一个重要且容易踩的坑（已查源码）**：electron-builder 的 NSIS 模板里，**只有卸载器调用 `SHChangeNotify`**（`uninstaller.nsh` 第 210 行 `shell32::SHChangeNotify(... 0x08000000 ...)`）；**安装器不调用**。`UPDATEFILEASSOC` 宏在 `FileAssociation.nsh` 里定义了，但**从未被 insert**。

微软文档明确要求：

> When you create or change a file association, it is important to notify the system that you have made a change. Do so by calling SHChangeNotify and specifying the SHCNE_ASSOCCHANGED event. **If you do not call SHChangeNotify, the change may not be recognized until after the system is rebooted.**

**推断**：安装后关联可能不立刻生效（资源管理器缓存），需要重新登录/重启，或用户手动刷新。这是个真实存在的行为缺口，不是猜测——宏未调用是源码事实，后果由微软文档给出。

**另一个坑**：`APP_ASSOCIATE` 只写 `OpenWithProgids`，**不写** `Applications\<exe>` 键，也**不写** `RegisteredApplications` / `Capabilities`。所以它**不会**让应用出现在 Windows「默认应用」设置页的候选列表里（那个列表由 `Capabilities` + `RegisteredApplications` 驱动，见微软 `default-programs` 文档）。它只保证出现在右键「打开方式」里。

### 1.2 文档与代码的矛盾：`fileAssociations` 是否真的要求 `perMachine: true`

**这是本次调研最需要小心的一处。文档说"必须 perMachine"，代码里那个强制已经不存在了。**

三条各自独立、都已核实的事实：

**(1) TSDoc 仍然写着"必须 perMachine"。** `FileAssociation.ts` 的接口注释，master 和已发布 26.16.1 都还是：

> On Windows (NSIS) works only if `nsis.perMachine` is set to `true`.

**(2) 强制它的那个 `throw` 曾经存在，但已被删除。** 已核对 npm 上的历史发布包：

| 包与版本 | 是否含该 throw |
|---|---|
| `electron-builder-lib@19.56.2` | **是** |
| `electron-builder-lib@20.0.0` | **是** |
| `app-builder-lib@20.39.0` | 否 |
| `app-builder-lib@21.x / 22.x / 23.x / 24.x / 25.x` | 否 |
| `app-builder-lib@26.16.1`（当前稳定） | 否 |
| master（v27 线） | 否 |

那条被删掉的报错原文是：

> `Please set perMachine to true — file associations works on Windows only if installed for all users`

它由提交 [`96c8ed9`](https://github.com/electron-userland/electron-builder/commit/96c8ed97157f89c789221191b46757e41cfbf961)（"fix(nsis): Must be error if file association is set, but perMachine not", Close [#772](https://github.com/electron-userland/electron-builder/issues/772)）加入，在 20.0.0 与 20.39.0 之间的某个版本被移除。**移除后，TSDoc 注释没有跟着改。** 这是文档陈旧，不是代码回退。

**(3) 当前源码里确实没有任何 perMachine 门槛。** master 的 `NsisTarget.ts` `computeFinalScript` 中，`fileAssociations.length !== 0` 分支里唯一的一条日志是 v27 的 ProgID 变更警告，**没有任何 perMachine 检查或警告**。

**当年那条报错的理由（二手，但来自维护者本人）**：issue #772 里维护者说：

> Because Windows is \*\*\* Windows, per-user installed program cannot register file associations.

**但这条说法与微软文档不符。** 微软 `fa-file-types` 文档原文：

> To make a file type registration visible to the current user only, create an entry for the file type in the **HKEY_CURRENT_USER\Software\Classes** subkey.

即 **per-user 注册文件关联是微软明确支持的路径**。真正的限制不是"per-user 装不了关联"，而是"per-user 注册只对当前用户可见"。

**结论（区分事实与推断）**：
- **事实**：当前稳定版（26.16.1）和 master 都不再阻止 per-user 安装 + `fileAssociations`；宏会老老实实写 HKCU。TSDoc 说"必须 perMachine"是陈旧注释。
- **事实**：per-user 写 HKCU\Software\Classes 是微软文档支持的合法注册。
- **推断 / 未确证**：维护者从未宣布"per-user 关联现在是受支持的"，也没有测试覆盖（v27 的 ProgID 测试 `progIdTest.ts` 不区分安装模式）。所以这是**未文档化、未测试、随时可能被再次收紧**的路径。**不要把它当成受支持的配置来依赖。**

### 1.3 `app.setAsDefaultProtocolClient` 能不能做文件扩展名

**不能。确认。** Electron 官方文档（`docs/api/app.md`，已查源码）原文：

> `app.setAsDefaultProtocolClient(protocol[, path, args])`
> - `protocol` string - The name of your protocol, without `://`.
>
> Sets the current executable as the default handler for a **protocol (aka URI scheme)**.
> The API uses the Windows Registry and `LSSetDefaultHandlerForURLScheme` internally.

参数只有 `protocol` / `path` / `args`，**没有任何文件扩展名入口**。相关 API（`isDefaultProtocolClient`、`removeAsDefaultProtocolClient`、`getApplicationNameForProtocol`）全部是协议语义。**它只做协议，不做扩展名。**

（唯一沾边的是 `app.getFileIcon` 和 `app.addRecentDocument`，都与注册关联无关。）

**运行时动态写注册表的其他路径**：理论可行（Node 的 `winreg` 之类库，或 `reg.exe`），但会撞上下面 1.4 的墙：**你可以注册"可选项"，但无法程序化地把 `UserChoice` 设成自己**。所以动态写注册表相对安装时写注册表**没有任何额外收益**，只增加了每次启动都要写注册表的副作用。**不推荐。**

### 1.4 Windows 11 的默认应用机制（**关键问题，已查一手来源**）

微软官方开发者文档 [Windows app defaults platform](https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/default-apps-platform)（`ms.date: 2024-10-25`，`updated_at: 2026-04-04`）原文：

> **Security considerations for the app defaults platform**
> To help protect users' default app choices from malware changing settings without the user being aware, **Windows requires that app default settings must be set through the Windows system UI.**
> - **Windows does not allow programmatic changes to default apps without user interaction in system UI.**
> - **User setting data for app defaults is obfuscated in registry data stores. Registry-based changes are not supported for apps.**
> - **User setting data for app defaults are protected by a Windows filter driver (UCPD.sys) that blocks apps from writing app defaults data.**
> - Apps can query which app is the default for a given type.

同一页还说明：

> - Windows will automatically prompt the user when they open a file or link type when a new app is installed that registered for that file or link type.
> - Apps can also direct the user to Settings to change default app settings.

以及开发者最佳实践：

> - Use the `ms-settings:defaultapps` URI to launch the Default Apps settings page or your app's page within Default Apps directly.
> - **Respect User Choice**: Avoid aggressive prompts or repeated notifications.

另一份微软文档 [`default-programs`](https://learn.microsoft.com/en-us/windows/win32/shell/default-programs)（较早，2018）同样说：

> attempts by an application to modify default association behaviors at a machine level post-installation **will be unsuccessful**. Instead, defaults must be registered on a per-user level
>
> **The choice of default should be user driven. An application should never reclaim a default without asking the user.**

**对"安装完就能双击打开"这个诉求意味着什么——这是最重要的结论：**

1. **「安装完就自动成为 .md 的默认程序」在 Windows 10/11 上做不到，任何应用都做不到。** 不是 electron-builder 的限制，是操作系统的安全设计（`UCPD.sys` 过滤器驱动 + `UserChoice` 哈希保护）。
2. **能做到的是**：安装后你的应用出现在右键「打开方式」里，并且当用户下次打开 .md 时 **Windows 会主动弹出一次"要用哪个应用打开？"**（上面第一句原文）。用户勾选"始终"之后才成为默认。
3. **正确的产品设计**是：应用内检测自己是不是默认程序（`IApplicationAssociationRegistration::QueryCurrentDefault`），如果不是，**引导用户去 `ms-settings:defaultapps`**，而不是弹自己的"设为默认"按钮（那也设不了）。
4. 用户在 Windows 11 上改默认应用要**逐个文件类型设置**（Win11 取消了 Win10 的"一次性把某应用的所有关联都设好"）。**这一条我只找到二手来源**（PCMag / Windows Central / ElevenForum 等一致报告，以及微软支持页的摘要），**未从微软开发者文档确证**。但即使不采信这条细节，上面的结论 1–3 已经成立。

**如果用户已经在用 Typora**：安装不会改变任何东西。Typora 的 `UserChoice` 仍在，双击 .md 仍归 Typora。用户必须主动去设置里改。你的应用只是多了个「打开方式」候选。

### 1.5 能不能"只注册为可选的打开方式而不抢默认"

**能，而且这正是 `APP_ASSOCIATE` 的实际效果。** 两种机制要分清：

| 写入 | 作用 | 在 Win10/11 的实际效果 |
|---|---|---|
| `Software\Classes\.md\OpenWithProgids` = ProgID | 让应用出现在右键「打开方式」 | **生效**（微软 `how-to-include-an-application-on-the-open-with-dialog-box` 文档指定的正是这个键） |
| `Software\Classes\.md` (Default) = ProgID | 声明该扩展名的"后备默认 ProgID" | **若用户已有 `UserChoice` 则被忽略**；只在无 UserChoice 时作为兜底 |

所以 electron-builder 的默认行为（两个都写）**在 Win10/11 上等价于"只注册为可选项"**——因为那个"抢默认"的写入会被 `UserChoice` 覆盖掉。

**如果要严格做到"只写 OpenWithProgids、不碰扩展名默认值"**，需要自定义 NSIS 脚本（`build/installer.nsh` + `customInstall` 宏），或在 `fileAssociations` 之外手写 `WriteRegNone`。**推断**：收益极小（因为默认值写入本来就无效），**不值得为此维护自定义脚本**。

**注意 v27 的 ProgID 变更**：v27 起 ProgID 不再是 `name`/`ext` 原值，而是自动生成的 `<program>.<component>`（`ProgIdMaker`，来自 productName + app GUID）。原因写在源码注释里：微软规定 ProgID **≤39 字符、只含字母数字和单个句点、不能以数字开头**（[微软 ProgID 文档](https://learn.microsoft.com/en-us/windows/win32/com/-progid--key) 已核实）。若你的自定义脚本硬编码了旧 ProgID，v27 会**警告**并需要你改。**你现在还没发布，所以不受影响——但这是个"现在定对、以后省事"的点。**

### 1.6 双击后应用如何拿到文件路径

**Windows 上没有事件，只能读 `argv`。** Electron 文档原文：

> ### Event: 'open-file' _macOS_
> Emitted when the user wants to open a file with the application. ... Make sure to listen for the `open-file` event **very early in your application startup** to handle this case (even before the `ready` event is emitted).
> You should call `event.preventDefault()` if you want to handle this event.
>
> **On Windows, you have to parse `process.argv` (in the main process) to get the filepath.**

**命令行长什么样**（已查源码）：`APP_ASSOCIATE` 的 command 是 `"$appExe $\"%1$\""`，即**文件路径作为最后一个 argv 元素**，没有 `--` 分隔符，也没有引号包裹（引号由 shell 处理）。

**两条路径都要处理：**

1. **首次启动（应用未运行）** → 读 `process.argv`。
2. **已有实例在运行** → `app.requestSingleInstanceLock()` + `second-instance` 事件。文档原文：

> This event will be emitted inside the primary instance of your application when a second instance has been executed and calls `app.requestSingleInstanceLock()`.
> `argv` is an Array of the second instance's command line arguments, and `workingDirectory` is its current working directory.
>
> **NOTE**: `argv` will not be exactly the same list of arguments as those passed to the second instance. The order might change and additional arguments might be appended. If you need to maintain the exact same arguments, it's advised to use `additionalData` instead.
> **NOTE**: If the second instance is started by a different user than the first, the `argv` array will not include the arguments.
> **NOTE**: Extra command line arguments might be added by Chromium, such as `--original-process-start-time`.

**打包后 argv 的具体形态（开发 vs 打包的差异）**：

| 场景 | `argv[0]` | `argv[1]` | 文件路径位置 |
|---|---|---|---|
| 开发（`electron .`） | electron.exe 路径 | 应用目录 | `argv[2]` 起 |
| 打包后 | 应用 exe 路径 | 文件路径 | `argv[1]` 起 |

**推断（广泛使用的惯例，未在 Electron 文档中找到成文规定）**：常见写法是 `process.argv.slice(app.isPackaged ? 1 : 2)`。Electron 的 `process.defaultApp` 在开发模式为 `true`，可用它区分。**注意**：`second-instance` 的 `argv` **不是**这个形状——它已经是"第二个实例的参数"，且文档明确警告会混入 Chromium 参数（如 `--original-process-start-time`），所以**必须按后缀/扩展名过滤，不能按固定下标取值**。

**macOS 的差异（两条都要注意）**：

1. **事件不同**：macOS 用 `open-file` 事件（不是 argv）。且必须**在 `ready` 之前**就注册监听器，否则冷启动时丢事件。还需调用 `event.preventDefault()`。
2. **声明位置不同**：macOS 的文件关联必须在 **`Info.plist` 的 `CFBundleDocumentTypes`** 里声明（构建期），**不能运行时改**。electron-builder 的 `fileAssociations` 在 mac 上映射到 `CFBundleDocumentTypes`，所以配置本身是同一份，但**生效机制完全不同**。

### 1.7 portable（免安装）形态能不能做文件关联

**不能。而且不是"做不到"，是 electron-builder 直接跳过。**

两条已核实的事实：

**(1) 官方 target 表直接标注**（`website/docs/targets.md`）：

| Target | Format | Best For | Admin Required | Auto-Update |
|---|---|---|---|---|
| `nsis` | `.exe` installer | Consumer apps (most common) | Optional (per-user mode) | electron-updater |
| **`portable`** | **`.exe` no-install** | **USB drives, no-install scenarios** | **No** | **Manual** |

同一页：`Portable` — "Single executable, runs from any location. **No registry entries, no Start menu entries.** Common for developer tools, USB-stick deployments. **Auto-updates require manual implementation.**"

**(2) 源码层面 portable 提前返回，`fileAssociations` 被静默忽略**（已查源码 `NsisTarget.ts`）：

```ts
if (this.isPortable) {
  return scriptGenerator.build() + originalScript
}
// ↓ 以下 fileAssociations 处理逻辑对 portable 永远不会执行
const fileAssociations = packager.fileAssociations
if (fileAssociations.length !== 0) { ... }
```

**注意这是"静默忽略"——不会报错、不会警告。** 你配了 `fileAssociations` 打 portable 包，配置会被无声丢弃。

**为什么 portable 结构上做不到**：portable 的 `.exe` 在运行时把应用解压到临时目录（源码 `portable.nsi`：`StrCpy $INSTDIR "$PLUGINSDIR\app"`，或 `$TEMP\${UNPACK_DIR_NAME}`），从那里运行，退出即清理。**没有一个稳定的安装路径可以写进注册表**——注册表里的 `command` 指向临时目录，进程退出后就失效了。

**这一条直接决定分发形态**：要「双击 .md 打开」，**必须用安装包（NSIS），不能用 portable**。

### 1.8 抢占默认程序：静默还是需要确认

见 1.4 的结论，归纳成一句：**安装时能静默完成的是"注册为候选"，"成为默认"必须用户确认。** 具体地：

- **静默完成的**：写 `HKCU\Software\Classes\.md\OpenWithProgids`（或 HKLM 对应项）→ 应用进入「打开方式」候选。
- **需要用户确认的**：把 `UserChoice` 设为自己 → **操作系统禁止程序化写入**（`UCPD.sys` 拦截 + 哈希保护）。用户必须在 `设置 → 应用 → 默认应用` 里手动选一次，或在首次双击时响应 Windows 的弹窗。

**用户已在用 Typora 会怎样**：什么都不会变。`UserChoice` 里还是 Typora。你的安装**不会**弹 UAC、**不会**弹确认框、**不会**抢走关联。用户需要自己去改。

---

## 二、自动更新

### 2.1 `electron-updater` 的 NSIS 更新流程

**总体机制**（官方 auto-update 文档原文）：配置构建产出 release metadata（`latest.yml`）→ builder 把 target + metadata 上传到 publish 目的地 → 应用向 publish server 查询新版本。文档原话："You need only 2 lines of code to make it work."，且**不要调用 `setFeedURL`**——构建期会把内部 `app-update.yml` 写进包内。

**NSIS 的更新流程（已查源码 `NsisUpdater.ts` + `AppUpdater.ts`）**：

1. 拉取 `latest.yml`（走 provider）。
2. 下载安装包；若有 `.blockmap` 则走**差分下载**（`DifferentialDownloader`，可选 HTTP range 请求）。
3. **校验**：`verifySignature(destinationFile)`——比对下载到的安装包的 Authenticode 签名主体与 `app-update.yml` 里的 `publisherName`（详见 2.5）。
4. **安装**：`doInstall` 拼参数并执行：
   ```ts
   const args = ["--updated"]
   if (options.isSilent) args.push("/S")
   if (options.isForceRunAfter) args.push("--force-run")
   if (this.installDirectory) args.push(`/D=${this.installDirectory}`)
   if (packagePath != null) args.push(`--package-file=${packagePath}`)
   ```
   然后 `spawn(installerPath, args)`。若 `isAdminRightsRequired` 为真 → 改走 `elevate.exe`；否则直接执行，**仅在 EACCES/UNKNOWN 时才回退到 `elevate.exe`**。
5. **重启**：`quitAndInstall({ isSilent, isForceRunAfter, waitUntilNextLaunch })`。

**`autoInstallEvent` 决定"何时装"**（默认 `"onQuit"`）：`"manual" | "onQuit" | "onNextLaunch"`。v27 新增了 "Session-end guard（always on）"——操作系统会话结束时跳过 on-quit 安装，避免 [#7807](https://github.com/electron-userland/electron-builder/issues/7807) 那类"卸载了旧版但没装上新版"的损坏。

**需要什么元数据文件**：`latest.yml`（Windows；macOS 是 `latest-mac.yml`，Linux 是 `latest-linux.yml`）。**已查源码**：`NsisTarget.ts` 里 `isWriteUpdateInfo: !this.isPortable`——**portable 根本不产出 `latest.yml`**。v27 起 metadata 默认用 `files[]` 格式，去掉旧版顶层 `path`/`sha512`；仅靠旧 `sha2` 字段校验的 metadata **v28 起 fail-closed**。

### 2.2 托管位置

**GitHub Releases（公开仓库）**

已核实的硬限制（GitHub 官方文档 [about-releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)）：

> Up to 1000 release assets may be associated with a single release.
> **Each file included in a release must be under 2 GiB.**
> **There is no limit on the total size of a release, nor bandwidth usage.**

对一个 ~100MB 的 Electron 安装包，**2 GiB 和 1000 assets 都远不是问题**，带宽也免费无限制。**这一条完全够用。**

**GitHub Releases（私有仓库）——你的理解基本正确，但有一个反直觉的出路**

已查源码（`providerFactory.ts`）：

```ts
const token = (githubOptions.private ? process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"] : null) || githubOptions.token
```

官方文档原文：

> You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable ... The GitHub API currently has a rate limit of 5000 requests per user per hour. An update check uses up to 3 requests per check.

**"token 不能打包进客户端"——文档也这么警告**：`publish` 文档里 `token` 字段注明 "**Never specify it in the configuration files.**"

**但对你这个项目有一个特殊之处**：**用户就是开发者本人，只有一台机器**。所以可以在**自己机器上设一个 `GH_TOKEN` 用户环境变量**，私有仓库就能用。这不是"打包进客户端"，是"本机环境变量"。

代价与风险（**推断**）：
- 每次更新检查消耗 ~3 次 API 请求，5000/小时的限额对单机**绰绰有余**。
- 但把更新源绑到"本机环境变量"上很脆：换机器、重置系统、token 过期（GitHub PAT 有有效期）都会静默断掉更新。而且**它把"更新能否成功"和"GitHub 账号可用性"耦合在一起**。
- `PrivateGitHubProvider` 走 API + `redirect: "manual"` + `authorization: token <token>`，与公开仓库走 Atom feed 的路径**不同**，是另一条代码路径（更少人用）。

**其他托管选择**

已查源码支持的 provider：**GitHub Releases、Amazon S3、DigitalOcean Spaces、Cloudflare R2、Keygen、generic HTTP(S)、Bitbucket、GitLab**。

- **generic（自建静态 HTTP / 对象存储）**：**最简单也最可控**。`GenericProvider` 只做一件事：GET `<baseUrl>/latest.yml`，解析，然后从同一 baseUrl 取安装包。源码里对 `ECONNREFUSED` 重试 3 次。所以要求只有两条：**一个能放文件的 HTTP 端点** + **该端点下有一个 `latest.yml`**。
- **S3 / 阿里云 OSS / 腾讯云 COS / MinIO**：都适用。S3 有原生 provider；OSS/COS/MinIO 用 **generic provider 指到公网 URL** 即可（**推断**：它们都兼容 S3 协议，但 electron-builder 没有 OSS/COS 专用 provider，最稳的是 generic）。需要：一个可公开读取的 URL 前缀。
- **坚果云 WebDAV**：**electron-updater 没有 WebDAV provider**（已核实 provider 清单）。理论上可以把坚果云的**公开分享链接**当 generic 端点用，但这是**未确证**的用法——没人测过，且分享链接的 URL 形态与"静态目录 + latest.yml"未必对得上。**不建议作为主方案。**

**国内网络**

已核实的一手来源（Wikipedia [Censorship of GitHub](https://en.wikipedia.org/wiki/Censorship_of_GitHub)）：

> GitHub is **not subject to a blanket block** in mainland China. ... **Access can be slow or unreliable**, and some subdomains such as `raw.githubusercontent.com` face restrictions by certain ISPs.
>
> On January 21, 2013, GitHub was blocked in China using DNS hijacking. The block was lifted on January 23, 2013 ...

**已确证**：GitHub 在国内不是全站封锁，但"慢且不可靠"，且部分子域受 ISP 限制。

**未确证**：GitHub Releases 的**资源下载域名**（`objects.githubusercontent.com`）在国内的具体可达性，我**没有找到一手来源**。网上大量"GitHub 下载慢/要挂代理"的说法是社区经验，不是可引用的权威事实。

**对你这个场景的实际含义（推断）**：**用户就是你自己**。如果你能正常访问 GitHub，公开仓库 + GitHub Releases 就是**零成本、零维护的最优解**。如果访问不稳，再换 **generic + 国内对象存储**——切换成本只是改 `publish` 配置里的一行 URL，**架构上不构成锁定**。

### 2.3 签名与 UAC 的关系（**关键，已查一手来源**）

**(a) 未签名应用做自动更新，每次更新都会弹 UAC / SmartScreen 吗？**

**UAC：取决于安装模式，不取决于签名。这是最重要的一条。**

已查源码（`AppUpdater.ts` 注释，master）：

> The automatic install at startup only runs for targets that can install without an elevation prompt: **NSIS (per-user, `isAdminRightsRequired === false`)** and AppImage. Linux package targets (deb, rpm, pacman) always elevate via pkexec/sudo, and **NSIS per-machine installs trigger a UAC prompt**, so for those the pending update is kept and `installPendingUpdateIfAvailable()` must be called explicitly at a moment the app controls.

官方 auto-update 文档的 per-target 表格（已核实）：

| Target | Automatic next-launch install | `installPendingUpdateIfAvailable()` |
|---|---|---|
| NSIS per-user | **yes** | yes |
| NSIS per-machine (`isAdminRightsRequired`) | **skipped — would show a UAC prompt at startup** | yes, with UAC |
| AppImage | yes | yes |
| deb/rpm/pacman | skipped — package managers always elevate (pkexec/sudo) | yes, with auth |
| macOS | n/a | resolves `false` |

`isAdminRightsRequired` 是**构建期**决定的（已查源码 `NsisTarget.ts`）：

```ts
if (updateInfo != null && isPerMachine && (oneClick || options.packElevateHelper)) {
  updateInfo.isAdminRightsRequired = true
}
```

即：**per-machine 安装 → 更新时弹 UAC**；**per-user 安装 → 不弹 UAC**。

**(b) per-user 安装（`nsis.perMachine: false`）是否完全不需要管理员权限、不弹 UAC？**

**是，已确证。** 三条独立证据：
1. `perMachine` 默认 `false`（源码 `@default false`）。
2. per-user 时 `installer.nsi` 走 `RequestExecutionLevel user`（源码：`!ifdef INSTALL_MODE_PER_ALL_USERS` → `RequestExecutionLevel admin`，`!else` → `RequestExecutionLevel user`）。
3. 官方 target 表：`nsis` 的 "Admin Required" 列写的是 "**Optional (per-user mode)**"。

**这对"安静地自我更新"有多重要？——这是整个决策里权重最高的一条。** 它直接决定更新是"用户完全无感的后台行为"还是"每次都要点一次 UAC 的仪式"。**per-user 是安静自更新的前提条件。**

**(c) SmartScreen 对未签名安装包的警告强度**

微软官方 [SmartScreen 文档](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)原文：

> Microsoft Defender SmartScreen determines whether a downloaded app or app installer is potentially malicious by:
> - Checking downloaded files against a list of reported malicious software sites and programs known to be unsafe. ...
> - **Checking downloaded files against a list of files that are well known and downloaded frequently. If the file isn't on that list, Microsoft Defender SmartScreen shows a warning, advising caution.**
>
> **Reputation-based URL and app protection**: ... If a URL, a file, an app, or a certificate has an established reputation, users don't see any warnings. **If there's no reputation, the item is marked as a higher risk and presents a warning to the user.**

electron-builder 官方 code-signing 文档对"不签名"的后果描述：

> **SmartScreen warning on first run ("Unknown publisher")**
> After reputation builds (days-weeks) — Most common choice (OV)
> Instant trust, no reputation period needed (EV)

**"自己给自己装"的场景下是否可接受？**

**推断**：**基本可接受，但要分清"首次安装"和"自动更新"两种情况。**
- **首次安装**：你从浏览器下载 `.exe` → 文件带 MOTW（Zone.Identifier）→ SmartScreen 因"无信誉"弹"Windows 保护了你的电脑"。**一次性的**，点"仍要运行"即可。对单人开发完全可接受。
- **自动更新**：`electron-updater` 用 Electron 的 net 模块下载安装包，**是否给下载文件附加 MOTW，我未找到一手来源确认**（这是本次调研最大的空白）。如果不附加 MOTW，SmartScreen 的应用信誉检查**可能不会**在更新时触发；如果附加，理论上每次更新都可能触发。**标注为未确证。**

  可确认的是：`electron-updater` 执行安装时传的是 `/S`（静默），而**签名校验是 electron-updater 自己做的、与 SmartScreen 无关**（见 2.5）。

**结论（事实层面）**：SmartScreen 是**基于信誉**的，不是"未签名就每次都弹"。electron-builder 文档说 OV 证书"信誉随下载量积累"，EV 证书"即时信任"。**对你的单人场景，最省事的做法是不签名 + 接受首次安装的 SmartScreen 提示。**

**(d) `electron-updater` 在未签名时能否正常工作**

**能，已查源码确认。** `NsisUpdater.verifySignature()`：

```ts
publisherName = (await this.configOnDisk.value).publisherName
if (publisherName == null) {
  this._logger.warn("Signature verification ... skipped because no publisherName is present ...")
  return null   // ← 跳过校验，不报错
}
```

`publisherName` 默认值来自**代码签名证书的 CN**（`winOptions.ts`：`Defaults to the Common Name (CN) extracted from your code signing certificate. Set to null to opt out.`）。**不签名 → `app-update.yml` 里没有 `publisherName` → 跳过校验 → 更新正常工作。**

已核对稳定版 electron-updater 6.x（6.3.9 / 6.6.2）：同样是 `if (publisherName == null) return null`，**静默跳过，连警告都没有**。

**但这是一个正在关闭的窗口——必须现在就知道：** master（v27 线）的注释原文：

> This fail-open behavior is **deprecated**: electron-builder **v28 will treat a missing publisherName as a verification failure (fail-closed)**.

**所以：现在（v26 + electron-updater 6.x）不签名能用；将来升到 v28 线，要么签名、要么显式 `verifyUpdateCodeSignature` 自定义、要么确认 `win.publisherName` 的处理方式。** 这是个"现在不做、将来会很痛"的点（见结论 D）。

### 2.4 portable 能不能自动更新

**不能。已确证，两条独立证据：**

1. 官方 target 表：`portable` 的 Auto-Update 列 = **"Manual"**；正文："**Auto-updates require manual implementation**"。
2. **已查源码**：`NsisTarget.ts` 里 `isWriteUpdateInfo: !this.isPortable`——**portable 根本不产出 `latest.yml`**。electron-updater 没有 metadata 可查，机制上就不成立。

**为什么结构上做不到**：portable 的 `.exe` 运行时解压到临时目录（`$PLUGINSDIR\app` 或 `$TEMP\...`）再运行，退出即清理。没有稳定的安装位置可供"就地替换"，也没有注册表项可供 electron-updater 定位。

**"手动替换文件夹"是不是唯一出路？——是。** 而且因为 portable 就是单个 `.exe`，实际操作是"下载新的 `.exe`，替换旧的"。**推断**：可以在应用内做"检查新版本 → 打开浏览器到下载页"，但**无法自动完成替换**（正在运行的 exe 不能替换自己）。

**这一条与 1.7 叠加**：portable 既不能文件关联、也不能自动更新。**两项需求都指向同一个结论：必须用 NSIS 安装包。**

### 2.5 降级 / 回滚

**能做到，但不是"一键回退"。**

已核实的事实：

- **`allowDowngrade` 选项存在**。`AppUpdater.ts` 注释：pending update 只在"版本是可行的变更"时才安装——"newer than the running app, **or a downgrade when `allowDowngrade` is enabled**"。
- `generateUpdatesFilesForAllChannels: true` **会自动把 `allowDowngrade` 设为 true**（官方 channels 文档）。
- **staged rollout 回滚的官方说明**（auto-update 文档原文）：
  > To pull a bad rollout, you **must** increment the version number higher than your broken release, otherwise users already on the broken build won't move.

**回滚的实操方式（推断，基于上述事实）**：
1. **正确做法**：发一个**版本号更高**的包，内容回退到旧代码。这是唯一可靠的方式，因为更新判定基于版本号比较。
2. 若确实要降版本号：需要 `allowDowngrade: true`（或在发布配置里开 `generateUpdatesFilesForAllChannels`）。
3. **手动兜底**：用户直接下载旧版安装包覆盖安装。NSIS 安装器会处理覆盖。

**注意**：`latest.yml` 里的 `sha512` 和签名校验是**防止安装"不是你发的包"**，不是防止"版本号倒退"。所以**回滚的可靠性依赖你自己的版本号纪律**。

### 2.6 electron-builder vs electron-forge

**已核实的事实：**

| | electron-builder | electron-forge + update-electron-app |
|---|---|---|
| **Windows 安装包** | **NSIS 是默认且推荐的 target** | **没有 NSIS maker**。已核对 forge 的 maker 包清单：`appx`/`deb`/`dmg`/`flatpak`/`msix`/`pkg`/`rpm`/`snap`/`squirrel`/`wix`/`zip` |
| **per-user 安装** | **原生支持**（`perMachine: false`，默认） | Squirrel.Windows 是 per-user 的；WiX MSI 需要管理员 |
| **自动更新机制** | `electron-updater`（本文全部内容） | `update-electron-app` + Squirrel.Windows / update.electronjs.org |
| **更新元数据** | `latest.yml` | `RELEASES` + `*-full.nupkg`（Squirrel） |
| **签名要求** | Windows **推荐**（不强制） | 文档：`Your builds are code signed (macOS only)`——**仅 macOS 要求** |
| **NSIS + per-user + electron-updater** | **官方 target 表明确标注可用** | **无此组合** |

**关于 Squirrel.Windows 的现状（已核实）：**

- `targets.md` 把 `squirrel.windows` 标为 **"Legacy (not recommended)"**。
- `Squirrel/Squirrel.Windows` 仓库**未 archived**，但 `pushed_at` 停在 **2024-07-24**，README 首行是 **"Contributors Needed"**（"We are looking for help with maintaining this important project"）。
- `electron/windows-installer`（electron-winstaller）仍在维护（`pushed_at: 2026-09-23`）。
- forge 的 squirrel maker 要求：NuGet 元数据（`authors`/`description`，注意配置键是 `authors` 而 package.json 字段是 `author`）；且 "You can only build the Squirrel.Windows target on a Windows machine or on a Linux machine with mono and wine installed"。

**推荐（单人开发）：electron-builder + NSIS + per-user。**

理由（全部有上述事实支撑）：
1. **你的两项需求（文件关联 + 自动更新）在 electron-builder 里是同一条路径**：NSIS 是官方 target 表里唯一同时标注"文件关联可用"和"electron-updater"的 Windows target。
2. **per-user 免 UAC 是安静自更新的前提**，electron-builder 原生支持（`perMachine: false` 是默认值）。
3. **forge 没有 NSIS maker**，其 Windows 路线是 Squirrel.Windows——已被自己的文档标为 legacy，上游处于"求维护者"状态。
4. **配置量**：electron-builder 需要的是 `package.json` 里一个 `build` 块；forge 需要 `forge.config.js` + maker 配置 + 单独的 `update-electron-app` 接线。
5. **`update.electronjs.org` 免费服务只对开源应用开放**（forge 文档：`Open source apps hosted on GitHub can use a free auto update service`），你的应用是私人的，用不上。

---

## 三、结论

### A. 同时要「双击 .md 打开」+「自动更新」，分发形态应该是什么？

**推荐：NSIS 安装包，`perMachine: false`（per-user，默认值），`oneClick: true`（默认值），不签名起步。**

```jsonc
// package.json
"build": {
  "win": {
    "target": ["nsis"]
  },
  "nsis": {
    "perMachine": false,        // 默认值，显式写出以防被改
    "oneClick": true,           // 默认值
    "fileAssociations": [
      { "ext": "md", "name": "Markdown", "description": "Markdown 笔记" }
    ]
  },
  "publish": {
    "provider": "github",
    "owner": "<你>",
    "repo": "<仓库>"
  }
}
```

**理由（逐条对应上面的查证）：**

1. **portable 被排除，且是硬性排除**：portable 既不产出 `latest.yml`（源码 `isWriteUpdateInfo: !this.isPortable`），又在 `fileAssociations` 处理前提前返回。**两项需求它一项都满足不了。**
2. **per-machine 被排除**：per-machine 会让 `isAdminRightsRequired = true`，导致**自动安装被设计性跳过**（"skipped — would show a UAC prompt at startup"），每次更新都要走 UAC。与"安静自更新"直接冲突。
3. **per-user 是唯一同时满足两项的形态**：`Admin Required: Optional (per-user mode)`，且"automatic next-launch install: yes"。
4. **NSIS 是唯一在官方 target 表里同时标注文件关联可用 + electron-updater 的 Windows target。**

**不建议的备选**：MSI（`Admin Required: Yes`，且"Not supported via electron-updater"）；`msi-wrapped`（支持 electron-updater 但要管理员）；AppX/MSIX（"Store only"，且需要可信证书才能侧载）。

### B. 两项功能各自的最小实现

**文件关联——配置量 5 行，代码量 ~10 行。**

配置：上面 `nsis.fileAssociations` 那 3 行。

代码（主进程，示意）：
```js
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit() } else {
  app.on('second-instance', (_e, argv) => {
    const file = extractFileArg(argv)   // 按 .md 后缀过滤，不要按固定下标
    if (file) openNote(file)
    focusMainWindow()
  })
  app.whenReady().then(() => {
    const file = extractFileArg(process.argv)   // 首次启动路径
    if (file) openNote(file)
  })
}
```

**关键实现要点（每一条都有上面的查证支撑）**：
- **两个入口都要接**：冷启动读 `process.argv`，热启动靠 `second-instance`。Windows 没有 `open-file` 事件。
- **`second-instance` 的 argv 必须按后缀过滤**，不能按下标——文档明确说顺序可能变、会追加 Chromium 参数（`--original-process-start-time`）。
- **不要试图抢默认程序**。装完只出现在「打开方式」；要做"设为默认"的引导，用 `ms-settings:defaultapps` URI（微软文档推荐的唯一路径）。
- **考虑补一次 `SHChangeNotify`**：electron-builder 的安装器不调用它（只有卸载器调用），微软文档说否则关联可能到重启才生效。**推断**：可通过 `nsis.include` + `customInstall` 宏补一次 `UISTYLE`... 准确说是 `System::Call 'shell32::SHChangeNotify(...)'`。**这是可选的打磨项，不是必需项**——因为 Windows 首次双击时的主动弹窗会兜住这个体验。

**自动更新——配置量 6 行，代码量 2 行（官方原话："You need only 2 lines of code to make it work"）。**

配置：上面 `publish` 那 4 行 + `electron-updater` 作为**运行时依赖**（不是 devDependency）。

代码：
```js
const { autoUpdater } = require('electron-updater')
autoUpdater.checkForUpdatesAndNotify()
```
**不要调用 `setFeedURL`**——构建期写进包内的 `app-update.yml` 就是更新源。

**托管**：公开仓库 → GitHub Releases，`electron-builder --publish always` 一条命令上传安装包 + `latest.yml`。若国内访问不稳，把 `publish` 换成 `{ "provider": "generic", "url": "<对象存储公网前缀>" }`，手动或脚本上传两个文件即可——**切换成本是一行配置**。

### C. 各自的坑与代价（尤其是「未签名 + 自动更新 + 国内网络」）

按"最可能翻车"排序：

1. **「安装完就能双击打开」这个诉求本身在 Win10/11 上不成立。** 这是操作系统设计（`UCPD.sys` 拦截 + `UserChoice` 哈希保护），不是实现问题。**预期要调整成**："装完出现在「打开方式」+ 首次双击时 Windows 主动问一次"。**这是本次调研最需要纠正的一个预期。**

2. **per-user 安装 + `fileAssociations` 处于"代码允许、文档禁止、无人测试"的状态。** 那个"必须 perMachine"的 `throw` 已被删除（20.0.0 → 20.39.0 之间），但 TSDoc 注释没改。**风险**：a) 关联只对当前用户可见（单人场景无影响）；b) 这是未文档化路径，未来版本可能重新收紧。**缓解**：把"必须 perMachine"当作**已知的文档冲突**记录下来；如果哪天关联失效，第一个要查的就是这里。**这是本报告里最值得单独记一笔的发现。**

3. **安装器不调 `SHChangeNotify`（源码事实）。** 关联可能不立刻生效，需重启或重新登录。微软文档明确说这是必需调用。**代价**：首次安装后可能"看起来没生效"。**缓解**：靠 Windows 首次双击的主动弹窗兜底；或补自定义 NSIS 宏。

4. **v28 会把"未签名 + 无 publisherName"从 fail-open 改成 fail-closed。** 现在能用（`if (publisherName == null) return null`），但 master 注释明确写着 v28 会 fail-closed。**代价**：将来升级 electron-builder 大版本时，更新可能突然全部失败。**缓解**：现在就记录这个约束；升级前先确认 `win.publisherName` 的语义。

5. **SmartScreen 在"自动更新"路径上的行为未确证。** 首次安装会有"未知发布者"提示（可接受，一次性）。但 `electron-updater` 下载的安装包是否带 MOTW、是否会触发 SmartScreen——**我找不到一手来源**。**这是最大的技术空白。** 缓解：实际跑一次更新流程验证，不要假设。

6. **国内网络：GitHub 不是全站封锁，但"慢且不可靠"（已确证）。** Releases 资源下载域名在国内的具体可达性**未确证**。**代价**：如果下载超时，更新会静默失败（用户看不到"更新失败"，只是"永远没更新"）。**缓解**：a) 既然用户就是你自己，先实测；b) 不可靠就换 generic + 国内对象存储；c) **在应用内暴露"检查更新"的手动入口和失败日志**——静默失败是自动更新最危险的失败模式。

7. **差分更新依赖 `.blockmap` + HTTP range 支持。** `DifferentialDownloader` 在有 blockmap 时会做 range 请求。**推断**：部分静态托管/对象存储/CDN 对多重 range 请求支持不完整，可能退化为全量下载。**代价**：只是慢，不会坏。可用 `useMultipleRangeRequest: false` 规避。

8. **静默忽略的配置**：portable 打包含 `fileAssociations` → 配置被无声丢弃（源码提前 return，无警告）。**代价**：以为配了其实没配。**缓解**：知道这件事就不会踩。

### D. 有没有"现在不做、将来加会很痛"的部分

**有，共 5 项。前两项是真正的硬约束。**

1. **`appId` 一旦发布就不能改（硬约束）。** 官方 nsis 文档原文：
   > you "should not change appId once your application in use" (or the name if appId was unset), while "Application product name (title) or description can be safely changed."

   `appId` 决定：NSIS 卸载注册表键、**v27 起文件关联的 ProgID**（`ProgIdMaker` 的 namespace 来自 app GUID）、AUMID（任务栏/通知）。**改它 = 关联失效 + 卸载项变成孤儿 + 通知图标异常。** **必须在第一次发布前定死。**

2. **分发形态必须在第一次发布前定死（硬约束）。** 从 portable 换到 NSIS，或从 per-machine 换到 per-user，**不是改一行配置**：安装路径变了、注册表位置变了（HKLM ↔ HKCU）、更新机制从"不存在"变成"存在"、`app-update.yml` 里的 `isAdminRightsRequired` 变了。**用户（你）会经历一次"卸载旧的、装新的"的迁移。** 上面 A 的推荐就是"一次定对"。

3. **`publish` 配置在第一次发布时就固化进每个包（中等）。** 已查源码 `PublishManager.ts` 注释原文：
   > the inferred repository becomes the publish/update destination and, for auto-update-capable targets, is written verbatim into `app-update.yml` inside every shipped build as its **permanent update feed**

   即：**已经发出去的包，更新源是写死在里面的。** 换托管位置后，**旧版本无法自动迁移到新源**——它们只会继续查旧地址。**推断**：对单人场景，换源时手动装一次新版即可，代价可控；但要知道这个约束存在。（源码也警告过：从 CI 环境或 `.git/config` 推断出的仓库会打 `log.warn`，因为它会成为"永久更新源"。）

4. **签名决策（中等，有时间窗口）。** 见 C-4：v28 会把缺 `publisherName` 改成 fail-closed。**现在不签名可以，但要记录这个约束**。如果将来想签名：OV 证书需要"信誉积累（days-weeks）"，EV 证书"即时信任但密钥绑硬件 dongle/HSM"。**代价**：签名证书有年费和流程成本。**建议**：单人场景先用不签名 + 接受首次 SmartScreen 提示；**但把"未签名"当成一个有截止日期的状态，而不是永久状态**。

5. **`fileAssociations` 的 ProgID 在 v26 → v27 之间会变（低，但要知道）。** v27 起 ProgID 从 `name`/`ext` 原值改为自动生成的 `<program>.<component>`。官方 v27 迁移文档原文：
   > On upgrade, an installer built with v27 registers the new ProgID. One-click installers run the previous version's uninstaller during the upgrade, which removes the old-format entry; with assisted installers that do not uninstall the prior version first, **the old ProgID may remain in the registry until that version is removed.**

   **你现在还没发布，所以不受影响。** 但**建议一开始就用 `oneClick: true`**（默认值）——oneClick 升级时会跑旧版卸载器清理旧 ProgID，assisted 不会。这是"选对默认值就免费获得的正确性"。

---

## 附：本次调研中明确**未确证**的项

1. **`electron-updater` 下载的安装包是否附加 MOTW，以及是否触发 SmartScreen**——无一手来源。这是最大的空白。
2. **GitHub Releases 资源下载域名在国内的具体可达性**——只有"GitHub 整体慢且不可靠"的结论，没有针对 releases/objects 子域的权威数据。
3. **Windows 11 是否强制"逐个文件类型设置默认应用"**——只有二手来源（PCMag / Windows Central / ElevenForum）一致报告；微软开发者文档只确证了"不能程序化设置"，未确证"必须逐个设"。
4. **坚果云 WebDAV 作为 electron-updater generic 端点的可行性**——electron-updater 无 WebDAV provider；用公开分享链接当静态端点属推测，无人验证。
5. **per-user 安装 + `fileAssociations` 是否被维护者有意支持**——那个 `throw` 被删除了，但 TSDoc 未改、无测试覆盖、无发布说明。**删除的原因未找到公开记录。**
6. **`SHChangeNotify` 缺失在实践中的具体影响范围**——微软文档说"可能到重启才被识别"，但 electron-builder 用户实际遇到这个问题的报告，我没有找到。

## 附：核心引用

**Electron**
- [app.setAsDefaultProtocolClient / open-file / second-instance](https://www.electronjs.org/docs/latest/api/app)（源码 `docs/api/app.md`）

**electron-builder**
- [NSIS target 文档](https://www.electron.build/docs/nsis) · [Windows targets](https://www.electron.build/docs/win) · [Target Selection Guide](https://www.electron.build/docs/targets) · [Auto Update](https://www.electron.build/docs/features/auto-update) · [Code Signing](https://www.electron.build/docs/features/code-signing/) · [Publishing](https://www.electron.build/docs/publish)
- 源码：`packages/app-builder-lib/src/options/FileAssociation.ts`、`src/options/CommonWindowsInstallerConfiguration.ts`、`src/options/winOptions.ts`、`src/targets/win/nsis/NsisTarget.ts`、`src/targets/win/nsis/progId.ts`、`templates/nsis/include/FileAssociation.nsh`、`templates/nsis/multiUser.nsh`、`templates/nsis/installer.nsi`、`templates/nsis/portable.nsi`
- 源码：`packages/electron-updater/src/NsisUpdater.ts`、`src/AppUpdater.ts`、`src/providers/GitHubProvider.ts`、`src/providers/PrivateGitHubProvider.ts`、`src/providers/GenericProvider.ts`、`src/providerFactory.ts`、`src/windowsExecutableCodeSignatureVerifier.ts`
- issue：[#772](https://github.com/electron-userland/electron-builder/issues/772)（那条 perMachine 报错的由来）· [#1590](https://github.com/electron-userland/electron-builder/issues/1590)（要求放宽）· [#7807](https://github.com/electron-userland/electron-builder/issues/7807)（会话结束损坏更新）
- 提交 [`96c8ed9`](https://github.com/electron-userland/electron-builder/commit/96c8ed97157f89c789221191b46757e41cfbf961)（加入 perMachine 强制）
- [v27 Breaking Changes](https://www.electron.build/docs/migration/v27-breaking-changes)（ProgID 变更）

**微软**
- [Windows app defaults platform](https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/default-apps-platform)（UCPD.sys / 禁止程序化设默认）**← 本报告最关键的一手来源**
- [Default Programs](https://learn.microsoft.com/en-us/windows/win32/shell/default-programs) · [File Types](https://learn.microsoft.com/en-us/windows/win32/shell/fa-file-types) · [How File Associations Work](https://learn.microsoft.com/en-us/windows/win32/shell/fa-how-work) · [Include an App in the Open With Dialog](https://learn.microsoft.com/en-us/windows/win32/shell/how-to-include-an-application-on-the-open-with-dialog-box) · [ProgID Key](https://learn.microsoft.com/en-us/windows/win32/com/-progid--key)
- [Microsoft Defender SmartScreen overview](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) · [SmartScreen settings](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/available-settings)

**GitHub**
- [About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)（2 GiB / 1000 assets / 无带宽限制）

**其他**
- [NSIS Chapter 4（SHELL_CONTEXT 语义）](https://nsis.sourceforge.io/Docs/Chapter4.html)
- [Censorship of GitHub](https://en.wikipedia.org/wiki/Censorship_of_GitHub)
- [update-electron-app](https://github.com/electron/update-electron-app) · [Electron Forge auto-update](https://www.electronforge.io/advanced/auto-update) · [Forge makers](https://www.electronforge.io/config/makers)
