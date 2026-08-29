## 目的

为本地开发、CI、Electron 构建和 Web 构建提供一致的现代工具链基线。

### 需求: 本地与 CI 使用一致的运行基线

项目 MUST 明确声明受支持的 Node 与包管理器版本，并使所有 CI workflow 使用同一 major 基线。

#### 场景: 新环境安装依赖

- **GIVEN** 开发者或 CI 在干净环境中检出项目
- **WHEN** 按项目声明的工具版本安装依赖
- **THEN** 安装 MUST 使用确定的包管理器 major 和锁文件
- **AND** 不得出现运行时版本低于直接依赖最低要求的情况

### 需求: Electron 与 Web 构建链兼容

项目 MUST 使用彼此声明兼容的构建器、Vite、React 插件和 TypeScript 版本组合。

#### 场景: 执行双端生产构建

- **GIVEN** 依赖已按目标矩阵安装
- **WHEN** 分别执行 Electron 与 Web 生产构建
- **THEN** 两个构建 MUST 成功完成
- **AND** 不得留下未解释的 peer dependency 不兼容

### 需求: 类型检查覆盖所有工作区

升级后的工具链 MUST 保持 Node、Web 以及 workspace 包的类型检查能力。

#### 场景: 执行项目类型检查

- **GIVEN** 所有依赖迁移已完成
- **WHEN** 执行项目标准类型检查命令
- **THEN** Node 与 Web 类型检查 MUST 全部通过
- **AND** 不得通过跳过错误或扩大不安全类型来规避迁移问题
