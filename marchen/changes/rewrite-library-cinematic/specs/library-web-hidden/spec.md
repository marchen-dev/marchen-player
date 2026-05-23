## 目的

在 Web 平台（非 Electron）下让 library 路由完全不可达。原因：library 的数据来源是"播放本地视频时自动入库"，Web 端不能访问本地视频，library 永远为空，不应作为可见入口。

### 需求: Sidebar 隐藏 library 入口

Sidebar 渲染时 MUST 在 `isWeb === true` 时过滤掉 `LIBRARY` 路由项，不渲染对应导航 NavLink。

#### 场景: Web 用户查看 sidebar

- **GIVEN** 当前运行在浏览器中（`window.electron` 为 undefined）
- **WHEN** Sidebar 渲染
- **THEN** 导航列表 SHALL 只含「视频播放」一项
- **AND** SHALL 不出现「影视库」入口

#### 场景: Electron 用户查看 sidebar

- **GIVEN** 当前运行在 Electron 桌面端
- **WHEN** Sidebar 渲染
- **THEN** 导航列表 SHALL 同时包含「视频播放」与「影视库」

### 需求: 直接访问 URL 重定向

Web 端用户若手动输入或粘贴 `/#/library` URL，路由 MUST 重定向到 `/#/player`（不渲染任何 library 内容，也不显示 404）。

#### 场景: Web 用户访问 library URL

- **GIVEN** 当前在浏览器中
- **WHEN** 用户访问 `https://marchen-play.suemor.com/#/library`
- **THEN** 路由 SHALL 自动重定向到 `/#/player`
- **AND** library 组件 SHALL 不被实例化

#### 场景: Electron 用户访问 library URL

- **GIVEN** 当前在 Electron 中
- **WHEN** 用户访问 `/#/library`
- **THEN** library 页面 SHALL 正常渲染
