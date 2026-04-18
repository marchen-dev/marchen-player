## batch-safe-upgrade

安全批次依赖升级，覆盖 React、状态管理、UI 组件库、监控、工具库等 ~60 个依赖。

### 需求: 所有安全批次依赖 SHALL 升级到最新版本

升级范围包括但不限于：

- react, react-dom 及其类型定义
- jotai, @tanstack/react-query
- @radix-ui/\* 全家桶
- framer-motion（alpha → stable）
- @sentry/react（8 → 10）
- lucide-react（0.x → 1.x）
- dexie, dexie-react-hooks
- react-router, ofetch, dayjs, zod 等

#### 场景: 升级后 Desktop 开发服务器正常启动

WHEN 执行 `pnpm dev`
THEN Electron 窗口正常打开，无运行时错误

#### 场景: 升级后 Web 开发服务器正常启动

WHEN 执行 `pnpm dev:web`
THEN Web 页面在 localhost:1106 正常加载

### 需求: lucide-react v1 的 icon 重命名 SHALL 被适配

`AlertCircle` 在 v1 中被重命名为 `CircleAlert`。

#### 场景: 侧边栏更新提示 icon 正常渲染

WHEN 侧边栏显示更新提示
THEN `CircleAlert` icon 正常渲染，无导入错误

### 需求: @sentry/react v10 的 API SHALL 保持兼容

当前使用的 API（reactRouterV7BrowserTracingIntegration、replayIntegration、captureConsoleIntegration 等）在 v10 中保持兼容，无需代码改动。

#### 场景: Sentry 初始化无报错

WHEN 应用启动（非 dev 模式）
THEN Sentry.init() 正常执行，无 API 不兼容错误
