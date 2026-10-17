## 目的

定义 Linux 桌面版的发行产物、安装形态和发布门禁，使 Linux 与 macOS / Windows 一样拥有可复现、可校验的官方发行包。

### 需求: Linux 发行产物

每次桌面发行 SHALL 为 Linux 生成 AppImage 与 deb 两种格式，覆盖 x64 与 arm64 两种架构，共 4 个安装包；产物文件名 MUST 包含产品名、版本号与架构，便于用户区分。

#### 场景: 标签构建生成完整 Linux 产物

- **GIVEN** 推送了合法的发行版本标签
- **WHEN** 发行流水线完成
- **THEN** Draft Release 中包含 x64 与 arm64 的 AppImage 与 deb 各一份
- **AND** 同时包含 x64 与 arm64 AppImage 的自动更新元数据

#### 场景: 原有平台产物不受影响

- **GIVEN** 本变更前的发行产物集合（macOS ARM64 dmg / zip、Windows x64 安装包及各自元数据）
- **WHEN** 新增 Linux 构建后执行发行
- **THEN** macOS 与 Windows 产物及其元数据的名称与内容规则保持不变

### 需求: 架构支持口径

x64 SHALL 作为正式支持架构；arm64 MUST 在发行说明与发布文档中标注为"实验性支持"，并说明不承诺 16K 页内核（如 Asahi Linux）与低功耗设备上的播放性能。

#### 场景: 发行说明标注 arm64 支持级别

- **WHEN** 用户查看包含 Linux 产物的发行说明
- **THEN** 能看到 arm64 为实验性支持及其不承诺的范围

### 需求: 安装后的桌面集成

安装后的应用 SHALL 在系统应用菜单中以产品名与图标出现，并 SHALL 声明可打开受支持的视频格式（与 macOS / Windows 关联的扩展名一致）及 `.torrent` 文件。deb 安装 MUST 在安装时完成注册；AppImage MAY 依赖用户或系统集成工具完成注册。

#### 场景: deb 安装后可从文件管理器用 Marchen 打开视频

- **GIVEN** 通过 deb 安装了 Marchen
- **WHEN** 用户在文件管理器中右键一个 MKV 文件选择"打开方式"
- **THEN** 候选列表中包含 Marchen

#### 场景: deb 安装后出现在应用菜单

- **GIVEN** 通过 deb 安装了 Marchen
- **WHEN** 用户打开系统应用菜单
- **THEN** 能找到带图标的 Marchen 启动项

### 需求: 在主流发行版上可启动

x64 产物 SHALL 能在 glibc ≥ 2.31 的主流发行版（以 Ubuntu 22.04 / 24.04、Debian 12 为基准）上启动。deb 产物在 Ubuntu 24.04 上 MUST 无需用户额外配置即可在启用沙箱的情况下启动。AppImage 在系统允许时 MUST 启用沙箱；在系统限制 user namespace 时 MAY 以无沙箱模式启动以保证可用，发布文档 MUST 说明这一行为并推荐对应用户使用 deb。AppImage 缺少运行前置条件（如 libfuse2）时，发布文档 MUST 提供处理说明。

#### 场景: Ubuntu 24.04 安装 deb 后直接启动

- **GIVEN** 全新的 Ubuntu 24.04 桌面环境
- **WHEN** 用户安装 deb 并从应用菜单启动 Marchen
- **THEN** 应用主窗口正常显示，无需关闭沙箱或修改系统安全配置

#### 场景: AppImage 菜单启动不强制关闭沙箱

- **GIVEN** 系统允许非特权 user namespace（如 Ubuntu 22.04）
- **WHEN** 用户通过集成到应用菜单的 AppImage 启动项启动 Marchen
- **THEN** 应用以启用沙箱的方式运行，启动参数中不包含 `--no-sandbox`

#### 场景: AppImage 前置条件缺失时有文档可循

- **GIVEN** 系统缺少 AppImage 运行所需的 FUSE 库
- **WHEN** 用户查阅 Linux 安装说明
- **THEN** 能找到安装所需依赖或改用 deb 的明确步骤

### 需求: 最终包校验门禁

发行流水线 SHALL 在上传 Release 前校验每个 Linux 产物的最终内容：必需的播放运行时资源齐全、不包含 Source Map 或环境变量文件、原生依赖与目标架构一致、版本号与标签一致。任一校验失败 MUST 阻止发行。

#### 场景: 原生依赖架构错误阻止发行

- **GIVEN** arm64 产物中混入了 x64 的原生模块
- **WHEN** 流水线执行 Linux 最终包校验
- **THEN** 校验失败，Release 不被创建或更新

#### 场景: 资产清单校验接受 Linux 产物

- **GIVEN** Release 资产中包含完整的 Linux 产物与元数据
- **WHEN** 执行发行资产校验
- **THEN** 校验通过，且仍拒绝已停止支持的 Intel Mac 产物

### 需求: 发布前冒烟验证

发行流水线 SHOULD 在 Linux x64 构建后，于无显示环境中启动最终打包的应用，验证主窗口能加载且主进程无崩溃。

#### 场景: 打包后的应用无法启动

- **GIVEN** 打包产物在启动时崩溃
- **WHEN** 流水线执行 Linux 冒烟验证
- **THEN** 流水线失败并保留启动日志
