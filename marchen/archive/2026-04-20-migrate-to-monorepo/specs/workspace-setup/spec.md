### 需求: 项目 SHALL 配置 pnpm workspace 管理 packages 目录

#### 场景: pnpm-workspace.yaml 正确配置
WHEN 项目根目录存在 `pnpm-workspace.yaml`
THEN 包含 `packages: ["packages/*"]` 配置

#### 场景: workspace 包可被主项目引用
WHEN 根 package.json 添加 `@marchen/electron-ipc: "workspace:*"` 和 `@marchen/shared: "workspace:*"`
THEN pnpm install 后可正常解析这些包

### 需求: electron-vite 构建 SHALL 正确解析 workspace 包的源码

#### 场景: main 进程构建能解析 @marchen/electron-ipc/main
WHEN 运行 electron-vite build
THEN main 进程的 bundle 包含 electron-ipc 包的代码

#### 场景: renderer 构建能解析 @marchen/shared 的导出
WHEN 运行 vite build（web 版）或 electron-vite build（electron 版）
THEN renderer 的 bundle 包含 shared 包的代码

### 需求: tsconfig SHALL 正确配置 paths 映射到 workspace 包

#### 场景: tsconfig.node.json 不再 include renderer 源码
WHEN 检查 tsconfig.node.json 的 include
THEN 不包含 `src/renderer/` 下的任何路径

#### 场景: tsconfig.web.json 不再 include main 源码
WHEN 检查 tsconfig.web.json 的 include
THEN 不包含 `src/main/` 下的任何路径

### 需求: electron-builder 打包 SHALL 排除 packages 源码目录

#### 场景: 构建产物不包含 packages 源码
WHEN electron-builder 打包应用
THEN asar 中不包含 `packages/` 目录的源文件
