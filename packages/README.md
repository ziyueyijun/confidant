# packages —— Deep Modules

本仓库的功能包都是 **deep module**:小接口、大实现。包的公共表面是它的**入口点(entry points)**,即包根目录下的文件;子目录里的一切都是私有的,包外代码不得触碰。

## 布局

```
packages/
  <name>/
    index.ts        ← 入口点(公共)。包外只允许 import 这里的根文件。
    client.ts       ← 可以有多个入口点。
    lib/            ← 实现:私有,包内文件可自由互引。
    tests/          ← 测试与夹具(子文件夹,同样私有)。
```

包是扁平的:根下直接一层目录,一个目录一个包;包内部可随意嵌套,但包里不能嵌套另一个包。

## 复制起点

照抄 `packages/example/` 即可:入口点导出委托给 `lib/` 内部实现,测试只从入口点导入。

```ts
// packages/<name>/index.ts —— 入口点:对外唯一的门
import { impl } from "./lib/impl";
export function doThing(x: string): string { return impl(x); }
```

```ts
// packages/<name>/lib/impl.ts —— 藏在子目录,包外不可达
export function impl(x: string): string { /* 真正的行为 */ }
```

```ts
// packages/<name>/tests/thing.test.ts —— 和调用者走同一条缝:只从入口点导入
import { doThing } from "../index";
```

## 四条规则(全部 error,由 dependency-cruiser 强制)

1. **入口点边界**:包外代码(应用代码或其他包)只能 import 包的入口点(根文件),绝不触碰子目录里的内部实现。
2. **包内自由**:同一个包自己的文件互相 import 不受限。
3. **测试经入口点**:`tests/` 下的文件只能 import 各包的入口点以及自己的 `tests/` 夹具;任何包的子目录内部(包括自己的 `lib/`)都不能深导入。
4. **无环**:依赖图不允许循环。

**禁止 barrel**:不要造一个 index.ts 把整个子树 re-export 一遍。需要多个出口就加多个根文件入口点,保持每个入口点小而专。

## 检查

```bash
npm run lint:boundaries
```

新增或移动包后运行;规则咬住深导入时按上面的布局挪代码。
