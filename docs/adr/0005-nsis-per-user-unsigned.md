# 分发形态：NSIS per-user 安装包，不做代码签名

应用以 **NSIS per-user 安装包**分发（装到 `%LOCALAPPDATA%\Programs\`），**不做代码签名**，更新包托管在 GitHub Releases。

这个形态**不是选出来的，是推出来的**——需求（文件关联 + 自动更新）把其它形态全部排除：**portable（免安装）做不到这两件事**，源码里两处硬排除（`isWriteUpdateInfo: !this.isPortable` 不产出更新元数据；在 `fileAssociations` 处理前 `if (this.isPortable) return`，**静默忽略无警告**）；**per-machine 会弹 UAC**（`isAdminRightsRequired = true`），而 **per-user 免 UAC 正是安静自更新的前提**。

不做签名意味着安装时会有 SmartScreen 警告（"未知发布者"）。这在「自己给自己装」的场景下可接受，而代码签名证书每年数百到上千元。

**两条必须提前知道的约束**：

1. **`appId` 一旦发布不能改**（官方口径），且自 electron-builder v27 起它还决定文件关联的 ProgID。改了就装成两个应用。
2. **`publish` 配置会写进 `app-update.yml` 成为永久更新源**——已装出去的旧版本无法自动迁移到新地址。因为第一版的更新对象只有作者本人一台机器，实际影响很小，但结论要记准：发布前定好，之后改就要手动重装。

**一条正在关闭的窗口**：未签名目前能自动更新（源码 `if (publisherName == null) return null` 静默跳过校验），但 master 注释明确写 **v28 会转为 fail-closed**。锁定的版本可一直用，将来升级 `electron-updater` 会被卡住。

## 相关

源码级证据：`docs/research/0006-windows-集成与更新.md`
仍待实测：electron-updater 下载的安装包是否附加 MOTW、是否触发 SmartScreen
