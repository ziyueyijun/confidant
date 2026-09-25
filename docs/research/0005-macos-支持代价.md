# macOS 支持的完整代价

> 本文件回答一个问题：**知己笔记要支持 macOS，代价是什么。** 供「Windows 是一等公民、macOS 顺手能跑就行」这个既有决策的修订判断。
>
> 调研日期：2026-09-25。方法说明同 `0002`：**已实测** = 本次在本机运行代码或取一手原文得到，可复现；**源码级** = 读项目源码原文；**推断** = 本报告的判断，非一手来源。凡公开来源中确实不存在的，列入文末「未确证事项」，**不要在未重新调研前当成事实引用**。
>
> 前提事实基座见 `0001-技术事实基础.md`（Electron 而非 Tauri、CodeMirror 6 而非 ProseMirror、中文检索方案）、`0002-webdav-同步事实.md`、`0004-windows-集成与更新.md`。本文件不重复那些内容。
>
> **版本坐标（已核实）**：Electron 稳定线 **44.4.5**（2026-09-23）；electron-builder **26.16.1** 在 `v26` tag（2026-09-07），**26.15.3** 在 `latest` tag（2026-06-09），`next` 是 27.0.0-alpha；macOS 当前版本 **27 "Golden Gate"**（2026-09-14 发布，**仅 Apple Silicon**），macOS 26 是 **Tahoe**（2025-09-15），macOS 15 是 **Sequoia**（2024-09-16）。

---

## 0. 一句话结论

**「能不能分发未签名应用」这个问题在 2026 年有两个不同的答案，取决于「给谁」：**

- **给自己（档 1）**：能。**而且几乎零成本** —— 本地构建的 `.app` 不带 quarantine 属性，双击即可运行，连 Gatekeeper 都不会拦。**但需要一台 Mac**：electron-builder 源码里有一条硬检查，在 Windows 上构建 macOS target 会直接抛 `InvalidConfigurationError`。
- **给别人（档 2/3）**：**未签名能跑，但「能跑」的方式已经变了。** Apple 在 macOS Sequoia（15）**移除了 Control-click 右键绕过的路径**，用户必须走 `系统设置 → 隐私与安全性 → 仍要打开`（4 步 + 输密码，且「仍要打开」按钮**只在尝试打开后的一小时内有效**）。这条路在 2026 年（macOS 26/27）**仍然存在**，没有被进一步收紧。
- **自动更新是硬约束，与上面的判断无关**：**未签名的 macOS 应用根本无法自动更新。** 这不是 electron-builder 的限制，是 `Squirrel.Mac` 的：源码在拿不到代码签名时**在 release 构建里直接 `@throw`**，不是降级。Electron 官方文档、electron-builder 官方文档、Electron code-signing 教程三处独立确认。**「不做签名」这个决定直接意味着「macOS 上没有自动更新」。**

**一条对中文应用最相关的、且与任务假设相反的结论**：**NFD 归一化那条地雷对中文不存在。** 已实测：CJK 基本区 20992 字 + 扩展 A 6592 字 + 兼容表意 512 字，**NFC 与 NFD 字节完全相同，零差异**。而且当前 macOS 的 APFS **保留**文件的归一化形式（不做 NFD 重写），Apple 官方原文：`APFS ... preserves both case and normalization of the filename on disk in all variants`。真正的地雷在别处——见 §C。

---

## 一、签名与 Gatekeeper

### 1.1 未签名的 macOS 应用能否运行？—— 能，但绕过的路径在 Sequoia 变了

