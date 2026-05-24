## 目的

替代旧 sidebar 内 `UpdateProgress` 的全局 toast 适配器。监听 `updateProgressAtom`，downloading 时弹进度 toast，ready 时弹含「安装新版本」action 的 toast。

### 需求: 下载中弹进度 toast

`updateProgressAtom` 状态为 `downloading` 时 MUST 弹出一条持续 toast：标题「正在下载新版本」，描述含百分比；进度变化时 SHALL 更新同一条 toast 的描述而非反复弹新 toast。

#### 场景: 下载开始

- **GIVEN** 应用检测到新版本，开始下载
- **WHEN** `updateProgressAtom.status === 'downloading'`，progress 由 0 变 5
- **THEN** 一条「正在下载新版本」toast SHALL 出现
- **AND** toast 描述 SHALL 显示「5%」

#### 场景: 下载进度变化

- **GIVEN** 进度 toast 正在显示，progress 当前 5
- **WHEN** progress 更新为 50
- **THEN** 同一条 toast 的描述 SHALL 更新为「50%」
- **AND** SHALL 不出现第二条 toast

### 需求: 下载完成弹 ready toast

`updateProgressAtom` 切换到 ready 态时 MUST 替换前一条进度 toast 为新 toast：标题「新版本已就绪」，含「安装新版本」action 按钮；点击按钮 MUST 调用 `ipcClient?.app.installUpdate()`，并先把 `showUpdateNote: true` 写入 localStorage（与旧 UpdateProgress 行为一致）。

#### 场景: 下载完成

- **GIVEN** 进度 toast 正在显示
- **WHEN** `updateProgressAtom.status` 变为 ready
- **THEN** 进度 toast SHALL 被替换为「新版本已就绪」toast
- **AND** toast 上 SHALL 有一个「安装新版本」action 按钮

#### 场景: 用户点击安装

- **GIVEN** 「新版本已就绪」toast 显示中
- **WHEN** 用户点击「安装新版本」按钮
- **THEN** localStorage 中 app 设置的 `showUpdateNote` SHALL 写入 true
- **AND** `ipcClient?.app.installUpdate()` SHALL 被调用

### 需求: 仅在 Electron 桌面端生效

update-toast hook MUST 仅在 Electron 环境挂载；Web 端不存在 auto-update，故不挂载。

#### 场景: Web 环境

- **GIVEN** 应用运行在浏览器中
- **WHEN** 应用初始化
- **THEN** update-toast hook SHALL 不订阅 `updateProgressAtom`
