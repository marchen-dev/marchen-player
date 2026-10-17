## 背景

- Linux 曾以 AppImage（x64 / arm64）发行，`329134c2` 引入 Sparkle 与分渠道发布时被移除，同时删除了 `src/main/initialize/flag.ts`（Linux VA-API 硬解开关的三次尝试，注释记录了 Wayland 下 GPU 进程无法启动）。
- 当前发布链路：`release.yml` matrix 只有 `macos-latest`（darwin-arm64）与 `windows-latest`（win32-x64）；`verify-assets.mjs` 在出现 `AppImage|linux` 时直接报错；`channel-feeds.mjs` 的 `normalizeRelease` 对每个 Release 强制要求 Windows 元数据、Mac appcast 与 dmg。
- 更新：`src/main/lib/update.ts` 中 mac 走 Sparkle，Windows 走 `electron-updater`（generic feed，`updateFeedURL('windows', channel)`，安装前经 `UpdateSaveBarrier` 保存播放状态），其他平台 `platform: 'unsupported'` 直接返回。渲染端 `About.tsx` / `use-update-toast.ts` 只在 `platform === 'windows'` 时展示更新 UI。
- 主进程平台分支：`initialize/index.ts` 只在 `isWindows` 注册 `second-instance`；`windows/main.ts` 的 `default` 分支已给 Linux 原生标题栏 + 图标；`env.ts` 无 `isLinux`。
- 渲染端：`Prepare.tsx` 在 `!isWeb && !isWindows` 时叠加 48px 透明 `drag-region`（为 mac hiddenInset 设计）；历史 / 影视库右键菜单文案只区分 Windows 与 Finder。
- 原生依赖（已核实）：`node-datachannel@0.32.3` 由 `prebuild-install` 按宿主架构下载 napi-v8 预编译包，GitHub Release 含 linux-x64 / linux-arm64，二者最高依赖 GLIBC_2.30；`bufferutil` / `utf-8-validate` 为 bittorrent-tracker 的可选依赖且无 linux-arm64 prebuild（ws 以 try/catch 加载，失败回退 JS）；`utp-native` 虽被 pnpm `allowBuilds: false` 禁止安装期编译，但 `postinstall` 的 `electron-builder install-app-deps` 会按 Electron ABI 从源码重编（已在 1.0.6 mac 正式包中确认存在 `utp_native.node`），Linux runner 自带编译工具同样会编出宿主架构产物，编译失败时 webtorrent 以 try/catch 降级；`fs-native-extensions` 有 linux 双架构 prebuild；`bare-*` 只在 Bare 运行时的 `imports` 条件下加载。
- 遥测：main 端 Sentry 已带 `platform` / `arch` tag，`dist` 默认 `${platform}-${arch}`，Linux 天然得到 `linux-x64` / `linux-arm64`。
- 验收环境：开发机为 Apple Silicon（arm64），只有虚拟机。arm64 Linux 虚拟机可原生虚拟化；x64 Linux 只能全指令模拟，无法评估播放性能。
- 本地 AI（node-llama-cpp）已移至 `feat/local-ai-match-hint` 分支，不纳入本设计。

## 目标与非目标

**目标：**

- Linux x64（正式）与 arm64（实验性）的 AppImage + deb 进入官方发行流水线，具备最终包校验与冒烟门禁。
- AppImage 自动更新复用 Windows 的 `electron-updater` 路径与保存屏障；deb 只做更新检查与下载页提示。
- 渠道源把 Linux 作为可选平台，历史 Release 缺 Linux 元数据不影响 mac / win。
- 修复 Linux 文件打开、顶部点击、平台文案三处行为问题。
- 文档、发行说明、CLAUDE.md 口径同步；产出 change evidence。

**非目标：**

