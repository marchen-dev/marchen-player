## typescript-upgrade

TypeScript 5.5 → 6.0 升级，配套 @electron-toolkit/tsconfig 2.0 和 @types/node 25。

### 需求: TypeScript SHALL 升级到 6.0

TS 6.0 的新默认值（strict=true, target=es2025）不影响本项目，因为 tsconfig 已显式设置这些选项。

#### 场景: 类型检查通过

WHEN 执行 `pnpm typecheck`（包含 typecheck:node 和 typecheck:web）
THEN 无类型错误

### 需求: @electron-toolkit/tsconfig SHALL 升级到 2.0

tsconfig.node.json 和 tsconfig.web.json 均 extends 此包。升级后基础配置可能变化。

#### 场景: 两套 tsconfig 编译正常

WHEN 执行 `pnpm typecheck:node` 和 `pnpm typecheck:web`
THEN 均无编译错误

### 需求: @types/node SHALL 升级到 25

主进程大量使用 Node.js API（fs、child_process、Buffer 等），类型签名可能有微调。

#### 场景: 主进程代码类型检查通过

WHEN 执行 `pnpm typecheck:node`
THEN 无类型错误