**事实链一：Apple 官方确认 Control-click 绕过已被移除。** [Apple Developer News, 2024-08-06](https://developer.apple.com/news/?id=saqachfa) 原文：

> In macOS Sequoia, users will no longer be able to Control-click to override Gatekeeper when opening software that isn't signed correctly or notarized. They'll need to visit System Settings > Privacy & Security to review security information for software before allowing it to run.

**事实链二：替代路径在 macOS 27 上仍然存在，且是 4 步 + 密码。** [Apple 官方 Mac 用户指南「Open a Mac app from an unknown developer」](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac)（版本选择器含 macOS 27 Golden Gate / 26 Tahoe / 15 Sequoia）。原文步骤：

1. `choose Apple menu > System Settings, then click Privacy & Security in the sidebar`
2. `Go to Security, then click Open.`
3. `Click Open Anyway.` —— **`This button is available for about an hour after you try to open the app.`**
4. `Enter your login password, then click OK.`

之后 `The app is saved as an exception to your security settings`，双击即可，与授权过的应用无异。

**同一页的官方风险文案**（用户会看到的话术）：

> If you try to open an app that isn't registered with Apple by a known developer, you get a warning dialog.
> The app has not been reviewed, and macOS can't check whether the app has been modified or broken since it was released.
> **Overriding security settings to open an app is the most common way that a Mac gets infected with malware.**

**事实链三：Apple 官方支持页确认「仍要打开」是当前方法。** [support.apple.com/en-us/102445](https://support.apple.com/en-us/102445)（页面标注 `May 27, 2026`）原文：

> Open System Settings. Click Privacy & Security, scroll down, and click the Open Anyway button to confirm your intent to open or install the app.

**这条页面已不再提及右键打开**——它只描述 System Settings 路径。

**结论（区分事实与推断）**：

- **事实**：绕过路径在 2026 年（macOS 26/27）仍然存在。Apple 在 Sequoia 移除的是**右键/Control-click**，不是「仍要打开」。
- **事实**：这条路径的成本是「4 步 + 输一次密码 + 一小时的时效窗口」。**不是一次点击。**
- **事实**：对**自己**（档 1）这条路径根本用不上——本地构建的 `.app` 不带 `com.apple.quarantine` 扩展属性，Gatekeeper 不介入。electron-builder 官方文档原文（[code-signing-mac.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/code-signing/code-signing-mac.md)）：`On Apple Silicon, unsigned apps can still be run locally by approving them in System Settings → Privacy & Security.`
- **推断**：把「未签名应用能否分发」写成「能，但用户要过一个 4 步 + 密码的关卡，且关卡文案在劝退」是准确的。对**陌生用户**（档 3）这是实质性的劝退；对**自己第二台机器**（档 2）可接受。

**一处需要纠正的常见误解**：`未签名 = 应用会崩溃` 是错的。会崩溃的是 **ad-hoc 签名 + hardenedRuntime 默认开启** 这个组合——ad-hoc 签名没有 Team ID，而 Electron 自带的 framework 带 Apple 的 Team ID，library validation 会拒绝加载。这是 [electron-builder#9396](https://github.com/electron-userland/electron-builder/issues/9396) 的根因，维护者 mmaietta 的原话：

> When electron-builder falls back to ad-hoc signing (using `-` identity) for arm64 ...

崩溃报告里的关键行：

```
Reason: tried: '.../Electron Framework.framework/Versions/A/Electron Framework'
(code signature in <4C4C449B-...> '...' not valid for use in process:
mapping process and mapped file (non-platform) have different Team IDs)
```

**这条已修复**（[PR #9822](https://github.com/electron-userland/electron-builder/pull/9822)，2026-06-02 合入 master）。**已实测定位到进入稳定线的版本：`26.15.0`（2026-06-05 发布）**——我逐版本下载 `app-builder-lib` 的 npm 包核实：`26.14.0` 及更早含 `fallBackToAdhoc` 变量（即自动回退），`26.15.0` 起该变量被删除。**注意 `latest` tag 是 26.15.3，已含此修复；`v26` tag 的 26.16.1 也含。** 修复内容（PR 描述原文）：

> **Removed automatic ad-hoc fallback**: electron-builder previously signed arm64/universal macOS apps with an ad-hoc identity (`-`) when no signing certificate was found. This automatic fallback, combined with the default `hardenedRuntime: true`, caused macOS to reject the app at launch ... Behavior now aligns with electron-forge: **when no valid certificate is found, signing is skipped for all architectures.** Ad-hoc signing is still supported but must be opted into explicitly by setting `mac.identity: "-"`.

**即：现在（26.15.0 起）不配置证书 = 完全不签名 = 能跑（但要过 Gatekeeper）。** 在 26.15.0 之前的版本上不配置证书会触发那个 ad-hoc 崩溃——**这是个「版本要够新」的坑，不是「不签名就不行」的坑。**

**已实测的附带细节（源码级，26.16.1 的 `out/codeSign/macCodeSign.js`）**：`reportError` 在无证书时**默认只 warn 不 throw**，**只有 `forceCodeSigning: true` 或 MAS target 才抛错**。源码原文：

```js
const skipMessage = "skipped macOS application code signing";
if (isMas || isForceCodeSigning) {
    throw new Error(...);
} else {
    log.warn(logFields, skipMessage);
}
```

**推断**：**不要设 `forceCodeSigning: true`**（除非确实想强制签名）——它会把这个「优雅跳过」变成构建失败。

**一条历史考古（已实测，说明这个坑存在了很久）**：`26.12.0` 的源码里那段逻辑是：

```js
const fallBackToAdhoc = (arch === Arch.arm64 || arch === Arch.universal) && !this.forceCodeSigning;
...
else if (noIdentity && fallBackToAdhoc) {
    log.warn(null, "falling back to ad-hoc signature for macOS application code signing");
    identity = new Identity("-", undefined);
}
```

**即「arm64/universal 在没有证书时自动 ad-hoc 签名」是明确写出来的行为**，注释里还留着 `arm64 requires signing, but identity is set to null and signing is being skipped` 的警告文案。**这印证了 #9396 的根因分析**，也说明「为什么以前的经验说未签名 arm64 app 也能跑」——因为 electron-builder 偷偷帮你签了 ad-hoc，而在 26.15.0 之前这个 ad-hoc 又与 hardenedRuntime 冲突。

### 1.2 Apple Developer Program 的费用与要求

**费用**（[developer.apple.com/programs/whats-included/](https://developer.apple.com/programs/whats-included/)，已核实）：

> The Apple Developer Program is **99 USD** per membership year, or in local currency where available.

中文版页面（[developer.apple.com/cn/support/enrollment/](https://developer.apple.com/cn/support/enrollment/)）原文：

> Apple Developer Program 的年费为 **99 美元**，Apple Developer Enterprise Program 的年费为 299 美元 (如果适用，则以当地货币计费)。价格可能因区域而异，并在注册流程中以当地货币列出。

**推断**：99 USD 按 2026 年汇率约 **700 元人民币**量级。Apple 未在公开页面给出中国区人民币定价，只说「以当地货币计费」——**具体人民币金额未确证**，需走到注册流程才可见。

**是否必须有 / 个人能否申请**（[developer.apple.com/support/enrollment/](https://developer.apple.com/support/enrollment/)）：

- **个人可以申请，且是唯一可行的路径**。原文：`If you're an individual or sole proprietor/single-person business, your personal legal name will be listed as the seller on the App Store. Do not enter an alias, nickname, or company name as your first or last name, as entering your legal name incorrectly will cause a delay in the approval of your enrollment.`
- 前置条件：`you'll need an Apple Account with two-factor authentication turned on and be the legal age of majority in your region.`
- **组织需要 D-U-N-S 号 + 法人实体 + 可绑定合同的法律权限 + 工作邮箱 + 网站**。原文：`We don't accept DBAs, fictitious businesses, trade names, or branches.` —— **单人开发者不要走组织路径**，D-U-N-S 是纯增负担。
- **不注册也能做的**（原文）：`No. You can install apps on your personal device with Xcode. You'll only need to enroll if you'd like to distribute apps, access beta software, and integrate with capabilities such as Siri, Apple Pay, and iCloud.` —— **这条直接支撑档 1：自己用不需要年费。**

**周期**（原文）：

> After your purchase has been processed, you'll receive a confirmation email. ... **If you haven't received a membership confirmation within 24 hours of your purchase, contact us.**

**推断**：Apple 只承诺「24 小时内确认」；实际审批时长公开文档未给。**从申请到能签名的确切周期未确证。**

**Developer ID 证书 vs App Store 证书**（[electron-builder code-signing 文档](https://www.electron.build/docs/features/code-signing/) 与 [code-signing-mac.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/code-signing/code-signing-mac.md)）：

| 证书 | 用途 | 是否需要公证 |
|---|---|---|
| **`Developer ID Application`** | **直连分发（DMG / ZIP / PKG）—— 本项目要的就是这个** | 是（10.15+） |
| `Developer ID Installer` | `pkg` target 的安装器签名 | 是 |
| `Apple Distribution` + `3rd Party Mac Developer Installer` | Mac App Store（`mas` target） | 否（App Store 代为处理） |
| `Apple Development` / `Mac Developer` | 本地 MAS 测试（`mas-dev`） | 否 |

electron-builder 文档原文：`Third-party certificates cannot be used to sign macOS apps for Gatekeeper.`

**本项目只需要 `Developer ID Application` 一张**（除非出 `.pkg`）。

### 1.3 公证（Notarization）：2026 年是否强制？

**强制。但只对「已用 Developer ID 签名」的软件强制。** [Apple 官方公证文档](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) 原文（已核实）：

> Beginning in macOS 10.14.5, software signed with a new Developer ID certificate and all new or updated kernel extensions must be notarized to run. **Beginning in macOS 10.15, all software built after June 1, 2019, and distributed with Developer ID must be notarized.** However, you aren't required to notarize software that you distribute through the Mac App Store because the App Store submission process already includes a review.

electron-builder 的表述更直接（[code-signing 文档](https://www.electron.build/docs/features/code-signing/)）：

> On macOS 10.15+, notarization is additionally required for apps distributed outside the Mac App Store.
> 未公证的已签名构建：`will be blocked by Gatekeeper unless the user explicitly overrides it.`

**即：公证不改变「能不能跑」，改变的是「要不要用户手动放行」。** 已签名 + 未公证 = 仍然会被 Gatekeeper 拦，用户仍需走 §1.1 的 4 步。**所以「签名但不公证」在用户体验上等于「没签名」。**

**公证的流程复杂度 —— 对 electron-builder 用户接近零。**

- **工具**：`notarytool` + `stapler`（随 Xcode 提供）。Apple 原文：`The notarytool and stapler command-line tools (included with Xcode) allow you to upload your software to the Apple notary service, and to staple the resulting ticket to your executable.`
- **`altool` 已废弃**：原文 `Starting November 1, 2023, the Apple notary service no longer accepts uploads from altool or Xcode 13 or earlier.`
- **前置条件**：**hardened runtime 必须开启**（Apple 原文：`When you enable the extra security enforced by the hardened runtime, as notarization requires, this impacts both your app and any app that your app hosts`）。electron-builder 的 `mac.sign.hardenedRuntime` **默认就是 `true`**（非 MAS），所以这一步免费。
- **electron-builder 的集成**（[macOptions.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/options/macOptions.ts) 源码级）：只需设置三组环境变量之一：
  1. `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`（**官方推荐**，原文 `For security reasons it is recommended to use the first option`）
  2. `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`
  3. `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`
- **耗时**（Apple 原文）：`When the upload is complete, the notary service begins the scanning process, which usually takes less than an hour.`

**结论**：**公证的增量成本主要是「年费」和「多三个环境变量」，不是「多一套工具链」。** 对一个已经签名的 electron-builder 项目，公证是配置级改动。

### 1.4 签名对自动更新的影响 —— **这是关键，答案是「强制」**

**三个独立的一手来源，结论一致：**

**(1) Electron 官方 autoUpdater 文档**（[docs/api/auto-updater.md](https://github.com/electron/electron/blob/main/docs/api/auto-updater.md)，源码级原文）：

> On macOS, the `autoUpdater` module is built upon Squirrel.Mac ...
>
> > [!IMPORTANT]
> > **Your application must be signed for automatic updates on macOS. This is a requirement of `Squirrel.Mac`.**

**(2) Electron 官方 code-signing 教程**（[docs/tutorial/code-signing.md](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md)，源码级原文）：

> ## macOS APIs that require code signing
>
> A number of macOS APIs exposed by Electron rely on system frameworks (like Keychain Access and `Squirrel.Mac`) that only behave correctly once your app is code signed. When testing these APIs, keep in mind that an **unsigned or ad-hoc signed app may behave inconsistently**, and issues that look like Electron bugs are often resolved by properly signing (and notarizing) your app:
>
> - `autoUpdater` - **`Squirrel.Mac` requires the app to be signed for automatic updates to work at all.**

**(3) electron-builder 官方 auto-update 文档**（[electron.build/docs/features/auto-update](https://www.electron.build/docs/features/auto-update)）：

> **macOS application must be signed in order for auto updating to work.**

**源码级确认（不是文档口径，是代码行为）：** `Squirrel.Mac` 的 `SQRLUpdater.m` 第 266 行：

```objc
_signature = [SQRLCodeSignature currentApplicationSignature:&error];
if (_signature == nil) {
#if DEBUG
    NSLog(@"Could not get code signature for running application, application updates are disabled: %@", error);
    return nil;
#else
    NSDictionary *exceptionInfo = @{ NSUnderlyingErrorKey: error };
    @throw [NSException exceptionWithName:NSInternalInconsistencyException
                                   reason:@"Could not get code signature for running application"
                                 userInfo:exceptionInfo];
#endif
}
```

**注意这段的分支**：Debug 构建下只是打印日志并**禁用更新**（返回 nil）；**Release 构建下直接抛异常**。即：**未签名的 release 应用在 macOS 上不会「静默不更新」，它会抛异常。** `currentApplicationSignature` 走的是 `SecCodeCopyDesignatedRequirement`——未签名或 ad-hoc 签名（`SecCodeCopyDesignatedRequirement` 对 ad-hoc 会返回错误）都拿不到有效的 designated requirement。

**旁证（历史 issue）**：[electron-builder#2399](https://github.com/electron-userland/electron-builder/issues/2399) 里维护者 develar 的原话：

> **Squirrel.Mac requires signed application, sorry. For now electron-builder cannot help you here, you have to sign your application if you want to use auto-updates on macOS.**

该 issue 的完整故障链（用户视角）：

```
Error: Code signature at URL file:///.../ShipIt/update.mo6UFtO/desktop-presenter.app/
       did not pass validation: code object is not signed at all
Proxy server for native Squirrel.Mac is closed
```

**结论（事实层面）**：**未签名 → macOS 上无法自动更新。这是硬约束，无 workaround。**

**一条重要的连带事实**：即使签了名，**只要 bundle 里有任何一个未签名的文件，Squirrel.Mac 就会拒绝**。issue #2399 里反复出现的解法是把文件从 `extraFiles` 移到 `extraResources`（`extraFiles` 的路径不会被 electron-builder 签名，`extraResources` 会）。原文（贡献者 kaitmore）：

> This error will happen if ANY files are unsigned. I resolved it by copying the file to the build using the `extraResources` field instead of `postPackage`. Now this extra file is signed by electron-builder and I don't have to do anything manually.

**这条对本项目的含义**：`assets/`（附件）与 `.confidant/`（配置）如果用 `extraFiles` 打进包，就会破坏签名。**推断**：本项目的用户数据在库目录里、不在 app bundle 里，所以不受影响；但**如果将来要捆绑任何默认资源文件，必须用 `extraResources` 而不是 `extraFiles`。** 这是「现在定对、以后省事」的一条。

---

## 二、打包与分发

### 2.1 构建产物的形态

**electron-builder 在 macOS 上的默认输出是 `zip` + `dmg`，且两者都要出。** 官方 [mac 文档](https://www.electron.build/docs/mac) 原文：

> The default targets are `zip` and `dmg` (**both are required for Squirrel.Mac auto-update**).

同一页的 target 表：

| Target | Best For | Signed? | Notarized? |
|---|---|---|---|
| `dmg` | Standard consumer distribution | Yes | Yes |
| `zip` | Update servers (electron-updater), minimal package | Yes | Yes |
| `pkg` | System-level installs, kernel extensions, launch daemons | Yes | Yes |
| `mas` | Mac App Store distribution | Yes (Mac App Distribution) | No (MAS handles it) |
| `mas-dev` | Local testing of MAS builds | Yes | No |
| `7z`, `tar.*` | Archive formats, custom CDN distribution | Optional | Optional |
| `dir` | Development/debugging — unpacked app | **No** | **No** |

**关键的一条**（[auto-update 文档](https://www.electron.build/docs/features/auto-update) 原文）：

> zip target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created — which causes `autoUpdater` error.

以及同一页：`Disabling zip will break auto update in dmg packages.`

**未签名的 `.dmg` 用户如何安装**：`.dmg` 挂载后是「把 app 拖进 Applications」的常规操作，**但首次运行时会撞上 §1.1 的 Gatekeeper 流程**（4 步 + 密码）。**注意一个容易被误判的现象**：如果 `.dmg` 是**未签名**的，用户看到的可能是「应用已损坏，请移到废纸篓」而不是「来自未识别的开发者」——因为 Gatekeeper 在挂载阶段就会校验 DMG 自身的签名。**这条我未找到 2026 年的一手证据，标为推断**，但它与 §2.2 的 `hdiutil` 事实一致。

### 2.2 能否在 Windows 上构建 macOS 产物？—— **不能，且源码里有硬检查**

**这是本次调研里对单人开发最重大的一条。**

**源码级证据**（[packages/app-builder-lib/src/packager.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/packager.ts) 第 523-525 行，master）：

```ts
if (platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName) {
  throw new InvalidConfigurationError("Build for macOS is supported only on macOS, please see https://electron.build/docs/features/multi-platform-build")
}
```

**注意这条检查的精确边界**：它只挡 `Platform.WINDOWS`（即 `process.platform === "win32"`），**不挡 Linux**。**推断**：Linux 上理论上能走到「打包 `.app` 目录 + 出 `.zip`」这一步（因为 `zip` target 不需要 macOS 特有工具），但**签名、公证、`.dmg` 都不行**——`.dmg` 走 `hdiutil`（[dmg-builder/src/dmg.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/dmg-builder/src/dmg.ts) 第 10 行 `import { hdiUtil } from "./hdiuil.js"`），而 `hdiutil` 是 macOS 独有的二进制。**这条推断未经实测。**

**官方文档的表述**（[multi-platform-build](https://www.electron.build/docs/features/multi-platform-build) 原文）：

> **Don't expect that you can build an app for all platforms on one platform.**
> - If your app has native dependencies, they can only be compiled on the target platform unless prebuild is used. Most node modules don't provide prebuilt binaries.
> - **macOS Code Signing works only on macOS. [Cannot be fixed](http://stackoverflow.com/a/12156576).**

以及：

> All required system dependencies (except rpm) are downloaded automatically on demand on macOS 10.12+.
> Docker: `Build Linux or Windows targets on any platform using Docker.` —— **Docker 只覆盖 Linux 与 Windows，不覆盖 macOS。**

**本项目的特殊之处（比一般项目更严重）**：本项目依赖 `better-sqlite3`（原生模块）。文档原文：

> You cannot build for Windows using Docker if your app has native dependencies that don't use prebuild.

**但这里有一条 2026 年的好消息 —— 见 §4.1。**

**结论**：

- **事实**：在 Windows 上构建 macOS 产物被源码硬阻断，报错文案是 `Build for macOS is supported only on macOS`。
- **事实**：macOS 签名只能在 macOS 上做，官方标注 `Cannot be fixed`。
- **推断**：Linux 上可能能出一部分产物（zip），但没有签名、没有 dmg、没有公证——**对「自用可分发」和「给别人用」两档都是无用的**。
- **推断**：**所以「支持 macOS」这个决策，等价于「需要一台 Mac 或一个 macOS CI runner」。这是本次调研里权重最高的一条成本。**

### 2.3 electron-builder 的 macOS 配置项

**v27 起，所有 macOS 签名选项移入单一的 `mac.sign` 对象**（[v27 Breaking Changes](https://github.com/electron-userland/electron-builder/blob/master/website/docs/migration/v27-breaking-changes.md)）。迁移表原文：`identity`/`entitlements`/`hardenedRuntime`/… → `mac.sign.*`；`signIgnore` → `sign.ignore`。

| 选项 | 是什么 | 未签名时怎么办 |
|---|---|---|
| **`mac.sign.identity`** | 签名证书名 / SHA-1 | **`null` = 完全不签名**；`"-"` = ad-hoc；不设置 = 自动在 keychain 找，找不到就跳过（**26.15.0+**） |
| **`mac.sign.hardenedRuntime`** | 启用 hardened runtime | 默认 `true`（非 MAS）。**未签名时必须一起关掉**——官方原文：`If you disable code signing, you should also disable Hardened Runtime`，因为「unsigned plus runtime **may prevent the app from launching**」 |
| **`mac.sign.entitlements`** | 主 app 的 entitlements 文件 | 默认用 bundled 模板，只给 `com.apple.security.cs.allow-jit`（源码级核实，见下） |
| **`mac.sign.entitlementsInherit`** | 嵌套二进制的 entitlements | 默认用 inherit 模板 |
| **`mac.sign.type`** | `distribution` vs `development` | 只影响 MAS 路径。**开发证书签的应用在其他机器上会被 Gatekeeper 拦**（源码注释原文：`Development-signed apps are blocked by Gatekeeper on other machines`） |
| **`notarize`** | 是否启用 `@electron/notarize` 集成 | 需要环境变量才激活（见 §1.3）。**注意这个选项的语义是「是否禁用」**——源码注释原文：`Whether to disable electron-builder's @electron/notarize integration` |
| **`gatekeeperAssess`** | —— | **已被彻底移除。** 源码注释原文：`@electron/osx-sign 2.x dropped the spctl --assess step, so there is no sign.gatekeeperAssess to migrate to — ElectronSignOptions omits it and the schema rejects it.`（[legacyOptions.ts](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/util/config/legacyOptions.ts)） |

**默认 entitlements 的实际内容（源码级，`packages/app-builder-lib/templates/entitlements.mac.plist`）**：

```xml
<key>com.apple.security.cs.allow-jit</key>
<true/>
```

模板里的注释原文：

> V8 compiles JavaScript at runtime, so the main app needs the JIT exception under the hardened runtime. Chromium grants nothing else to the browser process ...
>
> `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.cs.disable-library-validation` are deliberately NOT granted here — modern Electron does not need them in the main process, and both materially weaken the hardened runtime.

**ad-hoc 模板（`entitlements.mac.adhoc.plist`，源码级）**——这条解释了 §1.1 那个崩溃：

```xml
<key>com.apple.security.cs.allow-jit</key>
<true/>
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
```

注释原文：

> Ad-hoc signatures carry no Team ID, so library validation rejects every framework and native module in the bundle and the app fails to launch. Disabling it is required for such builds to run at all — which is why this template exists separately from `entitlements.mac.plist` and is never used for builds signed with a real identity.

**未签名时「必须关掉」的清单**：

1. `mac.sign.identity: null`（或 `CSC_IDENTITY_AUTO_DISCOVERY=false`）—— 确保不会误触发 ad-hoc
2. `mac.sign.hardenedRuntime: false` —— 官方明说未签名 + runtime 可能起不来

**注意**：v27 起 `mac.sign.hardenedRuntime` 的默认值仍然是 `true`，所以**如果只设 `identity: null` 而不关 hardenedRuntime，可能踩坑**。electron-builder **只在显式设 `identity: "-"` 时才发 ad-hoc 警告**（源码级：`if (qualifier === "-")` 分支内）——**`identity: null` 不会警告，只会 log.info 一条 `identity explicitly is set to null`**。**推断**：这是个需要显式写全两行的地方，不能指望工具提醒。

### 2.4 GitHub Actions 的 macOS runner

**public 仓库免费 —— 已确证。** [GitHub 官方计费文档](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) 原文：

> The use of standard GitHub-hosted runners is free: In public repositories / For GitHub Pages / For Dependabot.

**macOS runner 的价格 —— 已确证，是最贵的一档。** 同一页的费率表（USD/分钟）：

| Runner | SKU | 单价 |
|---|---|---|
| Linux 1-core (x64) | `actions_linux_slim` | $0.002 |
| Linux 2-core (x64) | `actions_linux` | $0.006 |
| Linux 2-core (arm64) | `actions_linux_arm` | $0.005 |
| Windows 2-core (x64) | `actions_windows` | $0.010 |
| **macOS 3-core or 4-core (M1 or Intel)** | `actions_macos` | **$0.062** |

**macOS 是 Linux 的 10.3 倍、Windows 的 6.2 倍。** 注意文档**不区分** M1 与 Intel 的价格——同一行。

**规格**（[GitHub-hosted runners 文档](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)）：

| OS | CPU | RAM | SSD | 架构 | 标签 |
|---|---|---|---|---|---|
| macOS | 4 | 14 GB | 14 GB | Intel | `macos-15-intel`, `macos-26-intel` |
| macOS | **3 (M1)** | **7 GB** | 14 GB | **arm64** | **`macos-latest`**, `macos-14`, `macos-26-arm64` |

**注意**：`macos-latest` 是 **arm64 M1 / 3-core / 7GB RAM**。**7GB RAM 对 Electron 打包是个需要注意的约束**——推断上够用，但比 Linux runner 的 16GB 少。

**构建一次大概多久 —— 未确证。** 我找到了 [electron-builder#9638](https://github.com/electron-userland/electron-builder/issues/9638)（`Slow Signing process in github actions on macos-latest`），但未能取得其中的量化数字。**公开来源中没有 electron-builder 在 macOS runner 上的权威构建时长基准。** 不过有一个可参照的量级事实：public 仓库免费，所以**对档 2/3 而言 CI 成本是 0（前提是仓库 public）**；private 仓库按 $0.062/分钟计，一次 10 分钟的构建约 $0.62。

**一条对本项目不利的约束**：**仓库现在是私有的吗？** 从 git status 看当前在 `master` 分支且工作区只有未跟踪文件，无法判断远程仓库可见性。**如果仓库要 private，macOS CI 就要按分钟付费**——不过一年几十次发布的量级，成本仍在个位数美元。

### 2.5 Apple Silicon vs Intel：是否需要出两个架构？

**事实：macOS 26 是最后一个支持 Intel 的版本，macOS 27 只支持 Apple Silicon。** [Apple Developer News](https://developer.apple.com/news/) 原文：

> **macOS 26 is the final release supporting Intel Mac computers and Rosetta — macOS 27 will be Apple silicon only.** To limit your app to Macs with Apple silicon, set your Xcode build architecture to arm64 only, then rebuild and resubmit.
>
> macOS 26.4 or later: Users may receive a system notification when launching apps that rely on Rosetta, alerting them to update to an Apple silicon native version.
> macOS 27: Final release to support Rosetta — Intel-only apps will no longer run on Mac computers with Apple silicon after this update.

**这条极大地简化了架构决策。** 已核实的时间线（[Wikipedia: MacOS version history](https://en.wikipedia.org/wiki/MacOS_version_history)）：

| 版本 | 名称 | 发布 | Intel 支持 |
|---|---|---|---|
| macOS 15 | Sequoia | 2024-09-16 | 是 |
| macOS 26 | Tahoe | 2025-09-15 | 是（**最后一个**） |
| **macOS 27** | **Golden Gate** | **2026-09-14** | **否，仅 Apple Silicon** |

**三个选项的代价**（[architecture 文档](https://github.com/electron-userland/electron-builder/blob/master/website/docs/architecture.md)）：

| 方案 | 命令 | 优点 | 缺点 |
|---|---|---|---|
| 只出 `arm64` | `electron-builder --mac --arm64` | 体积最小，构建最快 | **Intel Mac 用户（macOS 26 及更早）完全用不了** |
| 只出 `x64` | `--mac --x64` | 兼容老机器 | Apple Silicon 上要跑 Rosetta（且 macOS 27 起 Intel-only app **不再能运行**） |
| **`universal`** | `--mac --universal` | 一份产物覆盖所有 | **约 2× 体积**，构建要下载两份 Electron 并 `lipo` 合并 |

官方对 universal 的表述：`A universal binary contains both x64 and arm64 slices in a single executable. It runs natively on Intel Macs and Apple Silicon without Rosetta 2 translation.`

**native module 与 universal 的冲突（直接命中本项目）**：universal 要合并两份 ASAR，而 `better-sqlite3` 的 `.node` 是架构相关的。官方给了两个逃生口：

```yaml
mac:
  universal:
    mergeASARs: true          # 默认 true
    singleArchFiles: ""       # 不合并的 arch 专属文件
    x64ArchFiles: ""          # 只在 x64 存在的文件
```

以及一条明确的警告（`mac` 文档原文）：`While cross-compilation is possible, the most reliable approach is to build arm64 on Apple Silicon and x64 on Intel (or use a matrix in CI). Universal builds work best when both arches are produced natively and then merged.`

**推荐（推断）**：**只出 `arm64`。** 理由：
1. macOS 27（2026-09 发布，当前版本）已经不支持 Intel。为一个正在消失的平台付出 2× 体积 + universal 合并的复杂度，收益在快速衰减。
2. 用户的 Mac 如果是 Intel，说明机器至少 6 年以上（Apple Silicon 2020 年上市），且已无法升级到 macOS 27——**这类机器的用户不是本项目的目标用户。**
3. 如果将来发现确实有 Intel 用户，加 `x64` 是改一行配置（`arch: [arm64, x64]` 出两个独立产物），**不是架构性改动**——这条不构成「现在不做将来很痛」。

---

## 三、平台差异（影响代码，不只是打包）

### 3.1 用户数据与库的路径约定

**`app.getPath('documents')` 的行为**（[Electron app.md](https://github.com/electron/electron/blob/main/docs/api/app.md) 源码级）：`documents - Directory for a user's "My Documents".` 在 macOS 上返回 `~/Documents`。

**macOS 的应用数据目录约定**（同一文档）：`appData - ... ~/Library/Application Support on macOS`；`userData - Directory for storing app configuration files (defaults to appData appended with app name)`。

**即：`userData` 在 macOS 上是 `~/Library/Application Support/<appName>/`。** 这与 `0002` §9.5 的「同步锚点放在 `userData`」结论**天然兼容**——`userData` 在三个平台上都天然不进同步范围。

**macOS 上 Documents 是否有类似 OneDrive 的重定向问题？—— 有，而且是 Apple 官方的功能。**

[Apple 官方 iCloud 用户指南](https://support.apple.com/guide/icloud/set-up-icloud-drive-mm203d7d3839/icloud) 原文：

> When you turn on **Desktop & Documents Folders**, your **Desktop folder and Documents folder are stored in iCloud Drive**. This lets you access the files from your Mac on all your devices.

以及一条对本项目特别重要的：

> If you use a feature from another cloud provider that syncs or manages your Desktop folder and Documents folder, **you need to turn it off** to use Desktop & Documents Folders.

以及关闭时的行为：

> When you turn off Desktop & Documents Folders on your Mac, your files stay in iCloud Drive, and a new Desktop folder and Documents folder are created locally on your Mac in the home folder.

**这意味着什么（推断）**：

1. **`~/Documents/知己笔记/` 在开启了这个功能的 Mac 上，物理位置是 iCloud Drive 里**，`app.getPath('documents')` 返回的路径仍然可用（Apple 用了 symlink / firmlink 机制），但对本项目是**双重同步**：既走坚果云 WebDAV，又走 iCloud。这与 `0001` §5.6 记录的「SiYuan 警告：通过第三方同步盘进行数据同步不受支持，否则可能损坏数据」是同一类风险。
2. **iCloud Drive 在中国大陆不可用或不可靠**（`0001` §5.6 已记录）。所以对本项目的中文用户，这个功能要么没开，要么开了但同步不上——**两种情况都比「正常」更糟**。
3. **`~/Documents` 在 macOS 10.15+ 是 TCC 保护目录。** [Apple 官方 `NSDocumentsFolderUsageDescription` 文档](https://developer.apple.com/documentation/bundleresources/information-property-list/nsdocumentsfolderusagedescription)（macOS 10.15+ 引入）原文：

> The user implicitly grants your app access to a file in the Documents folder when selecting the file in an Open or Save panel, dragging it onto your app, or opening it in Finder. Your app can access that file right away and any time in the future. **In addition, if your app creates a new file in the Documents folder, the app can access that file without user consent.** **The first time your app tries to access a file in the user's Documents folder without implied user consent, the system prompts the user for permission to access the folder's contents.** Add the `NSDocumentsFolderUsageDescription` key to your app's `Info.plist` to provide a message that explains why your app needs access. **The usage description is optional, but highly recommended.**
>
> After the user chooses whether to grant access, **the system remembers the user's choice**. To reset permissions, use the `tccutil` command line utility with your app's bundle ID.

**这一条对本项目的影响是结构性的、且是好事**：本项目「应用创建笔记库」，按 Apple 原文，**应用自己创建的文件的访问不需要用户同意**。所以首次运行时的 TCC 弹窗大概率不会出现（或只出现一次）。**但**：如果用户在 `~/Documents` 之外放库（比如 iCloud Drive 里），那就在别的 TCC 域里了。**推断**：需要在 `Info.plist` 里加 `NSDocumentsFolderUsageDescription`，通过 electron-builder 的 `mac.extendInfo` 注入。

**关于 TCC 与代码签名的一层耦合（推断，未确证）**：TCC 按 bundle ID + 代码签名记录授权。未签名的应用每次构建的签名都不同（或没有），**理论上会导致 TCC 授权无法稳定关联**。我没有找到 Apple 或 Electron 的一手文档确认这一点在 macOS 26/27 上的具体行为——**标为未确证**。但 `safeStorage` 的 keychain 问题（§3.4）是同一类机制的一手证据。

### 3.2 文件关联

**macOS 用事件，不用 argv。** [Electron app.md](https://github.com/electron/electron/blob/main/docs/api/app.md) 源码级原文：

> ### Event: 'open-file' _macOS_
>
> Emitted when the user wants to open a file with the application. The `open-file` event is usually emitted when the application is already open and the OS wants to reuse the application to open the file. `open-file` is also emitted when a file is dropped onto the dock and the application is not yet running. **Make sure to listen for the `open-file` event very early in your application startup to handle this case (even before the `ready` event is emitted).**
>
> You should call `event.preventDefault()` if you want to handle this event.
>
> On Windows, you have to parse `process.argv` (in the main process) to get the filepath.

**三条与 Windows 不同的实现要点**（对比 `0004` §1.6）：

1. **`open-file` 必须在 `ready` 之前注册**，否则冷启动时丢事件。
2. **必须调 `event.preventDefault()`**（Windows 没有这一步）。
3. **不是读 argv**，所以 `0004` 里那套 `extractFileArg(process.argv)` 的按后缀过滤逻辑在 macOS 上用不上。

**声明位置**（`0004` §1.6 已记录，此处补充一手来源）：macOS 的文件关联在 **`Info.plist` 的 `CFBundleDocumentTypes`**（构建期），**不能运行时改**。electron-builder 的 [`FileAssociation.ts`](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/options/FileAssociation.ts) 源码级确认：

> macOS (corresponds to [CFBundleDocumentTypes](https://developer.apple.com/library/content/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-101685)), NSIS, and MSI only.

macOS 专属字段（同文件源码级）：

| 字段 | 对应 plist 键 | 取值 | 默认 |
|---|---|---|---|
| `role` | `CFBundleTypeRole` | `Editor` / `Viewer` / `Shell` / `None` | `Editor` |
| `isPackage` | `LSTypeIsPackage` | 文档是否是 bundle | — |
| **`rank`** | **`LSHandlerRank`** | `Owner` / `Default` / `Alternate` / `None` | **`Default`** |
| `icon` | — | `.icns`，相对 `build/` | 应用图标 |

**`LSHandlerRank` 的含义（推断）**：`Owner` 表示「我是这种文件类型的主要所有者」，`Default` 表示「我有能力打开但可能不是首选」，`Alternate` 表示「我是备选」。**对本项目的建议**：设 `rank: "Alternate"` 是诚实的（用户很可能已经在用 Typora / Obsidian），但 `Default` 也不会有害——macOS 的默认程序由用户显式选择，`rank` 只影响候选列表的排序。**未找到 Apple 关于 `LSHandlerRank` 影响用户默认程序选择的权威说明。**

**macOS 上能否程序化设置默认应用？—— Electron 没有提供这个 API。**

- [Electron app.md](https://github.com/electron/electron/blob/main/docs/api/app.md) 只有 `setAsDefaultProtocolClient`，源码级原文：`Sets the current executable as the default handler for a protocol (aka URI scheme).` / `The API uses the Windows Registry and LSSetDefaultHandlerForURLScheme internally.` —— **只做协议，不做文件扩展名。** 这在 `0004` §1.3 已对 Windows 确认，**macOS 上同样成立**。
- **`LSSetDefaultRoleHandlerForContentType` 在 Electron 的文档里完全没有出现**（已核对 `docs/api/app.md` 全文）。**推断**：可以走原生桥（`@electron/remote` 不行，需要 native module 或 `systemPreferences` 之外的手段），但这引入了原生模块依赖。
- **注意与 Windows 的一个关键差异**：Windows 上是**操作系统禁止**程序化设默认（`UCPD.sys` 过滤器驱动，`0004` §1.4 已记录）；macOS 上 `LSSetDefaultRoleHandlerForContentType` **是公开 API、没有被操作系统禁止**。**但它在沙箱下受限**（本项目不开沙箱，所以不受此限）。**这条我未能取得 Apple 的一手文档确认**（`developer.apple.com` 的 JSON 接口对该 API 返回 404，页面为 JS 渲染），**标为未确证**。
- **推断的结论**：**不要做「设为默认」这个功能。** 理由不是「做不到」（macOS 上可能做得到），而是「两个平台的行为不一致会带来更多的代码与测试负担」，且 `0004` 已经确认 Windows 上做不到、只能引导用户去设置页。**保持一致：引导用户手动设置。**

### 3.3 文件监听

**Node 官方的 `fs.watch` caveats（[nodejs/node v24.21.0 doc/api/fs.md](https://github.com/nodejs/node/blob/v24.21.0/doc/api/fs.md) 源码级原文）**：

> The `fs.watch` API is **not 100% consistent across platforms**, and is unavailable in some situations.
>
> ##### Availability
> * On macOS, this uses [`kqueue(2)`](https://man.freebsd.org/cgi/man.cgi?query=kqueue) for **files** and [`FSEvents`](https://developer.apple.com/documentation/coreservices/file_system_events) for **directories**.

**macOS 上文件与目录走两套不同的机制**——这是与 Windows（统一走 `ReadDirectoryChangesW`）的实质差异。

**两条已知的坑（同文档源码级）**：

**(1) `filename` 参数不保证提供**：

> Providing `filename` argument in the callback is only supported on Linux, macOS, Windows, and AIX. **Even on supported platforms, `filename` is not always guaranteed to be provided.** Therefore, don't assume that `filename` argument is always provided in the callback, and have some fallback logic if it is `null`.

**这条与 Windows 上「必须按后缀过滤 argv」是同一类问题的不同形态**：两个平台都**不能假设事件/参数一定完整**。**推断**：本项目必须实现「事件信息不全时回退到全量扫描」的逻辑，而这正好是 `0002` §9.4 的降级路径已经要求的。

**(2) inode 语义 —— macOS 与 Linux 相同，与 Windows 不同**：

> On Linux and macOS systems, `fs.watch()` resolves the path to an **inode** and watches the inode. **If the watched path is deleted and recreated, it is assigned a new inode. The watch will emit an event for the delete but will continue watching the _original_ inode. Events for the new inode will not be emitted.** This is expected behavior.

**这条对本项目是直接命中**：如果本项目的「原子写入」（写临时文件 + rename）实现得不好，**macOS 上会出现「重命名后监听失效」**。而 `0001` 记录的 Obsidian / Joplin 都用原子写入。**推断**：正确的做法是监听**目录**而不是文件（FSEvents 路径），或者在收到 delete 事件后重建 watcher。

**chokidar 的立场**（[chokidar README](https://github.com/paulmillr/chokidar) 原文）：

> There are many reasons to prefer Chokidar to raw fs.watch / fs.watchFile in 2026:
> - Events are properly reported
>   - **macOS events report filenames**
>   - **events are not reported twice**
>   - **changes are reported as add / change / unlink instead of useless `rename`**
> - Atomic writes are supported, using `atomic` option
> - **Recursive watching is always supported, instead of partial when using raw events**

以及 `atomic` 选项的默认值（原文）：

> `atomic` (default: `true` if `useFsEvents` and `usePolling` are `false`). Automatically filters out artifacts that occur when using editors that use "atomic writes" instead of writing directly to the source file. If a file is re-added within 100 ms of being deleted, Chokidar emits a `change` event rather than `unlink` then `add`.

**结论（推断）**：**在 macOS 上直接裸用 `fs.watch` 会踩 inode 坑；用 chokidar 并把 `atomic` 打开（默认）是正确做法。** chokidar 的 README 明确把「macOS 事件报告文件名」列为它相对裸 `fs.watch` 的优势——这与 Node 官方「filename 不保证提供」的警告正好互补。

**未确证**：FSEvents 在 macOS 26/27 上是否有新的行为变化。**没有找到任何一手证据。**

### 3.4 中文输入法 —— **中文应用的核心关注点，结论是「有严重问题，但性质与 Windows/Tauri 不同」**

**这是本次调研中最重要的发现之一。必须区分两个独立的问题。**

#### 问题 A：macOS 26 上的 autofill popup churn（**已修复**）

[electron#52260](https://github.com/electron/electron/issues/52260)（2026-07-04 提交，2026-07-13 关闭为已修复）标题：

> [Bug]: macOS: every keystroke in any input/textarea recreates a native autofill popup NSWindow, **blocking the browser process 100-260 ms per key on macOS 26 (worst with CJK IME)**

**报告者的实测数据（一手，含 Chrome 对照）**：

| 环境 | 结果 |
|---|---|
| Chrome 149（同机，同 workload） | `autofill-tagged mojo messages on CrBrowserMain: count=106 total=5 ms max=0 ms`；`browser-main long tasks (>=30 ms): count=0` |
| **Electron 42.3.3 / 43.0.0** | **`main-process event-loop stalls >50 ms: count=37 total=4915 ms max=350 ms`** |

**根因（报告者原话，已核实）**：

> Every keystroke that changes the value of a focused `<input>`/`<textarea>` (with the caret at the end) makes the renderer send `ElectronAutofillDriver::ShowAutofillPopup` **with an empty suggestion list**, and the browser process destroys and recreates a native autofill popup `NSWindow` each time. On macOS 26, each of those window-ordering operations blocks `CrBrowserMain` for 50–350 ms in a synchronous WindowServer transaction. Since `CrBrowserMain` routes all input events, **every window and input of the app stutters.**

**为什么 CJK IME 用户受害最重（报告者原话）**：

> CJK IME users are hit hardest: apps that type into a hidden textarea (e.g. xterm.js terminals) never change the textarea value for plain keys (keydown is `preventDefault()`ed), but **IME preedit lives in the textarea and changes its value on every keystroke** — so composition triggers the churn on every key.

**修复状态（已核实）**：

- [PR #52262](https://github.com/electron/electron/pull/52262)（`fix: don't show empty autofill popup`）2026-07-13 合入 `main`，标签 `semver/patch` + `merged/41-x-y` + `merged/42-x-y` + `merged/43-x-y` + `merged/44-x-y`。
- **backport 已全部完成**：PR #52320（41-x-y）、#52319（42-x-y）、#52321（43-x-y）、#52318（44-x-y）。
- **即：Electron 41+ 的所有当前维护线都已含此修复。**

**对本项目的含义**：**用 Electron 44（当前稳定线）不受影响。** 但**如果为了兼容性而降级到 Electron 40 或更早，会踩这个坑**——而 40.x 在 2026-07 时是支持的（40.10.6，2026-07-01），**该修复没有 backport 到 40**。**推断**：**Electron 版本下限应设为 41。**

#### 问题 B：macOS 26/27 上 Chromium 的 IME XPC 死锁（**未修复，影响所有 Chromium 系应用**）

[Funput PR #85](https://github.com/Funput/Funput/pull/85)（`docs(macos): note Chromium/Electron IME breakage on macOS 26/27 beta`）的报告者做了完整的根因分析。原文摘录：

> typing silently breaks in Chromium/Electron apps (**Chrome, Cursor, VS Code, Slack, Notion desktop, ...**) after switching the input source while a text field in that app already has focus.
>
> Live unified-log capture during a repro shows `FunputInputController` calling `setMarkedText`/`insertText` normally and on schedule throughout the failure — **the input method itself is healthy. The breakage is downstream, in the affected app's Chromium/Electron renderer.**
>
> Any third-party input method must run as its own process and exchange every keystroke with the focused app over `IMKServer`'s XPC/Mach IPC (the only public API for a custom macOS IME). A plain keyboard layout (no composing step) never goes through this path and structurally can't hit this bug. **On macOS 26/27 beta, Apple changed `TextInputUIMacHelper` internals, and Chromium's `NSTextInputContext` bridge doesn't yet handle the new timing — the IME's `activate` XPC call can race with Chromium's own concurrent `firstRectForCharacterRange` query, and both block waiting on each other (classic IPC deadlock).**
>
> The practical workaround (restart the affected Chromium/Electron app, not Funput — confirmed ineffective since Funput's process isn't the one stuck).

**它引用的上游 issue（已核实存在）**：

- [electron#51557](https://github.com/electron/electron/issues/51557)：`macOS 26.3 (Tahoe) - IME candidate window not displaying in textarea`。报告用 Electron 31/33/35，**在 Electron 41.5.0 上无法复现，已关闭**。
- [electron#52260](https://github.com/electron/electron/issues/52260)：即上面的问题 A。
- [electron#47472](https://github.com/electron/electron/issues/47472)：`Korean input issue: missing consonants and duplicated characters in Chromium-based apps on macOS`。**关键细节（报告者原文）**：`Korean input methods tested include both the Apple default "2-Set Korean" keyboard and other third-party IMEs.` / `Other macOS apps (such as Apple Notes, Pages, or Safari) do not show this issue`。**即 Apple 自带的 IME 也复现——不是第三方输入法的问题。**
- `runjuu/InputSourcePro#92`（PR 中引用，未独立核实）：报告称它 root-cause 了确切的死锁机制。

**如何判断这条对本项目的影响（推断）**：

1. **这不是 Electron 的 bug，是 macOS 26/27 系统 API 变化 + Chromium 桥接未跟上的组合。** 它影响 **Chrome、VS Code、Slack、Notion、Cursor** —— 即所有 Chromium 系应用。
2. **触发条件是「切换输入源时焦点已在文本框内」**，不是「输入中文」本身。
3. **对本项目的含义**：**中文用户会 100% 在 IME 里写作**（`0001` §5.5）。这条 bug 的症状是「输入静默失效，必须重启应用」——**对本项目是致命的用户体验问题**。
4. **但它是全行业问题，不是本项目的实现缺陷。** 且 Electron 团队在积极处理（#51557 的 triage 响应、#52260 的修复速度都在 1-2 周内）。
5. **未确证**：这条在 macOS 26/27 **正式版**（非 beta）上的实际复现率。PR #85 标题写的是 `macOS 26/27 beta`。**#47472 在 macOS 15.5 上就报告了**（2025-06），说明这类问题不是 26 才有的。

#### 与 Windows/Tauri 的对比（这是任务明确要的）

| | Windows + Tauri（`0001` §1） | **macOS + Electron** |
|---|---|---|
| 性质 | **结构性**：Tauri 自己的 TSF 处理在「已有文本的 contenteditable」上冻结 IME | **系统性**：macOS 系统 API 变化破坏了 Chromium 的桥接 |
| 触发条件 | 「打开一篇旧笔记继续写」——**必然发生** | 「切换输入源时焦点已在输入框」——**条件性发生** |
| 上游修复 | **拿不到**：修复在 tao 0.36，Tauri 2 稳定线依赖 tao ^0.35（`0001` §1） | **能拿到**：backport 到 41/42/43/44 四条线（问题 A）；问题 B 跟随 Electron 版本升级 |
| 影响范围 | Tauri 应用 | **所有 Chromium 系应用**（Chrome / VS Code / Slack / Notion） |
| 严重程度 | 高（核心场景坏掉） | **高（但概率性，且全行业共担）** |

**结论（事实 + 推断）**：

- **事实**：Electron 在 macOS 上有真实的 IME 问题，且**中文/日文/韩文用户受害最重**。
- **事实**：其中一条（autofill popup churn）已在 Electron 41+ 修复。
- **事实**：另一条（XPC 死锁）是 macOS 26/27 的系统级变化，影响所有 Chromium 应用，**Electron 团队已知且在处理**。
- **推断**：**这不构成「Electron 在 macOS 上不能用」的理由**——因为替代方案（Tauri 的 WebView 是 WKWebView，在 macOS 上走的是 Apple 自己的引擎，**理论上不受这个问题影响**，但 Tauri 在 Windows 上的 IME bug 更致命，见 `0001` §1）。**对本项目而言，这是一个「必须实测验证」的项，不是「必须放弃」的项。**
- **推断的验证方法**：档 1 的第一件事应该是「在一台 Apple Silicon Mac 上，用 fcitx5 / 系统拼音 / 搜狗，在 CodeMirror 6 编辑器里写 30 分钟中文」，而不是先研究打包。**IME 是这个项目在 macOS 上唯一真正的「能不能用」问题。**

### 3.5 路径与文件名 —— **NFD 那条地雷对中文不存在，但另有地雷**

#### 3.5.1 任务假设的核查：macOS 会对文件名做 NFD 规范化吗？

**答案：当前 macOS（APFS）不会。任务假设在 APFS 时代已经不成立。** 但这是一个**历史上有根据、且在构建工具层面仍然留有痕迹**的问题。

**事实链一：APFS 保留归一化形式。** [Apple 官方 APFS Guide FAQ](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/FAQ/FAQ.html) 原文：

> **APFS accepts only valid UTF-8 encoded filenames for creation, and preserves both case and normalization of the filename on disk in all variants.** APFS, like HFS+, is case-sensitive on iOS and is available in case-sensitive and case-insensitive variants on macOS, **with case-insensitive being the default**.
>
> In macOS High Sierra, APFS is **normalization-insensitive** in both the case-insensitive and case-sensitive variants, using a hash-based native normalization scheme. ... **Being normalization-insensitive ensures that normalization variants of a filename cannot be created in the same directory, and that a filename can be found with any of its normalization variants.**

以及一条关键的对比：

> **APFS preserves the normalization of the filename and uses hashes of the normalized form of the filename to provide normalization insensitivity, whereas HFS+ stores the normalized form of the filename on disk** to provide normalization insensitivity.

**事实链二：HFS+ 才是那个「强制 NFD」的文件系统。** [Apple TN1150（HFS Plus Volume Format）](https://developer.apple.com/library/archive/technotes/tn/tn1150.html) 原文：

> **HFS Plus stores strings fully decomposed and in canonical order.** HFS Plus compares strings in a case-insensitive fashion.

**即**：NFD 是 **HFS+** 的行为（macOS 10.12 及更早的默认文件系统，以及**现在仍在使用 HFS+ 的外置磁盘**）。APFS 从 macOS 10.13 起是默认。

**事实链三（已实测，本机 Node v24.18.0）—— 汉字在 NFC 与 NFD 下完全相同。**

```
CJK 基本区 (U+4E00–U+9FFF)  共 20992 个，NFC != NFD 的有 0 个
CJK 扩展 A (U+3400–U+4DBF)  共  6592 个，NFC != NFD 的有 0 个
CJK 兼容表意 (U+F900–U+FAFF) 共   512 个，NFC != NFD 的有 0 个
```

**差异只出现在这些地方**（已实测）：

| 输入 | NFC === NFD? | 说明 |
|---|---|---|
| `知识` / `我喜欢知识管理` / `笔记` / `知己笔记` | **是** | 汉字无差异 |
| `中文标点：，。！？` | **是** | 中文标点无差异 |
| `繁體字：知識管理` | **是** | 繁体汉字同样无差异 |
| `全角ＡＢＣ１２３` | **是** | 全角字母数字无差异 |
| `日本語` | **是** | 日文汉字无差异 |
| `ā` / `á`（带声调拉丁字母） | **否** | NFD 分解为 `a` + 组合声调符 |
| `が ぎ ぐ`（日文浊音） | **否** | NFD 分解为 `か` + 浊点 |
| `한국어`（韩文） | **否** | NFD 分解为 Jamo |

**结论（事实层面）**：

- **中文标题（本项目的主要场景）在 NFC/NFD 下字节完全相同。`[[链接]]` 的匹配不会因 NFD 规范化而坏。**
- **风险仅存在于**：① 标题里含带声调的拼音字母（`Lǔ Xùn` 这类）；② 日文浊音/半浊音；③ 韩文；④ 用户在外置 HFS+ 磁盘上放库。
- **任务里「macOS 会对文件名做 NFD 规范化，中文标题在 NFC/NFD 下可能产生不同的字节序列」这个假设，在当前 macOS 上是错的。** 需要修正。

**但 APFS 的 normalization-insensitive 带来一个更实际的约束（推断）**：

> `normalization variants of a filename cannot be created in the same directory`

**即：同一目录下不能存在两个「归一化后相同」的文件名。** 如果链接匹配用的是**字符串相等**而不是**文件系统查找**，那么「用户从别处复制进来的一个 NFC 形式的文件名」与「应用按 NFD 形式记录的链接」在**字符串比较层面**可能不等——尽管文件系统本身认为它们是同一个文件。**推断**：**正确做法是用文件系统查找（`fs.existsSync` / `readdir` 后按 inode 或 realpath 比对），而不是字符串相等。** 这条对中文不构成风险（因为汉字无差异），但对含重音字母的标题构成风险。

**事实链四（一个真实存在的构建工具层面证据）**：electron-builder **在 v27 之前会对 macOS 的 `productName`/`executableName` 做 NFD 归一化**。[v27 Breaking Changes](https://github.com/electron-userland/electron-builder/blob/master/website/docs/migration/v27-breaking-changes.md) 原文：

> **Names are also no longer NFD-normalized.** The `.app` bundle, the helper bundles, and `CFBundleName` now use the product name exactly as configured. For any name containing accented characters this changes the **bytes** of the on-disk filename, which is what external notarization and upload tooling matches on — update anything that hard-codes the normalized form. **Relatedly, archive creation falls back from 7z to zip for NFD-normalized filenames.**

**这条印证了「NFD 在 macOS 生态里是个真实存在的工程问题」**——只是它作用于**构建产物名**，不是**用户笔记的文件名**。对本项目（`productName` 是「知己笔记」，无重音字母）**无影响**。

#### 3.5.2 真正的地雷：APFS 默认大小写不敏感

**已核实（APFS 官方文档原文）**：`is available in case-sensitive and case-insensitive variants on macOS, with **case-insensitive being the default**.`

**这对「文件名即笔记标题」的设计意味着什么（推断）**：

1. **`知识.md` 与 `知识.MD` 是同一个文件。** 用户在 macOS 上创建 `TODO.md`，在 Windows 上（NTFS 默认也不敏感）也是同一个——**两个平台行为一致，所以这一条不是 macOS 特有的风险**。
2. **真正的风险是「应用在 macOS 上创建了两个只有大小写不同的文件名，然后同步到 Linux 或区分大小写的 APFS 卷上」**——本项目不支持 Linux，所以风险降低。
3. **但有一条跨平台不一致**：`0002` §4.4 记录了 Syncthing 有专门的 `case conflict` 类型（`仅大小写不同的文件名在大小写不敏感系统上冲突`）。**推断**：如果本项目的 WebDAV 同步在服务端（可能是 Linux，区分大小写）与本地（Windows/macOS，不区分）之间产生大小写差异，会产生一类难以诊断的冲突。**这条与 `0002` 的方案 B（冲突副本）叠加时，需要额外的命名约束**——建议副本命名只用小写 ASCII 后缀（如 `.conflict-<ts>.md`），避免引入新的大小写歧义。

#### 3.5.3 另一条实际的地雷：`:` 与 `/` 的历史约束

**未确证**。macOS 上 HFS+ 时代文件名里的 `:` 会被转成 `/`（Finder 层面的历史遗留）。**APFS 时代这条是否仍然存在，我未找到一手证据。** 但 `0001` §5.3 已记录 Obsidian 的链接禁用字符集包含 `:` ——**这条在两个平台都需要处理，不是 macOS 特有。**

### 3.6 菜单栏与快捷键

**全局菜单栏**（对比 Windows 的窗口菜单）：macOS 的菜单栏在屏幕顶部，不属于窗口。**推断**：`0004` 里为 Windows 设计的菜单结构在 macOS 上需要调整——尤其是「关于」「偏好设置」「退出」这三项的位置（macOS 惯例在应用菜单里，Windows 惯例在「帮助」或「文件」里）。**Electron 的 `role` 机制会自动处理这部分**（`role: 'about'` / `'preferences'` / `'quit'` 会被放到 macOS 的正确位置）。**未找到 Electron 官方对 `role` 在 macOS 上自动重定位的明确文档，标为推断。**

**`Cmd` vs `Ctrl` 的映射 —— 已确证。** [Electron keyboard-shortcuts 教程](https://github.com/electron/electron/blob/main/docs/tutorial/keyboard-shortcuts.md) 源码级原文：

| Modifier | macOS | Windows and Linux |
|---|---|---|
| `CommandOrControl` | **Command (⌘)** | Control |
| `Command` | Command (⌘) | **N/A** |
| `Control` | Control (^) | Control |
| `Alt` | Option (⌥) | Alt |
| `Option` | Option (⌥) | **N/A** |
| `Super` (`Meta`) | Command (⌘) | Windows (⊞) |

以及两条重要的官方警告（原文）：

> * On Linux and Windows, the `Command` modifier does not have any effect. In general, you should use the `CommandOrControl` modifier instead, which represents <kbd>⌘ Cmd</kbd> on macOS and <kbd>Ctrl</kbd> on Linux and Windows.
> * **Use `Alt` instead of `Option`.** The <kbd>⌥ Opt</kbd> key only exists on macOS, whereas the `Alt` will map to the appropriate modifier on all platforms.

**即：本项目如果全部用 `CmdOrCtrl` + `Alt`，快捷键在两个平台上都会正确。** 这是一条**零成本**的正确性——只要不用 `Command` 或 `Option`。

**`app.dock`**（[Electron dock.md](https://github.com/electron/electron/blob/main/docs/api/dock.md) 源码级）：

> A `Dock | undefined` property (`Dock` on macOS, `undefined` on all other platforms) that allows you to perform actions on your app icon in the user's dock.

**注意类型是 `Dock | undefined`**——所以在 TypeScript 里访问前必须做非空检查。方法包括 `bounce()` / `cancelBounce()` / `setBadge()` / `getBadge()` / `hide()` / `show()` / `setMenu()` 等。**一条已记录的已知问题（源码级原文）**：`dock.hide()` 在上次调用后一秒内调用无效，workaround 是 defer 1100ms 以上。

**推断**：**本项目在 macOS 上应该只用 `app.dock.setBadge()`（如果有未读计数）和 `dock.setMenu()`（Dock 右键菜单，macOS 惯例）。其余方法不需要。** 特别注意 `dock.hide()` 不要用——macOS 应用隐藏 Dock 图标会让用户无法切回。

### 3.7 窗口行为

**已确证（[Electron 官方教程](https://github.com/electron/electron/blob/main/docs/tutorial/launch-app-from-url-in-another-app.md) 源码级原文）**：

```js
// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

以及必须配合的 `activate` 事件（同一教程）：

```js
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
```

**三条 macOS 特有的窗口语义（推断）**：

1. **关闭窗口 ≠ 退出应用。** 用户按 `Cmd+W` 关窗口后，应用仍在 Dock 里。**对本项目的影响**：文件监听、同步、索引更新必须**继续运行**，不能挂在窗口的生命周期上。**这是一条影响架构的约束**——如果本项目的同步调度器绑在 `mainWindow.on('closed')` 上，macOS 上会出错。
2. **`Cmd+Q` 才是退出。** 需要在 `before-quit` 里做数据落盘。
3. **`activate` 事件在「用户点 Dock 图标且没有可见窗口」时触发**——必须能重建窗口。

**一条相关的、影响本项目的约束（推断）**：`0002` §9.5 已定「同步锚点放在 `userData`」。**在 macOS 上「关闭窗口不退出」意味着锚点可能在应用长时间后台运行时被更新**——这与 Windows 上「关窗口即退出」的模型不同。**推断**：锚点的写入时机不能依赖应用退出，必须在每次同步完成后立即落盘。

---

## 四、其他

### 4.1 macOS 上的全文检索

**SQLite FTS5 在 macOS 上可用 —— 已确证。**

**事实链一：better-sqlite3 默认启用 FTS5。** 源码级（[deps/defines.gypi](https://github.com/WiseLibs/better-sqlite3/blob/master/deps/defines.gypi)，该文件头部标注 `AUTOMATICALLY GENERATED BY deps/download.sh`）：

```
'SQLITE_ENABLE_FTS3',
'SQLITE_ENABLE_FTS3_PARENTHESIS',
'SQLITE_ENABLE_FTS4',
'SQLITE_ENABLE_FTS5',
```

**FTS5 与平台无关**——它是 SQLite 的编译期开关，`defines.gypi` 是全平台共用的。**所以 macOS 上的 FTS5 行为与 `0001` §3 / `0002` 的实测结果完全一致。** 中文检索方案不需要任何 macOS 特有的改动。

**事实链二（2026 年的重大变化）：better-sqlite3 v13.0.0 起改用 N-API，免 electron-rebuild。** [v13.0.0 release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)（2026-07-21）原文：

> Version `13.0.0` marks a major milestone, as it's **the first version of `better-sqlite3` to run on the N-API**. This means **prebuilt binaries should theoretically work across different versions of Node.js and Electron**, and perhaps even other runtimes like Bun. As a result, **we've removed the deprecated `prebuild-install` dependency, and now prebuilt binaries are published directly with the `better-sqlite3` code itself.** If your platform/architecture doesn't have a prebuilt binary, it should compile during install as before.

**已核实的证据**：

| | v12.12.0 | **v13.0.3** |
|---|---|---|
| GitHub Release assets | **145 个**（含 `better-sqlite3-v12.12.0-electron-v143-darwin-arm64.tar.gz` 等每个 Electron ABI 一份） | **0 个**（prebuild 随 npm 包发布） |
| `scripts` 里的 prebuild 相关 | 有 `prebuild-install` 依赖 | **无**（`dependencies` 只剩 `node-addon-api`） |
| `gypfile` | — | `false` |
| npm 包体积 | — | **27.3 MB / 68 文件**（含所有平台的 prebuild） |

**v13 的 prebuild 覆盖（从 `package.json` 的 `exports` 字段核实）**：

```
./linux-x64, ./linux-arm64, ./linuxmusl-x64, ./linuxmusl-arm64,
./darwin-x64, ./darwin-arm64, ./win32-x64, ./win32-arm64
```

**即：`darwin-arm64` 与 `darwin-x64` 都有 prebuild。** 加载方式（源码级 `lib/darwin-arm64.js`）：

```js
module.exports = require('./database')(() => require('../prebuilds/darwin-arm64.node'), false);
```

**这条极大地降低了 macOS 的成本**：

- **不需要 `electron-rebuild`**（N-API 是 ABI 稳定的，跨 Node/Electron 版本通用）。
- **不需要在 macOS 上编译原生模块**——这曾是一般 Electron 项目在 macOS 上的主要痛点（`0004` 未涉及，但 electron-builder 的 multi-platform-build 文档原文：`If your app has native dependencies, they can only be compiled on the target platform unless prebuild is used.`）。
- **代价**：npm 包 27.3 MB（含所有平台的二进制）。**推断**：这对安装时间和磁盘占用有影响，但 `electron-builder` 的 `node_modules` arch/os 过滤（v27 起 `node_modules are now arch/os-filtered on every build`）会剔除不匹配的 prebuild，所以最终打包体积不受影响。

**一条文档滞后（源码级核实）**：[docs/troubleshooting.md](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md) **仍然写着**：

> ## Electron
> 1. If you're using [Electron](https://github.com/electron/electron), use [`electron-rebuild`](https://www.npmjs.com/package/electron-rebuild).

**这条在 v13 之后已经过时。** 该文档在同一页开头写着 `Use the latest version of better-sqlite3`——**推断**：这是「文档未跟上代码」而非「v13 仍然需要 rebuild」。

**未确证**：`electron-rebuild` 在 v13 + N-API 下是否仍然无害（推断是无害的，但会白花时间）。**建议实测**。

### 4.2 未签名应用的用户体验 —— 具体的警告文案与步骤数

**警告文案（Apple 官方文档列出的 alert 类型，[support.apple.com/en-us/102445](https://support.apple.com/en-us/102445)）**：

| Alert | 触发条件 |
|---|---|
| `downloaded from the Internet` | 文件带 quarantine 属性 |
| `Apple cannot check for malicious software` | 未公证 |
| `developer cannot be verified` | 未签名或签名无法验证 |
| `not downloaded from the App Store` | — |
| `app will damage your computer` / `is damaged` | 被移到废纸篓，并可选匿名上报 |

**步骤数：4 步 + 1 次密码输入 + 1 小时的时效窗口**（见 §1.1 的官方原文）。

**额外的风险文案**（Apple 官方 Mac 用户指南，用户会看到）：

> Overriding security settings to open an app is the most common way that a Mac gets infected with malware.
> You should not override security settings if an app hasn't been checked by Apple.
> The safest approach is to look for a version of the app from the Mac App Store or look for an alternative app.

**推断**：**对「自己第二台机器」（档 2）这套流程可接受**——一次性、4 步、有明确路径。**对「陌生用户」（档 3）不可接受**——Apple 的文案在主动劝退，且用户很可能在「app is damaged」这一步就放弃（因为那个文案暗示文件损坏，而不是「需要授权」）。

**一条与 Windows 的对比**（`0004` §2.3 已记录）：Windows 上 SmartScreen 是**基于信誉**的，且 per-user 安装 + 未签名在**首次安装**时弹一次、**自动更新**时不弹（MOTW 那条未确证）。**macOS 上没有等价机制**——未签名就是每次都拦（除非用户放行过一次）。

### 4.3 一处与 Windows 不同的「签名相关 API」

**Electron 官方列出了一批「在 macOS 上需要代码签名才能正常工作」的 API**（[code-signing.md](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md) 源码级原文）。**其中一条直接命中本项目：**

> - `safeStorage` - **Without a valid, consistent code signature, macOS may be unable to tell that two builds of your unsigned app are "the same app", which can cause the Keychain to prompt the user for permission again after every update.**

**为什么这条直接命中**：本项目要做 WebDAV 同步，必然要存储 WebDAV 密码。`0001` / `0002` 未讨论密码存储位置，但 **Electron 的 `safeStorage` 是标准做法**（[safe-storage.md](https://github.com/electron/electron/blob/main/docs/api/safe-storage.md) 源码级：`macOS: Encryption keys are stored for your app in Keychain Access ... Therefore, content is protected from other users and other apps running in the same userspace.`）。

**未签名时的实际症状（有 issue 一手证据）**：

- [electron#40236](https://github.com/electron/electron/issues/40236)（`safeStorage prompts for macOS keychain password when upgrading electron`，Electron 25.8.0 → 25.8.1）
- [electron#43233](https://github.com/electron/electron/issues/43233)（同一问题在 Electron 31.3.1 上复现）。报告者原文：`Start below example (npm start) --> Encryption works ... Upgrade electron (npm install electron@31.3.1 --save-dev) --> Run example again after upgrade (npm start) --> macOS password prompt shown and encryption/decryption doesn't work until password entered.`

**同一文档列出的其他三条**（对本项目的影响）：

| API | 未签名时的症状 | 对本项目 |
|---|---|---|
| `safeStorage` | Keychain 每次更新后重新弹权限 | **直接命中**（WebDAV 密码） |
| `app.setLoginItemSettings()` | `Login items can behave incorrectly (e.g. silently failing to register)` | 低（本项目不一定要开机自启） |
| `cookieEncryption` fuse | 同 `safeStorage`（同一 Keychain 访问） | 低（默认关闭，`0001` 未涉及） |
| `autoUpdater` | 见 §1.4 | **直接命中** |

**结论（推断）**：**「不做签名」在 macOS 上的代价不只是「不能自动更新」，还包括「每次更新后用户（也就是你自己）要重新输一次 Keychain 密码」。** 对档 1（自己用、不自动更新、手动替换 app）这条影响有限；对档 2（自己两台机器 + 自动更新）**这两条会叠加**——未签名意味着连自动更新都做不到，所以「每次更新重输密码」这个症状反而不出现。**这是一个有点荒诞的推论：因为不能自动更新，所以不会遇到「更新后要重输密码」。**

**一条重要的补充事实**：`safeStorage` 的同步 API（`isEncryptionAvailable` / `encryptString` / `decryptString`）**在 Electron 46 被移除**（源码级原文：`The synchronous API (isEncryptionAvailable/encryptString/decryptString) was removed in Electron 46. Use isAsyncEncryptionAvailable/encryptStringAsync/decryptStringAsync`）。**推断**：本项目如果现在（Electron 44）用同步 API，到 Electron 46 要迁移。**这是个「现在选对、以后省事」的点——建议直接用 async 版本。**

---

## A. 三档支持程度的代价对比

> 以下成本估算中的**工作量**是**推断**（基于本次查证的配置量与代码量）；**金钱**基于已核实的价格（99 USD/年、$0.062/分钟）。**工作量以「熟悉 Electron 的单人开发者」为单位。**

### 档 1「能跑」：能在 Mac 上跑起来、能自己构建自用

| 维度 | 结论 |
|---|---|
| **要 Apple 年费吗** | **不要。** Apple 官方原文：`You can install apps on your personal device with Xcode. You'll only need to enroll if you'd like to distribute apps...` |
| **要一台 Mac 吗** | **要，硬性。** 源码级：在 Windows 上构建 macOS target 直接抛 `InvalidConfigurationError`。**推断**：Linux 上可能能出一部分（zip），但签名/dmg/公证都不行，对本档「自己构建自用」意义不大——**因为自用也需要跑起来，而跑起来就需要 .app，而 .app 在 Linux 上打出来后在 Mac 上仍要过 Gatekeeper（本地构建不带 quarantine 这个优势就没了）** |
| **要 CI 吗** | 不要 |
| **金钱成本** | **0**（除 Mac 硬件） |
| **配置层面要多做什么** | `mac.sign.identity: null` + `mac.sign.hardenedRuntime: false`（两行）；`mac.target: ["zip"]` 或 `["dmg"]`（自用的话 `dir` 就够，官方 target 表标 `dir` 是 `Development/debugging — unpacked app`，`Signed? No / Notarized? No`）；`fileAssociations` 配置（macOS 会映射到 `CFBundleDocumentTypes`，**同一份配置**，见 `0004` §1.6）；`mac.extendInfo.NSDocumentsFolderUsageDescription`（TCC 用） |
| **代码层面要多做什么** | ① `open-file` 事件监听（必须在 `ready` 前注册 + `preventDefault`）；② `window-all-closed` 的 `darwin` 分支 + `activate` 事件；③ 快捷键全部改用 `CmdOrCtrl` + `Alt`（**如果一开始就这么写，成本是 0**）；④ `app.dock` 的非空检查（如果用）；⑤ **文件监听用 chokidar 而不是裸 `fs.watch`**（如果一开始就这么选，成本是 0）；⑥ 同步调度器**不能**绑在窗口生命周期上 |
| **工作量估算（推断）** | **首次接入：1–3 天**（主要是 `open-file` + 窗口语义 + 在一台 Mac 上把构建跑通）。**如果上述「零成本」的几条现在做对，增量接近 0。** |
| **最大的风险** | **§3.4 的 IME 问题**——这是「能不能用」的问题，不是「要不要花时间」的问题。**必须先实测。** |

### 档 2「自用可分发」：能签名 + 自动更新，自己两台机器用

| 维度 | 结论 |
|---|---|
| **要 Apple 年费吗** | **要。99 USD/年**（约 700 元人民币，**具体人民币金额未确证**）。**不付 = 没有 Developer ID 证书 = 不能签名 = 不能自动更新（§1.4 硬约束）** |
| **要一台 Mac 吗** | **要，且签名只能在 Mac 上做**（官方：`macOS Code Signing works only on macOS. Cannot be fixed.`） |
| **要 CI 吗** | **建议要，但不是硬性。** 没有 CI 也能做（在自己的 Mac 上构建 + 上传），但每次发布都要占用本机。**public 仓库的 macOS runner 免费**，所以成本是 0 |
| **金钱成本** | **99 USD/年**（≈700 元）+ Mac 硬件。CI 0 元（public 仓库） |
| **配置层面要多做什么** | ① `mac.sign.identity` 指向 `Developer ID Application` 证书；② `mac.sign.hardenedRuntime: true`（默认，保持）；③ `CSC_LINK` + `CSC_KEY_PASSWORD` 环境变量（或本机 keychain 自动发现）；④ `publish` 配置（GitHub Releases，`0004` §2.2 已查证可行）；⑤ **`mac.sign.entitlements` 必须自己审一遍**——默认只给 `allow-jit`，如果项目需要别的（如文件访问、网络），要加；⑥ **`extraFiles` 里不能有未签名的文件**（§1.4 的连带事实） |
| **代码层面要多做什么** | **相对档 1 几乎为零**——`electron-updater` 的 macOS 路径是「两行代码」（`autoUpdater.checkForUpdatesAndNotify()`），且 macOS 走 `Squirrel.Mac` 原生暂存，比 Windows 更省心（官方原文：`Squirrel.Mac stages updates natively and applies them on relaunch` / `macOS is immune (Squirrel.Mac swaps the app bundle atomically)`）。**唯一的增量是 `safeStorage` 的 Keychain 权限问题消失**——签名后 Keychain 能稳定识别「同一个 app」，不再每次更新重弹密码 |
| **工作量估算（推断）** | **配置 + 走通签名流程：1–2 天**（含申请年费、生成证书、导出 .p12、在 CI 或本机跑通）。**注意申请审批的时间不在你的控制内**（Apple 只承诺 24 小时内确认） |
| **最大的坑** | ① **证书必须在 macOS 上生成/导出**；② **CI 上要处理 keychain 导入**（`CSC_LINK` 传 .p12 的 base64）；③ **`mac.sign.entitlements` 是 v27 起的位置**，v26 还在 `mac.entitlements`；④ **首次发布的包会把 `publish` 源写死**（`0004` §D-3 已记录） |

### 档 3「给别人用」：公证、Gatekeeper 无警告、面向陌生用户

| 维度 | 结论 |
|---|---|
| **要 Apple 年费吗** | 要（同档 2）。**公证不额外收费** |
| **要一台 Mac 吗** | 要（同档 2，且公证工具 `notarytool`/`stapler` 随 Xcode 提供） |
| **要 CI 吗** | **强烈建议**——公证的凭据（API Key 或 App 专用密码）应该放在 CI secret 里而不是本机 |
| **金钱成本** | 同档 2（99 USD/年） |
| **配置层面要多做什么** | ① `notarize` 保持启用；② 三组环境变量之一：`APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`（**官方推荐**）或 `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`；③ `mac.sign.hardenedRuntime: true`（**公证的前置条件**，默认已是）；④ `mac.target: ["dmg", "zip"]`（默认值） |
| **代码层面要多做什么** | **零** |
| **工作量估算（推断）** | **0.5–1 天**（主要是生成 App 专用密码或 API Key，以及第一次公证的调试——公证失败会返回具体的 entitlement 缺失，需要迭代） |
| **额外的时间成本** | **每次公证 `usually takes less than an hour`**（Apple 官方口径）。对单人发布节奏无影响 |
| **最大的坑** | ① **公证只解决「无警告」，不解决「陌生人信任」**——Apple 的文档明确说 `Gatekeeper then places descriptive information in the initial launch dialog to help the user make an informed choice`，**仍然有首次启动对话框**（只是文案从「无法验证开发者」变成「已由 Apple 检查」）；② **未公证的已签名应用在体验上等于未签名**（§1.3），所以档 3 与档 2 的差别是**真实的**，不是形式上的 |

### 三档对比速查表

| | 档 1 能跑 | 档 2 自用可分发 | 档 3 给别人用 |
|---|---|---|---|
| Apple 年费 | 否 | **99 USD/年** | 99 USD/年 |
| 一台 Mac | **要** | **要** | **要** |
| CI | 不要 | 建议（免费） | 强烈建议 |
| 签名 | 否 | **Developer ID** | Developer ID |
| 公证 | 否 | 否 | **要** |
| 自动更新 | **不能** | **能** | 能 |
| Gatekeeper 警告 | 有（自用场景不出现） | **有**（4 步 + 密码，一次性） | **无** |
| 配置量 | ~5 行 | ~10 行 + 环境变量 | ~10 行 + 环境变量 |
| 代码量 | `open-file` + 窗口语义 + 快捷键 | 同档 1 + 2 行 updater | 同档 2 |
| 工作量（推断） | 1–3 天 | +1–2 天 | +0.5–1 天 |
| **累计** | **1–3 天** | **2–5 天 + 700 元/年** | **2.5–6 天 + 700 元/年** |

**一条贯穿三档的观察（推断）**：**三档的边际成本是递减的**——档 1 → 档 2 是「决定性的跳跃」（要么付年费 + 有 Mac，要么什么都没有），档 2 → 档 3 只是「多三个环境变量」。**即：真正的决策点是「要不要做档 2」，不是「要不要做档 3」。**

---

## B. 哪些东西一旦现在不做、将来加会很痛

> 判断标准：**改动是否跨越「配置 → 代码 → 数据格式」的边界。** 只跨配置的可以随时改；跨到数据格式的就必须现在定对。

### B.1 真正的硬约束（必须现在定）

**1. 分发形态与 `appId` 必须在第一次发布前定死（跨数据 + 跨系统状态）。**

这条 `0004` §D 已对 Windows 记录（`appId` 决定 NSIS 卸载键、AUMID、v27 起的 ProgID）。**macOS 侧的增量事实**：

- `appId` 在 macOS 上是 **`CFBundleIdentifier`**（[mac 文档](https://www.electron.build/docs/mac) 原文：`The appId property sets the CFBundleIdentifier for your macOS app`）。
- 同一页原文警告：`**Changing it after first release will break existing user data paths** (NSUserDefaults, sandboxed containers, etc.)`
- **而且 `appId` 决定 macOS 上的 TCC 授权归属**（推断）——改了之后用户要重新授权 Documents 访问、Keychain 访问。

**即：`appId` 是三平台共用的一个标识，改它 = 三个平台同时出问题。必须在第一次发布前定死。**

**2. 「文件是唯一真相」在 macOS 上的一个额外含义：不能把 `~/Documents` 当作库的默认位置。**

**理由**：iCloud 的「Desktop & Documents Folders」会把 `~/Documents` 搬进 iCloud Drive（§3.1，Apple 官方确认），而 iCloud 在中国大陆不可靠（`0001` §5.6）。**如果现在把库的默认位置定成 `~/Documents/知己笔记/`，将来要改就是一个数据迁移。**

**推断的建议**：

- **不要用 `app.getPath('documents')` 作为默认库位置。** 用 `app.getPath('home')` 下的一个自建目录（如 `~/知己笔记/`），或者**首次运行时让用户选**。
- 这与 `0002` §9.5 的「同步锚点放 `userData`」是同一类判断——**库位置要选一个不受第三方同步工具影响的路径。**
- **但注意**：`~/Documents` 在 Windows 上也是 OneDrive 的默认重定向目标（`0004` 未涉及，但这是 Windows 的已知行为）。**所以这条不是 macOS 特有的——两个平台都有「系统自带的云同步会劫持 Documents」这个问题。** 这反而强化了「不要让默认库位置依赖 `getPath('documents')`」这个结论。

**3. 冲突副本的命名必须只用小写 ASCII（跨数据格式 + 跨文件系统语义）。**

`0002` §7 的方案 B（检测冲突 + 落副本）已确定副本会落在库内。**macOS 侧的增量约束**：APFS 默认**大小写不敏感**（§3.5.2）。如果副本命名引入了大小写差异（如 `.Conflict.md` vs `.conflict.md`），在 macOS/Windows 上是同一个文件，在 Linux 服务端上是两个——**而 `0002` §2.3 已确认 WebDAV 服务端可能是 Linux（Nextcloud/坚果云）**。

**推断的建议**：副本后缀固定为小写 ASCII，如 `.conflict-<机器名>-<YYYYMMDDHHMMSS>.md`。**这条现在定对，成本是 0。**

**4. Electron 版本下限必须 ≥ 41（跨代码）。**

§3.4 的问题 A（autofill popup churn，CJK IME 受害最重）**只在 Electron 41+ 修复**。backport 到了 41/42/43/44，**没有到 40**。

**推断**：**在 `package.json` 里把 `electron` 的版本写死为 `^44`（或至少 `>=41`），并且不要为了兼容性而降级。** 这条现在写对，成本是 0。

### B.2 强烈建议现在做对（改动会跨到代码，但成本现在很低）

**5. 快捷键全部用 `CmdOrCtrl` + `Alt`，绝不用 `Command` 或 `Option`。**

§3.6 已确证：`Command` 在 Windows/Linux 上无效，`Option` 只在 macOS 存在。**如果现在用了 `Command` 或 `Option`，将来要在 macOS 上工作就得全库搜替换**——成本不高，但容易漏。

**6. 文件监听用 chokidar（`atomic` 默认开启），不用裸 `fs.watch`。**

§3.3 已确证：裸 `fs.watch` 在 macOS 上（a）`filename` 参数不保证提供，（b）监听 inode 而非路径，删除重建后失效。**如果现在用了裸 `fs.watch`，将来在 macOS 上会遇到「重命名后监听失效」这类难诊断的问题。**

**7. 同步/索引/监听的调度不能绑在窗口生命周期上。**

§3.7 已确证：macOS 上关闭窗口不退出应用。**如果现在的实现把 `before-quit` 当作唯一的落盘点，macOS 上会丢数据。**

**8. `safeStorage` 用 async API（`encryptStringAsync` / `decryptStringAsync`）。**

§4.3 已确证：同步 API 在 Electron 46 被移除。**现在用 async 版本，将来省一次迁移。**

### B.3 明确**不是**「现在不做将来很痛」的（可以推迟）

| 项 | 为什么可以推迟 |
|---|---|
| **签名 / 公证** | 纯配置 + 环境变量。**唯一的例外是「首次发布的包会把 publish 源写死」**（`0004` §D-3）——但那是 `publish` 配置的事，与签名无关 |
| **Intel (x64) 架构** | 改一行配置（`arch: [arm64, x64]`）。且 macOS 27 已不支持 Intel（§2.5），这个需求的窗口在关闭 |
| **universal binary** | 同上，是 `mac.target` 里的一个 arch 值 |
| **`open-file` 事件处理** | 纯新增代码，不影响已有逻辑 |
| **菜单栏在 macOS 上的重排** | Electron 的 `role` 机制会自动处理大部分；且菜单是 UI 层，改起来不影响数据 |
| **`app.dock`** | 可选功能 |

---

## C. 隐藏地雷清单

> 按「意外程度 × 破坏力」排序。**每条都标了「任务假设是否成立」。**

### C.1 ⚠️⚠️⚠️ 最高优先级：macOS 26/27 上 Chromium 的 IME 死锁（未修复，全行业）

**任务假设「中文输入法是核心关注点」—— 成立，而且比预想的更严重。**

- **症状**：切换输入源时若焦点已在文本框内，输入**静默失效**，必须重启应用。**不是候选窗位置不对，是完全不能输入。**
- **根因**（[Funput PR #85](https://github.com/Funput/Funput/pull/85) 报告者原话）：macOS 26/27 上 Apple 改了 `TextInputUIMacHelper` 内部实现，Chromium 的 `NSTextInputContext` 桥接未处理新时序 → IME 的 `activate` XPC 调用与 Chromium 的 `firstRectForCharacterRange` 查询**互相死锁**。
- **影响范围**：**Chrome、VS Code、Slack、Notion、Cursor** —— 所有 Chromium 系应用。**Apple 自带 IME 也复现**（[electron#47472](https://github.com/electron/electron/issues/47472) 报告者原文：`Korean input methods tested include both the Apple default "2-Set Korean" keyboard and other third-party IMEs`）。
- **状态**：**未修复**。`runjuu/InputSourcePro#92`（PR 中引用，未独立核实）root-cause 了机制。
- **为什么是地雷**：① 它是**静默**失效（用户以为是自己输入法坏了）；② 它**不是本项目的 bug**，所以「写代码小心点」不能规避；③ 它是**系统级**的，所以「换 Electron 版本」也不能完全规避。
- **缓解（推断）**：① 跟进 Electron 版本（这类问题通常在 1-2 周内被 Electron 团队处理——见 §3.4 问题 A 的响应速度）；② **在 macOS 上实测中文输入**，且要测「切换输入源」这个具体动作；③ 应用内提供「重启应用」的快捷入口。

### C.2 ⚠️⚠️⚠️ 未签名 = 不能自动更新（硬约束，无 workaround）

**任务假设「签名对自动更新的影响是关键」—— 成立，答案是「强制」。**

- **源码级证据**：`Squirrel.Mac` 的 `SQRLUpdater.m:266` 在拿不到代码签名时，**Release 构建直接 `@throw`**（Debug 构建只禁用更新）。
- **三处官方文档独立确认**（§1.4）。
- **为什么是地雷**：它**不报错给用户**——用户看到的是「永远没有更新」，而不是「更新失败」。而 `0004` §C-6 已经把「静默失败是自动更新最危险的失败模式」记录为 Windows 侧的风险。**macOS 上是「设计性不可能」，比 Windows 的「可能静默失败」更彻底。**
- **缓解**：要么签名（档 2），要么在应用内明确说明「macOS 版需手动更新」。

### C.3 ⚠️⚠️ 「NFD 归一化破坏中文链接」这条假设**不成立** —— 但真正的风险在别处

**任务假设「macOS 会对文件名做 NFD 规范化，中文标题在 NFC/NFD 下可能产生不同的字节序列，这会不会破坏 `[[链接]]` 的匹配？」—— 答案：不会。这条地雷对中文不存在。**

**已实测的反证**（本机 Node v24.18.0）：

| 范围 | 数量 | NFC ≠ NFD 的数量 |
|---|---|---|
| CJK 基本区 U+4E00–U+9FFF | 20992 | **0** |
| CJK 扩展 A U+3400–U+4DBF | 6592 | **0** |
| CJK 兼容表意 U+F900–U+FAFF | 512 | **0** |

**官方文档的反证**（[APFS Guide FAQ](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/FAQ/FAQ.html)）：

> APFS ... **preserves both case and normalization of the filename on disk in all variants.**

> APFS preserves the normalization of the filename and uses hashes of the normalized form of the filename to provide normalization insensitivity, **whereas HFS+ stores the normalized form of the filename on disk**.

**即：NFD 是 HFS+ 的行为。** APFS（macOS 10.13 起的默认）保留归一化形式。

**但真正的风险有三条**（都是推断，需实测验证）：

1. **`normalization variants of a filename cannot be created in the same directory`（APFS 官方原文）。** 如果链接匹配用**字符串相等**而不是文件系统查找，那么「NFC 形式的文件名」与「NFD 形式的链接记录」在字符串层面不等，尽管文件系统认为它们是同一个文件。**对中文无风险**（汉字无差异），**对含重音字母的标题有风险**（`Lǔ Xùn.md` vs `Lǔ Xùn.md`）。
2. **APFS 默认大小写不敏感**（官方原文：`with case-insensitive being the default`）。与 Windows/NTFS 行为一致，所以**不是 macOS 特有的**，但在 WebDAV 服务端（Linux）会产生跨平台语义差异。
3. **electron-builder 在 v27 之前会对 `productName`/`executableName` 做 NFD 归一化**（§3.5.1 事实链四）。对本项目的 `productName`（「知己笔记」，无重音字母）无影响。

**修正建议**：把「NFD 地雷」这条从风险清单里**降级**，换成「**链接匹配必须走文件系统查找而非字符串相等**」——这条在两个平台上都成立，且现在定对成本是 0。

### C.4 ⚠️⚠️ Windows 上无法构建 macOS 产物（源码级硬阻断）

**任务假设「我理解不能，交叉编译 macOS 有硬限制，请确认」—— 确认，且比预想更硬：不是「困难」，是源码里的一条 `throw`。**

```ts
if (platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName) {
  throw new InvalidConfigurationError("Build for macOS is supported only on macOS, ...")
}
```

**注意这条检查的精确边界**：只挡 Windows，**不挡 Linux**。**推断**：Linux 上可能能出 `zip`（不含 dmg、不含签名），但对本项目的三档都无实用价值。

**缓解**：一台 Mac，或一个 macOS CI runner（public 仓库免费）。

### C.5 ⚠️⚠️ ad-hoc 签名 + hardenedRuntime = 启动崩溃（**已修复，但版本敏感**）

**这是本次调研里最隐蔽的一条，因为它看起来像「Electron 的 bug」而不是「配置问题」。**

- **症状**：`EXC_BREAKPOINT` / `SIGTRAP`，崩溃在 `CrBrowserMain`，错误信息是 `mapping process and mapped file (non-platform) have different Team IDs`。
- **根因**（[electron-builder#9396](https://github.com/electron-userland/electron-builder/issues/9396)）：electron-builder 在 26.15.0 之前会**自动**对 arm64/universal app 做 ad-hoc 签名（源码级：`fallBackToAdhoc = (arch === Arch.arm64 || arch === Arch.universal) && !this.forceCodeSigning`），而 `hardenedRuntime` 默认 `true`。ad-hoc 签名没有 Team ID，Electron 自带的 framework 有 Apple 的 Team ID → library validation 拒绝加载。
- **修复**：[PR #9822](https://github.com/electron-userland/electron-builder/pull/9822)（2026-06-02 合入 master，**2026-06-05 随 26.15.0 进入稳定线**），改为「找不到证书就完全不签名」。
- **为什么是地雷**：**它的触发条件是「你想不签名」，而修复前的默认行为恰好是「帮你签一个坏名」。** 用户以为「不配置证书 = 不签名」，实际得到的是「ad-hoc 签名 + 崩溃」。
- **缓解**：**electron-builder ≥ 26.15.0**（`latest` tag 的 26.15.3 已含）。如果必须用旧版本，显式设 `mac.identity: null` **并且** `mac.hardenedRuntime: false`（官方警告原文：`If you disable code signing, you should also disable Hardened Runtime`，因为 `unsigned plus runtime may prevent the app from launching`）。**另外不要设 `forceCodeSigning: true`**——它会把「优雅跳过签名」变成构建失败。

### C.6 ⚠️⚠️ iCloud 的「Desktop & Documents Folders」会劫持 `~/Documents`

**任务假设「macOS 上 Documents 是否有类似 Windows OneDrive 的重定向问题（iCloud Drive 的『桌面与文档』同步）」—— 有，Apple 官方功能。**

**Apple 官方原文**（[iCloud 用户指南](https://support.apple.com/guide/icloud/set-up-icloud-drive-mm203d7d3839/icloud)）：

> When you turn on Desktop & Documents Folders, your **Desktop folder and Documents folder are stored in iCloud Drive**.

**对本项目的双重风险**：

1. **与坚果云 WebDAV 形成双同步**——`0001` §5.6 已记录 SiYuan 的警告「通过第三方同步盘进行数据同步不受支持，否则可能损坏数据」。
2. **iCloud 在中国大陆不可用或不可靠**（`0001` §5.6）——所以中文用户的 `~/Documents/知己笔记/` 要么同步不上，要么与 WebDAV 打架。

**一条对本项目有利的事实（Apple 官方原文）**：

> The user implicitly grants your app access to a file in the Documents folder when selecting the file in an Open or Save panel, dragging it onto your app, or opening it in Finder. ... **In addition, if your app creates a new file in the Documents folder, the app can access that file without user consent.**

**即：本项目「应用创建笔记库」这个动作不会触发 TCC 弹窗。** 但需要 `NSDocumentsFolderUsageDescription` 兜底（Apple 原文：`The usage description is optional, but highly recommended`）。

**缓解（推断）**：默认库位置不要用 `app.getPath('documents')`。用 `~/` 下的自建目录，或首次运行让用户选。

### C.7 ⚠️ `extraFiles` 里的任何未签名文件会破坏整个签名

**任务假设未涉及，但这是「签名后才发现」的典型地雷。**

[electron-builder#2399](https://github.com/electron-userland/electron-builder/issues/2399) 里贡献者的原文：

> This error will happen if **ANY files are unsigned**. I resolved it by copying the file to the build using the `extraResources` field instead of `postPackage`. Now this extra file is signed by electron-builder and I don't have to do anything manually.

**即**：`extraFiles` 的路径**不会**被 electron-builder 签名，`extraResources` 会。**如果本项目要捆绑任何默认资源（模板、默认配置、示例笔记），必须用 `extraResources`。**

**缓解**：现在就用 `extraResources`。成本是 0。

### C.8 ⚠️ `safeStorage` 在未签名时每次更新重弹 Keychain 密码

**见 §4.3。** 对档 2/3 这条不出现（因为签名了）。对档 1 出现但影响有限（手动更新时输一次密码）。

**缓解**：档 1 时接受它；档 2 起自动消失。

### C.9 ⚠️ 关闭窗口不退出应用 —— 同步/监听必须继续运行

**任务假设「窗口行为：关闭窗口不退出应用（macOS 惯例）、`window-all-closed` 的处理」—— 确认，且它对架构有约束。**

**推断**：本项目的同步调度器、文件监听、索引更新**不能**绑在窗口生命周期上。如果现在的设计是「关窗口 → 停同步」，macOS 上会出现「用户以为在同步，实际没同步」。

**一条连带约束**：`0002` §9.5 的同步锚点写入时机**不能依赖应用退出**（因为 macOS 上可能长期不退出），必须在每次同步完成后立即落盘。

### C.10 中优先级：macOS 26 的 autofill popup churn（**已修复，但只到 Electron 41**）

**见 §3.4 问题 A。** 症状是**每次按键阻塞主进程 50–350ms**，CJK IME 用户受害最重（报告者实测：Electron 42.3.3 上 `main-process event-loop stalls >50 ms: count=37 total=4915 ms max=350 ms`，而同机 Chrome 是 `count=0`）。

**已修复**（PR #52262，backport 到 41/42/43/44）。**但没有 backport 到 40。**

**缓解**：Electron 版本下限 ≥ 41。

### C.11 低优先级：`dock.hide()` 一秒内重复调用无效

**源码级已记录的已知问题**（[dock.md](https://github.com/electron/electron/blob/main/docs/api/dock.md)）：`Calling dock.hide() within one second of a previous call will have no effect. As a workaround, ensure at least one second has elapsed between calls — for example, by deferring with a setTimeout of 1100ms or more.`

**推断**：本项目大概率不需要 `dock.hide()`。**但如果要做「关闭窗口后隐藏 Dock 图标」这种「更像后台服务」的行为——不要做**，macOS 用户会无法切回应用。

### C.12 低优先级：`macOS 27 仅 Apple Silicon` + `Rosetta 将在 macOS 27 之后移除`

**已确证**（[Apple Developer News](https://developer.apple.com/news/)）：

> macOS 26 is the final release supporting Intel Mac computers and Rosetta — macOS 27 will be Apple silicon only.
> macOS 27: Final release to support Rosetta — Intel-only apps will no longer run on Mac computers with Apple silicon after this update.

**对本项目的影响**：**只出 `arm64` 是正确的**（§2.5）。**这条不是地雷，是一条让决策变简单的信息。**

---

## D. 明确推荐

### D.1 对「Windows 为主、macOS 也想用」的单人开发者，建议哪一档？

**推荐：先做档 1，并把「要不要升到档 2」当作一个独立的、由实测触发的决策。**

**理由（逐条对应上面的查证）：**

**1. 档 1 的成本几乎为零，而且它能回答唯一真正的问题。**

档 1 的金钱成本是 0（Apple 官方明确说自用不需要注册），工作量是 1–3 天，**而且这 1–3 天里的大部分（`open-file`、窗口语义、快捷键、chokidar）是无论选哪一档都要做的**。更重要的是：**档 1 让你能在一台真实的 Mac 上验证 §3.4 的 IME 问题。**

**这是本报告的核心理由**：**在 macOS 上，唯一可能让「支持 macOS」这个决定作废的不是签名、不是打包、不是路径——是中文输入法能不能用。** 而这个问题**只能在真机上实测**。先花 99 USD 和几天配 CI，然后发现「打字会静默失效」，那 99 USD 就白花了。

**2. 「不做签名」这个决定需要修正，但不是现在。**

**它需要修正**，因为 §1.4 是一个硬约束：未签名 = macOS 上没有自动更新。这不是「体验差一点」，是「功能不存在」。

**但不是现在修正**，因为：
- 档 1 不需要自动更新（手动替换 `.app` 完全可行，且 macOS 上「拖进 Applications 覆盖」比 Windows 的「跑安装器」更简单）。
- 99 USD/年是一笔**持续**成本，而档 1 的验证结果可能让这笔钱变得没必要花（如果 IME 问题严重到决定不做 macOS）。
- 档 1 → 档 2 的迁移成本是**配置级**的（§A 的表格：+1–2 天），**不是架构级的**。**没有「现在不签名将来很痛」的东西**——除了 §B.1 里那四条与签名无关的硬约束。

**3. 但 §B.1 的四条硬约束必须现在做对。**

这四条是唯一「现在不做将来很痛」的东西，而且**全部与签名无关**：

1. **`appId` 在第一次发布前定死**（三平台共用）。
2. **默认库位置不用 `app.getPath('documents')`**（Windows 的 OneDrive 与 macOS 的 iCloud 都会劫持它）。
3. **冲突副本命名只用小写 ASCII**（APFS 默认大小写不敏感 + WebDAV 服务端可能是 Linux）。
4. **Electron 版本下限 ≥ 41**（CJK IME 的 autofill popup 修复只到 41）。

**这四条的现在成本都是 0。**

### D.2 具体的行动建议

**现在做（成本 0，避免将来的痛）：**

1. `appId` 定死（如 `com.<你>.confidant`），写进 `package.json` 的 `build` 块。
2. 默认库位置改为 `app.getPath('home')` 下的自建目录，或首次运行让用户选。**不要用 `getPath('documents')`。**
3. 冲突副本命名规范定为小写 ASCII。
4. `package.json` 里 `electron: "^44"`。
5. 快捷键全用 `CmdOrCtrl` + `Alt`。
6. 文件监听用 chokidar。
7. `safeStorage` 用 async API。
8. 同步/监听/索引的调度不绑窗口生命周期。
9. 链接匹配走文件系统查找，不走字符串相等。

**做档 1（1–3 天，需要一台 Mac）：**

10. 在一台 Apple Silicon Mac 上跑 `npm start`，**第一件事是测中文输入**——特别是「切换输入源时焦点已在 CodeMirror 里」这个动作。
11. 配置 `mac.sign.identity: null` + `mac.sign.hardenedRuntime: false`，跑 `electron-builder --mac --arm64 --dir`（`dir` target 不需要签名、不需要公证，官方 target 表已标 `Signed? No / Notarized? No`）。
12. 接 `open-file` 事件 + `window-all-closed` 的 `darwin` 分支 + `activate`。
13. 验证 chokidar 在 macOS 上的行为（特别是原子写入后的重命名）。

**档 1 验证通过后，再决定要不要做档 2：**

14. 如果「Mac 上能正常用中文写作」且「确实需要自动更新」→ 花 99 USD 注册 Apple Developer Program（个人），做档 2。
15. 如果「Mac 上能正常用中文写作」但「手动更新可接受」→ **停在档 1。** 这是完全合理的选择——Apple 官方文档明确说自用不需要注册。
16. 如果「Mac 上中文输入不可用」→ 不做 macOS，或等 Electron 上游修复（§3.4 问题 B）。

### D.3 一处需要明确纠正的预期

**不要把「macOS 也要考虑进去」理解为「要开始考虑签名」——这两件事的先后顺序是反的。**

按本报告的查证：**签名解决的是「分发」和「自动更新」，而这两件事对档 1 都不是必需的。** macOS 上真正需要先回答的问题是**「中文输入能不能用」**——而它既不需要签名，也不需要年费，只需要一台 Mac 和 30 分钟。

**如果先做签名再做实测，风险是「为一条走不通的路先付了年费」。如果先做实测再决定签名，风险是零。**

### D.4 一条对「Windows 是一等公民」这个既有决策的影响

**不需要推翻它。** 本次调研没有找到任何「macOS 支持会反过来伤害 Windows 体验」的证据：

- §B.1 的四条硬约束**对 Windows 也是改进**（`appId` 定死、库位置不依赖 `documents`、副本命名规范、Electron 版本下限）。
- §B.2 的四条**在 Windows 上同样是正确做法**（`CmdOrCtrl` 在 Windows 上就是 `Ctrl`、chokidar 在 Windows 上也优于裸 `fs.watch`、调度不绑窗口在 Windows 上也没坏处、async safeStorage 是向前兼容）。
- §3.7 的窗口语义差异是**纯增量**（`darwin` 分支）。

**即：为 macOS 做的准备工作，对 Windows 全是净收益。** 这降低了「现在就把这几条做对」的决策成本——它不需要先决定「要不要支持 macOS」。

---

## 附：本次调研中明确**未确证**的项

1. **`LSSetDefaultRoleHandlerForContentType` 在 macOS 26/27 上的可用性与沙箱限制。** Apple 官方文档页为 JS 渲染，JSON 接口对该符号返回 404。**推断**：它是公开 API、未被操作系统禁止（与 Windows 的 `UCPD.sys` 不同），但**没有一手文档确认**。
2. **TCC 授权与代码签名的耦合在 macOS 26/27 上的具体行为。** 未找到 Apple 或 Electron 的一手文档。`safeStorage` 的 Keychain 问题是同一类机制的一手证据（§4.3），但 TCC（Documents / Desktop 访问）的确切行为**未确证**。
3. **macOS 26/27 上 FSEvents 是否有新的行为变化。** 无任何一手证据。
4. **electron-builder 在 macOS GitHub runner 上的典型构建时长。** 找到 [electron-builder#9638](https://github.com/electron-userland/electron-builder/issues/9638)（`Slow Signing process in github actions on macos-latest`）但未取得其中的量化数字。**公开来源中没有权威基准。**
5. **Apple Developer Program 中国区的人民币定价。** Apple 只写「99 美元，以当地货币计费」，**未公开人民币金额**。
6. **从申请到能签名的确切周期。** Apple 只承诺「24 小时内确认」（`If you haven't received a membership confirmation within 24 hours of your purchase, contact us`），**未给审批时长**。
7. **macOS 26/27 正式版（非 beta）上 IME XPC 死锁的复现率。** Funput PR #85 标题写的是 `macOS 26/27 beta`；electron#47472 在 macOS 15.5 上就报告了同类问题。**确切的复现条件与概率未确证。**
8. **未签名的 `.dmg` 用户看到的具体警告文案。** **推断**是「应用已损坏，请移到废纸篓」而非「来自未识别的开发者」（因为 Gatekeeper 在挂载阶段校验 DMG 自身签名），但**未找到 2026 年的一手证据**。
9. **electron-builder 的 `LSHandlerRank` 默认值（`Default`）对用户默认程序选择的实际影响。** 未找到 Apple 的权威说明。
10. **在 Linux 上构建 macOS `zip` target 的实际可行性。** 源码只挡 Windows（`platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName`），**推断** Linux 上能走到打包 `.app` + `zip` 这一步，但**未实测**。
11. **`electron-rebuild` 在 better-sqlite3 v13（N-API）下是否仍然无害。** 推断无害但会白花时间。**未实测。**
12. **macOS 26/27 上是否还有本文未覆盖的 Electron 平台差异。** 本次调研的覆盖面是「任务列出的 18 个问题」，不是「macOS 的所有差异」。

## 附：核心引用

**Apple 官方**
- [Open a Mac app from an unknown developer（Mac 用户指南，含 macOS 27）](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac) —— **Open Anyway 4 步 + 一小时时效**
- [Safely open apps on your Mac（support.apple.com/en-us/102445，2026-05-27）](https://support.apple.com/en-us/102445)
- [Updates to runtime protection in macOS Sequoia（Developer News，2024-08-06）](https://developer.apple.com/news/?id=saqachfa) —— **Control-click 绕过被移除**
- [Apple Developer Program — What's included](https://developer.apple.com/programs/whats-included/) · [Enrollment](https://developer.apple.com/support/enrollment/) · [中文版 Enrollment](https://developer.apple.com/cn/support/enrollment/) —— **99 USD/年、个人可申请**
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) —— **10.15+ 强制、notarytool/stapler、`usually takes less than an hour`**
- [APFS Guide FAQ](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/APFS_Guide/FAQ/FAQ.html) —— **`preserves both case and normalization`、normalization-insensitive、case-insensitive 默认**
- [TN1150（HFS Plus Volume Format）](https://developer.apple.com/library/archive/technotes/tn/tn1150.html) —— **`HFS Plus stores strings fully decomposed and in canonical order`**
- [NSDocumentsFolderUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsdocumentsfolderusagedescription) —— **TCC Documents 权限，`the app can access that file without user consent`**
- [iCloud 用户指南 — Set up iCloud Drive](https://support.apple.com/guide/icloud/set-up-icloud-drive-mm203d7d3839/icloud) —— **Desktop & Documents Folders 把 Documents 搬进 iCloud Drive**
- [Apple Developer News（首页）](https://developer.apple.com/news/) —— **macOS 26 是最后支持 Intel 的版本；macOS 27 仅 Apple Silicon**
- [Protecting user data with App Sandbox](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox)

**Electron 官方**
- [autoUpdater（`docs/api/auto-updater.md`）](https://github.com/electron/electron/blob/main/docs/api/auto-updater.md) —— **`Your application must be signed for automatic updates on macOS. This is a requirement of Squirrel.Mac.`**
- [code-signing 教程（`docs/tutorial/code-signing.md`）](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md) —— **`macOS APIs that require code signing` 四条清单**
- [safeStorage（`docs/api/safe-storage.md`）](https://github.com/electron/electron/blob/main/docs/api/safe-storage.md) —— **同步 API 在 Electron 46 移除**
- [fuses（`docs/tutorial/fuses.md`）](https://github.com/electron/electron/blob/main/docs/tutorial/fuses.md) —— **cookieEncryption 的签名要求**
- [app（`docs/api/app.md`）](https://github.com/electron/electron/blob/main/docs/api/app.md) —— **`open-file` / `getPath` / `setAsDefaultProtocolClient`**
- [dock（`docs/api/dock.md`）](https://github.com/electron/electron/blob/main/docs/api/dock.md) —— **`dock.hide()` 一秒限制**
- [keyboard-shortcuts（`docs/tutorial/keyboard-shortcuts.md`）](https://github.com/electron/electron/blob/main/docs/tutorial/keyboard-shortcuts.md) —— **`CommandOrControl` 映射表**
- [electron#52260](https://github.com/electron/electron/issues/52260) —— **macOS 26 autofill popup churn，CJK IME 受害最重（含 Chrome 对照实测）**
- [electron#52262](https://github.com/electron/electron/pull/52262) —— **修复，backport 到 41/42/43/44**
- [electron#51557](https://github.com/electron/electron/issues/51557) · [electron#47472](https://github.com/electron/electron/issues/47472) —— **macOS IME 候选窗/韩文输入**
- [electron#53889](https://github.com/electron/electron/issues/53889) —— **macOS 27 上 `type: 'panel'` 窗口点击会激活应用（open）**
- [electron#40236](https://github.com/electron/electron/issues/40236) · [electron#43233](https://github.com/electron/electron/issues/43233) —— **safeStorage Keychain 重弹密码**

**electron-builder 官方**
- [macOS target 文档](https://www.electron.build/docs/mac) · [Code Signing for macOS（源码 md）](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/code-signing/code-signing-mac.md) · [Auto Update](https://www.electron.build/docs/features/auto-update) · [Multi Platform Build](https://www.electron.build/docs/features/multi-platform-build) · [Architecture](https://github.com/electron-userland/electron-builder/blob/master/website/docs/architecture.md)
- 源码：`packages/app-builder-lib/src/packager.ts`（**`Build for macOS is supported only on macOS`**）· `src/options/macOptions.ts` · `src/options/FileAssociation.ts` · `src/util/config/legacyOptions.ts`（**`gatekeeperAssess` 已移除**）· `templates/entitlements.mac.plist` · `templates/entitlements.mac.adhoc.plist` · `packages/dmg-builder/src/dmg.ts`
- [PR #9822（skip signing when no certificate found）](https://github.com/electron-userland/electron-builder/pull/9822) · [issue #9396（ad-hoc + hardenedRuntime 崩溃）](https://github.com/electron-userland/electron-builder/issues/9396) · [issue #2399（Squirrel.Mac requires signed application）](https://github.com/electron-userland/electron-builder/issues/2399) · [v27 Breaking Changes](https://github.com/electron-userland/electron-builder/blob/master/website/docs/migration/v27-breaking-changes.md)

**Squirrel.Mac**
- [SQRLUpdater.m（第 266 行：拿不到签名时 `@throw`）](https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLUpdater.m) · [SQRLCodeSignature.m](https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLCodeSignature.m)

**Node.js / 生态**
- [Node v24.21.0 `doc/api/fs.md` — `fs.watch` Caveats](https://github.com/nodejs/node/blob/v24.21.0/doc/api/fs.md) —— **macOS 用 kqueue(文件) + FSEvents(目录)；inode 语义；filename 不保证提供**
- [chokidar README](https://github.com/paulmillr/chokidar) —— **`atomic` 默认值、macOS 优势清单**
- [better-sqlite3 `deps/defines.gypi`](https://github.com/WiseLibs/better-sqlite3/blob/master/deps/defines.gypi) —— **`SQLITE_ENABLE_FTS5` 默认启用**
- [better-sqlite3 v13.0.0 release notes](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0) —— **N-API 迁移、prebuild 随包发布、免 electron-rebuild**

**GitHub**
- [About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) —— **macOS $0.062/分钟；public 仓库免费**
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) —— **`macos-latest` = 3-core M1 / 7GB RAM**

**其他**
- [Funput PR #85（Chromium/Electron IME breakage on macOS 26/27）](https://github.com/Funput/Funput/pull/85) —— **XPC 死锁根因分析**
- [Wikipedia: MacOS version history](https://en.wikipedia.org/wiki/MacOS_version_history) —— **macOS 15/26/27 的发布日**