- Linux 硬件解码调优（VA-API 开关、ANGLE 后端选择）；不恢复 `flag.ts`。可作为后续实验室开关另立变更。
- Flatpak / Snap / AUR / rpm 等其他分发渠道；deb 的应用内自动安装（DebUpdater + pkexec）。
- Linux 自绘标题栏 / 无边框窗口；armv7、musl 发行版。
- 本地 AI 在 Linux 上的打包。
- 任何移动端或触控适配。

## 决策

### 1. 产物矩阵：AppImage + deb × x64 + arm64，各架构用原生 runner 构建

```
release.yml matrix
  macos-latest        darwin-arm64   --mac   --arm64   (不变)
  windows-latest      win32-x64      --win   --x64     (不变)
  ubuntu-latest       linux-x64      --linux --x64     → AppImage, deb, latest-linux.yml
  ubuntu-24.04-arm    linux-arm64    --linux --arm64   → AppImage, deb, latest-linux-arm64.yml
```

- **为什么原生 runner 而不是交叉构建**：`node-datachannel` 在 `pnpm install` 时按宿主架构下载二进制，且 `npmRebuild: false`；在 x64 上交叉打 arm64 会把 x64 `.node` 打进 arm64 包。原生 runner 让安装、打包与冒烟都在目标架构上进行，最简单可靠。`ubuntu-24.04-arm` 对公开仓库免费。
- **为什么 AppImage + deb**：AppImage 是 `electron-updater` 最成熟的 Linux 自动更新载体，跨发行版；但在 Ubuntu 22.04+ 默认缺 `libfuse2`，Ubuntu 24.04 的 AppArmor 限制非特权 user namespace 导致 Chromium 沙箱启动失败。deb 覆盖最大的 Ubuntu / Debian 用户群，安装脚本可处理沙箱，并在安装时注册 `.desktop` 与 MIME。两者互补。
- `electron-builder.yml` 新增 `linux`（`executableName`、`category: AudioVideo`、`maintainer`、`icon`、`mimeTypes`、`fileAssociations`、`desktop` 条目）、`appImage`、`deb` 段；`artifactName` 统一 `${productName}-${version}-${arch}.${ext}`。deb `depends` 使用 electron-builder 默认集合，必要时补充。
- arm64 的"实验性"口径落在发行说明与 `docs/desktop-release.md`，不在客户端 UI 中区分。

### 2. Ubuntu 24.04 沙箱：deb 走安装脚本，AppImage 探测回退并文档化

- electron-builder 生成的 deb 安装脚本负责 `chrome-sandbox` 权限。实现阶段已核实 `app-builder-lib@26.15.3` 的 `templates/linux/after-install.tpl`：内核支持 user namespace 时 `chrome-sandbox` 设为 0755、否则 SUID 4755；AppArmor 启用且支持 abi/4.0（Ubuntu 24+）时把内置 `apparmor-profile` 安装到 `/etc/apparmor.d/<executableName>` 并加载，22.04 自动跳过。因此不写自定义 `afterInstall`，实机行为在 24.04 验收中确认。
- **应用自身不加 `--no-sandbox`**。AppImage 沿用 electron-builder legacy FUSE2 toolset 的 AppRun：启动前以 `unshare -Ur true` 探测 user namespace，失败时才追加 `--no-sandbox`（Ubuntu 24.04 默认会走到这条路径）；同时把 `appImage.executableArgs` 设为空，去掉上游在 `.desktop` Exec 中写死的 `--no-sandbox`，避免集成到菜单后在所有系统上都无沙箱。
- 权衡（已与用户确认）：严格不降级会让 AppImage 在 Ubuntu 24.04 上无法启动，且需要自维护 AppRun；完全沿用上游则菜单启动始终无沙箱。选择"能开则开、系统不允许时降级"，并在 Linux 安装 FAQ 中说明 AppImage 在 24.04 上为无沙箱运行、推荐 Ubuntu 用户使用 deb（deb 安装 AppArmor profile，始终启用沙箱）。libfuse2 问题同样写入 FAQ。

