## 目的

定义 Linux 桌面版如何获知并安装新版本，以及渠道源发布如何在新增 Linux 平台后保持对历史版本和既有平台的兼容。

### 需求: AppImage 自动更新

以 AppImage 运行的 Linux 应用 SHALL 按安装版本所属渠道（稳定 / Beta / Alpha）检查更新，只升级到允许渠道内的更高版本，规则与 Windows 一致。用户 SHALL 可以在"关于"中查看检查、下载进度、可安装和失败状态，并手动触发安装。

#### 场景: 稳定版 AppImage 发现新稳定版

- **GIVEN** 用户运行稳定版 AppImage 1.1.0，稳定渠道最新为 1.2.0
- **WHEN** 应用检查更新
- **THEN** "关于"中显示可更新到 1.2.0
- **AND** 用户可下载并在安装后以新版本重新启动

#### 场景: 稳定版不升级到预发布版本

- **GIVEN** 用户运行稳定版 AppImage 1.1.0，Beta 渠道最新为 1.2.0-beta.1，稳定渠道无更高版本
- **WHEN** 应用检查更新
- **THEN** 显示已是最新版本

#### 场景: 架构匹配

- **GIVEN** 用户运行 arm64 AppImage
- **WHEN** 应用下载更新
- **THEN** 下载的是同版本 arm64 AppImage，而非 x64

### 需求: 更新安装前保存播放状态

AppImage 安装更新并重启前 MUST 与 Windows 一样先完成播放进度保存；保存失败时 MUST 中止安装并提示用户。

#### 场景: 播放中安装更新

- **GIVEN** 用户正在播放视频且更新已下载完成
- **WHEN** 用户点击安装更新
- **THEN** 当前播放进度写入历史后应用才退出并替换
- **AND** 若保存失败，应用不退出并显示"播放进度未保存"的提示

### 需求: deb 安装的更新提示

以 deb 安装的应用 SHALL NOT 在应用内下载或替换自身；当所属渠道有更高版本时，SHALL 在"关于"中显示新版本号，并提供前往下载页的入口。

#### 场景: deb 用户发现新版本

- **GIVEN** 用户通过 deb 安装了稳定版 1.1.0，稳定渠道最新为 1.2.0
- **WHEN** 应用检查更新
- **THEN** "关于"中显示有新版本 1.2.0，并提供打开下载页的按钮
- **AND** 不出现应用内下载进度或"安装更新"按钮

#### 场景: deb 用户已是最新

- **GIVEN** deb 安装版本等于渠道最新版本
- **WHEN** 应用检查更新
- **THEN** 显示已是最新版本

### 需求: 渠道源对 Linux 元数据可选

渠道源发布 SHALL 把 Linux 视为可选平台：当某渠道选中的 Release 缺少 Linux 更新元数据（例如 Linux 恢复支持前的历史版本）时，该渠道的 Linux 源 MUST 为空（客户端视为无可用更新），而 macOS 与 Windows 源 MUST 照常发布。当 Linux 元数据存在但不完整或地址不合法时，发布 MUST 失败，避免发布错误的更新源。

#### 场景: 历史稳定版没有 Linux 元数据

- **GIVEN** 稳定渠道最新 Release 不含任何 Linux 产物，Alpha 渠道最新 Release 含完整 Linux 产物
- **WHEN** 发布渠道源
- **THEN** macOS 与 Windows 的稳定 / Alpha 源正常更新
- **AND** Linux 稳定源为空，Linux Alpha 源指向该 Alpha 版本

#### 场景: Linux 元数据残缺

- **GIVEN** 某 Release 含 x64 Linux 更新元数据但缺少其引用的 AppImage
- **WHEN** 发布渠道源
- **THEN** 发布失败，远端渠道源保持原状

### 需求: 渠道切换与平台隔离

Linux 更新源 MUST 与 macOS / Windows 更新源相互独立；新增 Linux 源不得改变既有平台客户端读取的更新地址与内容格式。

#### 场景: 已发布的 Windows 客户端不受影响

- **GIVEN** 已安装的 Windows 客户端使用现有更新地址
- **WHEN** 发布包含 Linux 源的新渠道源
- **THEN** Windows 客户端读取到的元数据格式与地址不变，可正常更新
