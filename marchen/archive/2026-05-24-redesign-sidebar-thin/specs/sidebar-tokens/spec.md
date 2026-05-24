## 目的

sidebar 专属视觉 token。dark 主题用 rgba 玻璃 + backdrop-blur，light 主题用纯白面 + 细边线，跟随项目 next-themes 全局切换。

### 需求: light / dark 双套 token

token 体系 MUST 同时定义 light 与 dark 两套值，并跟随 `<html>` 上的 `.dark` class 切换。

#### 场景: 用户切到 dark 主题

- **GIVEN** sidebar 渲染中，当前 light 主题
- **WHEN** 用户在设置中切换到 dark
- **THEN** sidebar 背景 SHALL 切换为半透明深色玻璃
- **AND** nav icon 颜色 SHALL 切换为浅色 foreground
- **AND** brand-mark 阴影/边缘细节 SHALL 切换为 dark 对应值

#### 场景: 用户切到 light 主题

- **GIVEN** dark 主题下
- **WHEN** 切换到 light
- **THEN** sidebar 背景 SHALL 变为纯白
- **AND** 与主区之间 SHALL 有一道细灰色边线区分

### 需求: 不污染全局

sidebar 专用 token MUST 以 `--sidebar-*` 命名（或类似前缀），SHALL 不与 shadcn 全局 `--background` / `--foreground` 等命名冲突。

#### 场景: 进入非 sidebar 区域

- **GIVEN** sidebar 渲染中
- **WHEN** 用户查看主区元素
- **THEN** 主区内的 shadcn 组件 SHALL 仍使用全局 `--background` / `--foreground`，颜色不受 sidebar token 影响