### 3. 更新：Linux 分支复用 Windows 路径，按安装形态分流

```
autoUpdateInit()
  ├─ darwin arm64        → Sparkle（不变）
  ├─ win32               → electron-updater，可下载/安装（不变）
  └─ linux
       ├─ APPIMAGE 环境变量存在 → electron-updater，可下载/安装，platform: 'linux'
       └─ 否则（deb）          → electron-updater 仅 checkForUpdates，platform: 'linux-manual'
                                  autoDownload=false，UI 不提供下载/安装，只给下载页
```

- `DesktopUpdateState.platform` 扩展为 `'mac' | 'windows' | 'linux' | 'linux-manual' | 'unsupported'`。`linux` 在 UI 上与 `windows` 共用同一套状态展示与安装按钮；`linux-manual` 只展示"有新版本 x.y.z"和"打开下载页"（`shell.openExternal` 到对应 GitHub Release tag 页）。
- 安装形态判断用 `process.env.APPIMAGE`（AppImage 运行时注入，`electron-updater` 自身也用它选择 AppImageUpdater）。
- **为什么 deb 也用 electron-updater 检查而不是自己请求**：复用同一份 `*-linux*.yml`、同一套渠道与 `canUpdateTo` 规则，避免第二套版本比较；只是不调用 `downloadUpdate`。
- AppImage 安装沿用 `UpdateSaveBarrier` + `quitAndInstall`，保存失败时中止，与 Windows 行为一致。
- `updateFeedURL` 增加 `'linux'`：`${UPDATE_FEED_ROOT}/linux/${channel}/`。electron-updater 在该目录下读取 `${channel}-linux.yml`（x64）或 `${channel}-linux-arm64.yml`（arm64），架构天然隔离；稳定渠道文件名为 `latest-linux*.yml`，与 Windows `latest.yml` 命名规则一致（复用 `channel === 'stable' ? 'latest' : channel`）。
- `use-update-toast.ts` 的"更新已就绪"提示扩展到 `linux`。

### 4. 渠道源：Linux 为可选平台，存在即严格校验

```
normalizeRelease(release)
  windows / mac：requireAsset（不变，缺失即失败）
  linux（x64、arm64 分别处理）：
     元数据不存在           → 该架构 linux 源为空
     元数据存在             → 版本一致、files 非空、引用的 AppImage 资产存在且地址合法，否则失败
                             files[].url / path 改写为 GitHub Release 绝对地址（同 Windows）
buildChannelFeeds
  files['linux/<channel>/<channel|latest>-linux.yml']        （有则写）
  files['linux/<channel>/<channel|latest>-linux-arm64.yml']  （有则写）
```

- **"空"的表达**：渠道源分支上不存在对应 yml 时，electron-updater 会得到 404 并报错。为避免 Linux 用户在历史渠道上看到"检查失败"，Linux 客户端把**更新元数据 404** 视为"已是最新"处理（仅 Linux 分支，Windows 行为不变）。备选方案是写一个 `version` 等于空的占位 yml，但 electron-updater 对其解析行为不可控，不采用。
- `channels.json` 结构不变（仍是渠道 → 版本），避免影响 `update-channels.yml` 的部署记录步骤。
- 历史渠道的 mac / win 源与当前产物完全相同，用 `channel-feeds.test.mjs` 增加"含 / 不含 Linux 元数据"的快照用例证明。

### 5. 资产与最终包校验

- `verify-assets.mjs`：必需清单按平台组织，加入 4 个 Linux 安装包与 2 个 Linux 元数据；拒绝规则从 `/AppImage|linux|.../` 改为只拒绝 Intel Mac（`x64.dmg`、`mac.zip` 非 arm64 等）与 `latest-mac.yml`。
- 新增 `scripts/desktop/verify-linux.mjs`（与 `verify-mac.mjs` / `verify-windows.mjs` 对称）：
  - 解包 AppImage（`--appimage-extract`）与 deb（`dpkg-deb -x`），读取 `app.asar`，复用 `verifyPackageResources` 检查播放运行时资源与 Source Map / env 文件。
  - 用 `file` 或解析 ELF 头校验所有 `.node` 与主可执行文件的机器类型与目标架构一致。
  - 校验 `package.json` 版本、`.desktop` 文件中的 `MimeType` 与 `Exec %U`，deb control 的架构字段（`amd64` / `arm64`）。
  - 元数据 yml 中的版本、文件名与 sha512 与实际 AppImage 一致。
