## 目的

复用现有 `siderbarRoutes` 已按 `isWeb` 过滤的输出，让 thin sidebar 在 Web 端只渲染「视频播放」一项。本能力不引入新的过滤逻辑，仅确保 thin sidebar 的渲染逻辑正确消费 `siderbarRoutes`。

### 需求: 复用过滤后的 siderbarRoutes

sidebar MUST 使用 `@renderer/router` 导出的 `siderbarRoutes` 作为渲染源，不引入额外过滤；该数组在 Web 下已自动剔除 `LIBRARY`。

#### 场景: Web 用户查看 sidebar

- **GIVEN** 当前在浏览器中（`window.electron` 为 undefined）
- **WHEN** sidebar 渲染
- **THEN** nav 列表 SHALL 仅含「视频播放」一个 icon
- **AND** SHALL 不出现「影视库」icon

#### 场景: Electron 用户查看 sidebar

- **GIVEN** Electron 桌面端
- **WHEN** sidebar 渲染
- **THEN** nav 列表 SHALL 同时含「视频播放」与「影视库」两个 icon
