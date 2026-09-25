# 用 Electron，不用 Tauri

外壳选 Electron（只支持 Windows）。Tauri 的安装包小一个数量级，所以这个选择表面上反直觉——但 Tauri 有一个直接命中笔记软件核心场景的未修复 bug：Windows 上聚焦**已有内容**的编辑器时 WebView2 冻结 Windows TSF，**中文输入法打不开候选窗、按键被吞**（空输入框不受影响）。即「打开一篇旧笔记继续写」会坏掉，所有已知 workaround 均无效（[tauri#15436](https://github.com/tauri-apps/tauri/issues/15436)）。另有一个结构性风险：tao 的 Windows IME 死锁修复已合入 0.36，但 Tauri 2 稳定线锁在 `tao ^0.35` 拿不到，触发场景包括睡眠唤醒后主线程永久死锁（[tao#1349](https://github.com/tauri-apps/tao/issues/1349)）。同期最接近的参照物 note-gen 的 issue 区正是 IME 问题重灾区。代价是安装包 80–150MB；但「Tauri 更省内存」是误解——Windows 上它同样是 Chromium 内核，内存同量级。

## 相关

详细证据：`docs/research/0001-技术事实基础.md` §1