- `after-pack.cjs` 的 release-notes 复制已覆盖非 darwin 分支，无需改动；Sparkle 逻辑仅 darwin。
- `verify-observability-build.mjs` 以 `MARCHEN_DIST=linux-x64|linux-arm64` 运行，Sentry source map 按 dist 上传，不改动脚本逻辑。

### 6. 冒烟：CI 里用 xvfb 启动最终产物

- 在 linux-x64 job（arm64 job 同样可跑，成本低）中，用 `xvfb-run` 启动解包后的应用，传入 `--no-sandbox`（仅 CI 冒烟，因为 runner 无 SUID / AppArmor 配置）与一个测试用的退出开关（环境变量触发：主窗口 `did-finish-load` 后写出标记并退出）。
- 断言：退出码 0、标记存在、日志中无主进程异常。失败时上传 `electron-log` 文件为 artifact。
- 冒烟开关只在打包产物读取一个特定环境变量时生效，不暴露 UI，不影响用户。

### 7. 桌面集成修复

- `env.ts` 增加 `isLinux`。
- `initialize/index.ts`：`second-instance` 注册条件由 `isWindows` 改为 `!isMacOS`（Linux 与 Windows 都通过 argv 传递文件；macOS 走 `open-file`）。冷启动已由 `fileOpenRequests.requestFromArgv(process.argv)` 覆盖。
- `Prepare.tsx`：透明拖拽层条件改为仅 `isMac`。Linux 使用原生标题栏，不需要也不允许内容区拖拽层。
- 右键菜单文案抽成一个按 OS 返回的小函数（Finder / 资源管理器 / 文件管理器），历史与影视库共用。
- `windows/main.ts` 的 `default` 分支保持原生标题栏；确认 `getIconPath()` 在 Linux 打包后可解析到 PNG 图标（Wayland 下窗口图标来自 `.desktop`，需要 `StartupWMClass` 与 `executableName` 一致）。
- `menu.ts` 已有 `!isMacOS` 分支，Linux 与 Windows 行为一致，不改。

### 8. 解码策略：不加任何 Linux 专属 GPU 开关

- 默认使用 Electron 44 / Chromium 的默认 Ozone（自动选择 Wayland / X11）与解码配置。原生 `<video>` 不支持的编码由已有能力探测回退到 compat 内核（WebCodecs + libav WASM），无需新增逻辑。
- **为什么不恢复 `flag.ts`**：`VaapiIgnoreDriverChecks` 与强制 ANGLE Vulkan 在部分驱动上会导致 GPU 进程崩溃黑屏，作为官方默认风险过高；收益（硬解）可以用遥测中的 compat 回退率评估后再决定。

### 9. 遥测

- 已有 `platform` / `arch` / `dist` 满足按平台、架构区分。新增 Sentry tag 与 PostHog 公共属性 `package_type`（`appimage` | `deb` | `dmg` | `nsis` 等，Linux 由 `APPIMAGE` 判断），用于区分自动更新与手动更新人群的版本分布；不新增产品事件，不涉及 `CRITICAL_TELEMETRY_EVENTS`。
- `docs/observability-runbook.md` 补充 Linux dist 与 `package_type` 口径。

### 10. 文档与口径

