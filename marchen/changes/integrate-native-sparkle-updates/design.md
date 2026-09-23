## 背景

当前 main 使用 Electron 44、Node 24、pnpm 11、electron-builder 26；release.yml 仍直接执行 electron-vite build，包含 Linux/macOS x64 矩阵。更新逻辑位于 src/main/lib/update.ts、src/main/ipc/app.ts 及 renderer 更新 toast，下载完成被命名 installing，开发更新配置启用，缺少完整快照及失败状态。

本方案沿用讨论已确认的官方 Sparkle 原生 UI 路线；此前讨论的 Innei 静默驱动、Mac 自定义进度卡和多跳差分不再作为实现方案。参考其打包经验，不直接依赖其库。历史“本地 DMG 成功”不作为本次更新证据。

## 目标与非目标

**目标：** Mac ARM64 ad-hoc 分发、中文原生更新、可信更新包及可验证退出重启；Windows x64 保留现有底层并改善状态；完整且一致的客户端发布。

**非目标：** 通用 npm 产品、自研下载器/安装器/补丁算法、Sparkle 源码补丁、多跳差分、移动端、Mac Intel/Linux 新发行、旧用户无缝迁移、播放器内核重构、Web 部署修改、自动执行正式发布。

## 决策

### 1. 先通过安装包原型门槛

第一任务组包含最小桥接及必要打包，使用独立 bundle ID、userData、测试 Ed25519 密钥和版本源，产出 ARM64 A/B 包。在本机受控测试源完成 A → B 全量更新，采集原生窗口中文截图、最终签名检查、旧/新进程版本及重启结果。测试素材与私钥不提交，证据脱敏。

原型必须验证标准 UI 与 Electron 退出交互，以及支持异步保存屏障的官方 delegate/退出协调机制。尚未确认的 API 不按现成能力假设；若无法可靠延后退出并在保存失败时保留旧进程，则修订设计后再推进，不能改成静默强退或只记日志。测试源仅供原型，正式源只使用 HTTPS。

### 2. 本地工作区包

packages/sparkle-updater 使用 workspace 包名 @marchen/sparkle-updater，包含 TypeScript loader/types、Objective-C++ N-API addon、编译与官方下载脚本。初始化和 AppKit 操作安排到 macOS 主线程；异步结果通过受控线程安全回调返回 Node，确保退出时不访问已释放 runtime。

使用 SPUStandardUpdaterController/标准 user driver，保持 controller/delegate 生命周期。最小接口为 initialize、checkForUpdates、自动检查偏好读取/设置、安装前准备回调和必要诊断。不重建原生下载 UI。重复初始化不重复注册，非 darwin/非 arm64 返回不支持；加载失败用可判别结果而非未处理异常。

官方 Framework 与生成工具锁定相同版本和 SHA256（候选为本次调查的官方 2.10.0，实施时核对发布包与兼容性后固定）。不下载浮动 latest；普通应用构建使用官方预编译 Framework，编译本地 addon。原生编译只在 Mac 打包路径触发，不阻塞 Windows/Web 的依赖安装。

参考链接：https://sparkle-project.org/documentation/ 、https://github.com/Innei/electron-sparkle-updater 。复制参考代码时保留其许可证要求；Framework 许可证进入最终包。

### 3. UI 与平台服务边界

主进程 UpdateService 按平台选择 SparkleAdapter / WindowsUpdaterAdapter / 手动下载降级。关于页和 macOS 应用菜单调用统一检查入口；Mac 由原生窗口展示说明、下载、取消及安装，简繁中文使用官方 lproj 并声明 CFBundleLocalizations。说明是发版提供的中文文本，不承诺自动翻译。

Mac 自动检查授权及下载选择尊重官方标准 UI 和持久偏好，不强制开启后台下载/静默安装。通过锁定版本支持的 delegate 将后台交互延后至不播放时；主动检查立即显示。该能力在原型阶段验证，不得通过阻塞 UI 线程实现。桥接失败显示原因和可信 GitHub 发布页，不调用 Squirrel.Mac。

Windows 保留 electron-updater，主进程单一状态源：idle/checking/upToDate/available/downloading/preparing/ready/installing/error。IPC 提供状态快照、带递增修订号的通知及检查/下载/安装操作，renderer 先订阅后取快照并丢弃旧修订。操作去重，错误携带阶段。采用自动检查、用户触发下载与安装；autoInstallOnAppQuit=false，开发态不启用 forceDevUpdateConfig。关于页承载完整状态，toast 只做就绪轻提示，后台错误不阻塞播放。

### 4. 保存与退出屏障

更新安装请求建立单次 requestId，向 renderer 请求已有历史持久化路径立即 flush；确认数据库写入后回执。设有限超时（初始 5 秒，可由测试调整），renderer 丢失/写入失败/超时都不得伪造成功，保持或延后安装并提供可理解反馈。无活动媒体可立即确认。

保存成功后设置单次更新退出标记，释放媒体资源，协调 before-quit、window-all-closed 和 macOS 常驻行为，然后允许更新器继续。不能用普通 app.quit 替代 Sparkle 自己的安装恢复协议。用户取消安装、重试及重复回调不会重复退出。安装回调模型的确切官方 hook 在原型证据中记录。

持久化 lastSeenVersion/目标版本与当前 app.getVersion 比较，只有实际升级才显示成功；说明绑定当前版本，不取 latest 说明冒充已安装版本。Mac 原生 UI 已覆盖的提示不重复弹 toast。

### 5. 打包与签名

合并现有 files 白名单，addon 使用 asarUnpack，Framework 放在 Contents/Frameworks，保留符号链接、执行权限及辅助组件。媒体资源准备先于打包，最终资源和 Electron fuses 等修改完成后才签名，签后不再改变 bundle 内容。按官方签名要求校验嵌套组件与 Electron JIT 所需权限，不盲目用深度重签覆盖权限。

