# 手写 IPC，不用 electron-trpc

主进程与渲染进程之间的 IPC 用**手写的 `contextBridge` 白名单 + `shared/` 里的共享类型 + Zod 边界校验**，不用 `electron-trpc`。

表面上这像是重复造轮子——`electron-trpc` 提供的编译期类型安全确实更强。但查证发现：**`jsonnull/electron-trpc`（402 stars，该方案的主流实现）最新发版是 2024-12-07，已近两年没有新版本**；另一个 `makp0/electron-trpc-experimental` 只有 14 stars。把「单人项目最容易积累技术债的地方」押在一个停更的第三方库上，风险大于收益。

**换来的是运行时校验**，这比编译期保证更实在：手写方案的唯一真问题是「类型声明可能与主进程的实际实现脱节」，而**在 IPC 边界用 Zod 校验同时挡住了运行时数据**——那是 TypeScript 管不到的地方（比如外部编辑器改坏的 frontmatter）。一份 schema 定义，既校验又推导类型。

代价：需要手写约几十个方法定义，且新增 IPC 方法时要同时改 schema 与实现（Zod 校验会在不一致时立刻报错，而不是在别处炸掉）。

## 相关

技术栈全貌与其余决策见 issue [#15](https://github.com/ziyueyijun/confidant/issues/15)