- `docs/desktop-release.md`：平台目标改为 macOS 13+ ARM64、Windows x64、Linux x64（正式）/ arm64（实验性）；新增 Linux 渠道元数据、更新源路径、验收要求；Linux 安装 FAQ（deb 推荐、AppImage 的 libfuse2 与 24.04 沙箱处理）。
- `CLAUDE.md` 的"桌面发布入口"与"仅发布 …"段落同步。
- `docs/releases/<version>.md` 首个包含 Linux 的版本写明支持级别。
- `package.json` 新增 `build:linux`。

### 11. 验收与证据

| 范围 | 环境 | 方式 |
|---|---|---|
| x64 启动与主链路 | CI `ubuntu-latest` + xvfb | 自动冒烟（决策 6） |
| x64 手工功能 | 云上 x64 Linux 桌面虚拟机（Ubuntu 24.04 Wayland）或用户 Alpha | 安装 deb / AppImage，播放 H.264 / HEVC MKV、ASS 字幕、弹幕、BT、拖放、文件关联、二次打开、AppImage 更新 |
| arm64 手工功能 | 本机 Apple Silicon 虚拟机（Ubuntu 24.04，Wayland + X11 会话） | 同上 |
| 更新链路 | Alpha 预发布 | 先发 `x.y.z-alpha.0` 再发 `alpha.1`，验证 AppImage 升级与 deb 提示 |
| 渠道源兼容 | `channel-feeds.test.mjs` + `publish-channels.mjs` 预览模式 | 历史 Release 无 Linux、新 Release 有 Linux |

证据写入 `marchen/changes/add-linux-desktop-release/evidence/`，明确标注"GPU 硬件解码未在实体硬件上验证"与"x64 播放性能仅在无 GPU 虚拟机上观察"。

## 风险与权衡

- **x64 无法在本机高效验收**：开发机为 arm64，x64 Linux 虚拟机只能模拟。缓解：CI 冒烟覆盖启动与打包正确性；手工功能依赖云虚拟机或用户 Alpha 测试；证据如实标注。
- **Ubuntu 24.04 AppArmor / 沙箱**：deb 若未正确安装 profile，用户会遇到启动即崩溃。缓解：验收在全新 24.04 上执行 deb 安装；必要时自定义安装脚本。AppImage 的同类问题只能文档化。
- **渠道源 404 语义**：Linux 客户端把元数据 404 视为"已是最新"，可能掩盖真正的渠道源部署事故。缓解：仅对 Linux 生效；渠道源发布本身对存在的 Linux 元数据严格校验；可在 Sentry breadcrumb 中记录 404 便于排查。
- **arm64 实验性范围**：Asahi Linux 的 16K 页内核与树莓派等低功耗设备无法在本机虚拟机复现。缓解：文档明确不承诺；观察遥测崩溃率后再决定是否升级为正式支持。
- **软解性能**：大多数 Linux 环境原生 `<video>` 无 HEVC 硬解，compat 内核 WASM 软解对 CPU 压力大。权衡：先保证"能播"，以 compat 回退率与卡顿反馈驱动后续硬解实验。
- **Wayland 差异**：分数缩放、窗口图标、全屏切换在不同合成器上表现不同。缓解：验收覆盖 GNOME Wayland 与 X11 会话；其他合成器问题按反馈处理。
- **uTP 与随包的其他平台预编译文件**：实现阶段确认 `install-app-deps` 会重编 `utp-native`，uTP 在 mac 与 Linux 上可用（推断原先"已禁用"有误）。`bufferutil` 等包会把 darwin / win32 / linux-x64 预编译文件一起打进安装包，运行时由 node-gyp-build 按平台选择；`verify-linux.mjs` 只校验 `build/` 与 `prebuilds/linux-<arch>/` 下的原生模块架构，其余不会被加载的文件不参与校验（裁剪它们属于体积优化，不在本变更范围）。
- **发行成本增加**：每次发版多两个 CI job、4 个安装包与 2 份元数据，Release 页更长；验收矩阵扩大。这是"官方支持"的持续成本，已与用户确认接受。