明确 ad-hoc 路径，停用当前 Apple 凭据注入和 afterSign 公证触发。DMG 用于人工安装，ZIP 用于更新，两者包含同一份已签名应用；最终提取/挂载后检查 codesign 完整性、架构、资源、无敏感构建凭据和无 source map。签名验证成功不代表通过 Gatekeeper 或完成用户安装验收。

删除 Linux/AppImage 与 Mac x64 发包、脚本和 Linux 专属死代码；保留通用 Ubuntu CI、第三方 Linux MIME/依赖及历史归档。Windows NSIS 产物及 blockmap 保持完整。

### 6. 更新源和发布编排

客户端按当前安装版本自动选择 stable/beta/alpha；stable 仅收正式版，beta 收 Beta/正式版，alpha 收三者，仅允许更高 SemVer，不提供渠道切换 UI。固定 HTTPS 元数据置于同仓库 update-feeds 分支，路径按平台/渠道隔离，包仍来自版本化 GitHub Release。旧 latest-mac.yml 不发布 ARM64 Sparkle 迁移元数据。

Ed25519 公钥可提交配置；正式私钥仅来自受控发布 secret，生成一次并安全备份，测试密钥独立。无公钥、占位公钥、缺私钥、tag/package 版本不一致或非法版本必须失败。以新版本号发版，不复用已有 v0.1.0。

Mac job 准备媒体资源、构建和 addon、打包、验证，再调用官方 generate_appcast/sign_update 工具生成全量及直接 delta；首次发布无旧基线时全量。旧基线按架构/版本筛选，不重新上传旧 ZIP。保留官方更新验签和差分失败处理，不自行降低校验；负面测试验证实际恢复行为。

Windows job 生成 NSIS、对应 latest/beta/alpha.yml、blockmap。协调 job 汇集全部新产物与监控结果，核对每个引用文件、长度及校验值，只创建/更新 draft release。人工公开后，独立发布事件或手动重跑流程从完整公开发行重建三个渠道，各取允许范围的最高版本；不得按发布时间覆盖更高版本。全部元数据在单个 Git 提交中更新。明确 contents: write，固定第三方工具版本；失败重跑保持幂等，不产生同版本不同包的静默覆盖。Sentry finalize/deploy 标记与真实发布结果协调，不在上传失败时报告完整发布。

不自动执行正式推 tag、配置远端 secrets 或公开发布。实现阶段提供具体操作说明；未配置生产凭据时可以完成测试源验证，但正式发布门槛仍标记未满足。

### 7. 验收与迁移

Mac 在隔离应用上验证中文界面、无更新、错误、有效签名、错误密钥/篡改拒绝、全量更新、官方直接差分、无基线全量、安装权限问题、保存失败和重复请求。最终通过浏览器下载包验证首次安装，记录系统、签名类型与实际 Gatekeeper 操作。

正式播放器验证正在播放时安装、暂停状态、历史保存、原生/兼容内核退出无残留声音。Windows x64 完成安装包更新与差分/全量恢复测试；缺机器标记未验证，不由 Mac 测试推导。

发布说明覆盖旧 Mac 手动迁移、ARM64 限定、Intel/Linux 旧版停更、新数据库不迁移旧记录。撤回有问题的 feed 能阻止后续分发，但不自动降级已安装应用；修复以更高版本发布，必要时提供人工恢复说明。

## 风险与权衡

- 官方框架成熟度不等于本地桥接通过；原生生命周期和签名是第一门槛。
- 使用原生 UI 后 Mac 与 Windows 外观不同，换取标准交互与更小的桥接维护面。
- 官方普通差分足够首版，下载体积改善以实际包测量，不承诺固定节省比例。
- 私钥丢失或泄露影响后续信任，必须有备份和应急迁移说明，不假设无 Developer ID 时可随意轮换。
- GitHub 网络可达性、用户安装权限和 Gatekeeper 仍影响体验；本变更不引入下载 CDN 或系统安全策略绕过。

### 8. 三渠道补充（用户确认）

版本固定 X.Y.Z、X.Y.Z-alpha.N、X.Y.Z-beta.N，tag 带 v，首发 1.0.0-alpha.0。稳定版之外标记 prerelease 且不设 Latest。升级到新版本后从新版本重新推导渠道。发布同步仅处理非 draft、标记与版本一致、两个平台及元数据完整的版本；下载/校验失败时保留已公开源，不能部分写入。没有候选的渠道发布空 Mac appcast、Windows 不发布虚假版本。旧客户端对应渠道一定有自己的已发布版本。发布顺序晚于最高版本时也不会回退。Windows 使用 generic provider 固定渠道源并明确 allowDowngrade=false，Mac 通过打包 feed 路径分流，保留原生 UI。

Mac 预发布显示版本保持 SemVer；CFBundleVersion 映射为 X.Y.Za(N+1)/X.Y.Zb(N+1)，正式版仍为 X.Y.Z。Sparkle 官方默认比较器实测无法对含连字符的 alpha.N 正确排序；自定义比较接口已弃用且不覆盖安装阶段，因此不使用该接口。采用系统约定的 a/b 构建后缀，预发布 N 限 0～254，超出时构建失败并要求推进目标版本。appcast 的 version 与 deltaFrom 使用内部构建版本，shortVersionString 保持公开版本，脚本统一映射及校验。

各渠道 feed 地址不同；官方 generate_appcast 按地址分组，直接差分仅选择同渠道旧基线，Alpha→Beta→正式版晋升使用完整包。生成器显式指定本次发行 appcast 输出名并检查文件存在，不能以工具退出码代替产物验证。
