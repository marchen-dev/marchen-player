## 目的

为 library 路由提供一套作用域隔离的视觉 token 体系：accent 红橙、4 级灰阶 ramp、玻璃叠加层、状态色。同时支持 light/dark 两套主题，token 不污染全局 shadcn 体系。

### 需求: Token 作用域隔离

所有 library 专用 token MUST 仅在 `[data-page="library"]` 作用域下生效，不影响其他路由。

#### 场景: 进入 library 页面 token 生效

- **GIVEN** 用户在 player 路由（无 `data-page="library"`）
- **WHEN** 切换到 library 路由
- **THEN** library 顶层节点上 `var(--library-accent)` SHALL 解析为红橙色
- **AND** sidebar、设置窗等节点上同一变量名 SHALL 未定义或保持原 shadcn 值

#### 场景: 离开 library 后 token 不外溢

- **GIVEN** 用户在 library 页面
- **WHEN** 切换到 player 路由
- **THEN** 全局 `--primary`、`--background` 等 shadcn token SHALL 与原值一致
- **AND** player 路由内的按钮颜色 SHALL 不变红

### 需求: light 与 dark 两套主题

token 体系 MUST 同时定义 light 与 dark 两套值，跟随项目全局主题切换（next-themes 的 `class="dark"`）。

#### 场景: 用户切换到 dark 主题

- **GIVEN** 用户在 library 页面，当前 light 主题
- **WHEN** 用户在设置中切换到 dark
- **THEN** `<html>` 上 SHALL 出现 `class="dark"`
- **AND** library 页面的 `--library-bg`、`--library-fg`、`--library-glass` 等 token 值 SHALL 切换到 dark 配色

#### 场景: 用户切换到 light 主题

- **GIVEN** 用户在 library 页面，当前 dark 主题
- **WHEN** 用户切换到 light
- **THEN** library token SHALL 全部切换到 light 配色（玻璃感弱化、scrim 更亮）
- **AND** 切换 SHALL 即时生效，无需刷新

### 需求: 灰阶 ramp 与玻璃叠加层

token MUST 提供至少 4 级 foreground 灰阶（fg, fg-2, fg-3, fg-4）与 3 级 panel 灰阶（panel, panel-2, panel-3），以及 glass / scrim 半透明叠加层，以支撑设计稿的信息密度。

#### 场景: 卡片与背景层次分明

- **GIVEN** library 在 dark 主题下渲染
- **WHEN** 用户查看 TopBar、Chips、PosterCard、ConfirmDialog
- **THEN** 各层 SHALL 使用不同 panel/glass token，呈现出 4 级或以上的视觉层次
