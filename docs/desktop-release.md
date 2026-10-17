# 桌面发行与更新

目标为 macOS 13+ Apple Silicon（ARM64）、Windows x64、Linux x64（正式支持）与 Linux arm64（实验性支持）。Intel Mac 不再生成新包，历史发行保留。

Linux 每个架构同时发行 AppImage 与 deb。AppImage 使用 `electron-updater` 应用内自动更新；deb 由包管理器管理文件，应用内只检查新版本并引导打开下载页。arm64 的"实验性"指不承诺 16K 页内核（如 Asahi Linux）与树莓派等低功耗设备上的播放性能，崩溃率与兼容内核回退率稳定后再评估转为正式支持。用户侧安装说明见 [Linux 安装说明](./linux-install.md)。

Mac 使用工作区 @marchen/sparkle-updater 与官方 Sparkle 中文原生窗口。应用 ad-hoc 签名不等于 Apple Developer ID 或公证；第一次从互联网下载后可能被 Gatekeeper 拦截，按 macOS“隐私与安全性 → 仍要打开”的流程处理。

旧 Mac 客户端需手动下载 DMG 并覆盖安装一次。新数据库不迁移旧播放记录，也不主动删除旧数据。旧 latest-mac.yml 不再生成或上传。

## 版本和渠道

package.json 版本使用 `X.Y.Z`、`X.Y.Z-alpha.N` 或 `X.Y.Z-beta.N`；标签在前面加 `v`。仅允许小写 alpha/beta，N 从 0 递增，禁止复用已公开版本。

| 安装版本 | 可以收到的版本 |
| --- | --- |
| 正式版 | 更高正式版 |
| Beta | 更高 Beta、正式版 |
| Alpha | 更高 Alpha、Beta、正式版 |

每次启动从当前版本决定渠道；升级到正式版后不再接收预发布。主动检查与后台检查遵循同一规则，没有渠道选择设置，也不自动降级。版本顺序使用 SemVer，不能按发布日期排序。

Mac 的显示版本仍是 `1.0.0-alpha.0`，内部 CFBundleVersion 为 `1.0.0a1`；Beta 对应 b 后缀，正式版去掉后缀。该映射让官方 Sparkle 检查及安装阶段一致排序。遵守构建后缀限制，预发布序号 N 支持 0～254。超过该范围需推进目标版本，不能自行换比较器或复用内部版本号。

## 密钥与固定更新源

用锁定官方工具 `packages/sparkle-updater/vendor/bin/generate_keys` 为 Marchen 生成并安全备份独立 Ed25519 密钥。在 GitHub Actions 配置 `SPARKLE_ED_PUBLIC_KEY` / `SPARKLE_ED_PRIVATE_KEY`。私钥不得进入仓库、日志、客户端或发行资产；测试密钥不能用于正式发布。没有 Apple 开发者账号也能使用这套更新签名。

三个渠道共用这一应用更新密钥；渠道隔离由固定 feed、安装版本和版本筛选决定。公钥不属于秘密，但必须与私钥配对。

渠道文件由 CI 写入同仓库的独立 `update-feeds` 分支，使用固定 HTTPS URL：

- Mac：`https://raw.githubusercontent.com/marchen-dev/marchen-player/update-feeds/mac/{stable,beta,alpha}.xml`
- Windows：同一分支下 `windows/stable/latest.yml`、`windows/beta/beta.yml`、`windows/alpha/alpha.yml`
- Linux AppImage：同一分支下 `linux/<channel>/`，x64 为 `latest-linux.yml` / `beta-linux.yml` / `alpha-linux.yml`，arm64 在文件名后加 `-arm64`（如 `alpha-linux-arm64.yml`）。架构由文件名隔离，客户端按自身 `process.arch` 读取。

更新包继续存放在对应版本 GitHub Release，YAML 内使用版本固定的绝对地址。渠道入口不依赖 GitHub Latest，Alpha/Beta 标记为 Pre-release。各渠道取允许范围内最高版本；例如晚发布 1.0.1 不会覆盖 Alpha 渠道已有的 1.1.0-beta.0。

没有候选版本时 Mac 返回空 appcast，Windows 不生成虚构版本；Linux 是可选平台，渠道选中的版本缺少 Linux 元数据（如 Linux 恢复支持前的版本）时不生成该渠道的 Linux 文件，Linux 客户端把元数据 404 视为"已是最新"，mac / win 渠道照常发布；元数据存在但不完整或引用其他版本时整体拒绝发布。已有公开客户端所属渠道至少包含其自身版本。首个 Alpha Release 公开前固定源可能尚未创建，这是预期状态，不能当成生产更新已可用。

### 安装包命名

1.0.7 之后的安装包文件名带系统名，便于在 Release 页区分平台：`Marchen-<版本>-macos-arm64.{dmg,zip}`、`Marchen-<版本>-windows-x64-setup.exe`、`Marchen-<版本>-linux-{x86_64,arm64}.AppImage`、`Marchen-<版本>-linux-{amd64,arm64}.deb`（Linux 架构名沿用 AppImage / dpkg 习惯）。1.0.7 及更早的发行不带系统名（如 `Marchen-1.0.7-arm64.zip`）。命名集中在 `update-policy.ts` 的 `macArtifactNames` / `windowsSetupName` / `linuxArtifactNames`，须与 `electron-builder.yml` 的 `artifactName` 一致；渠道源与 Mac 差分基线读取历史发行时两种命名都识别，本次构建的校验只接受新命名。更新元数据（`latest.yml`、`latest-linux*.yml`、`appcast-macos-arm64.xml`）与 Sparkle 差分包名不变。

Windows 差分下载优先使用上次更新缓存的 blockmap，没有缓存（如直接安装 1.0.7）时按新文件名替换版本号推算旧 blockmap 地址；改名后该地址不存在，这次升级会回退为全量下载，之后恢复差分。AppImage 读取已安装文件内嵌的 blockmap，Mac 使用 Sparkle 差分，均不受影响。

## 构建和发布

1. 更新 package.json 并编写 `docs/releases/<version>.md`，Node 24 / pnpm 11 干净安装。现有 `pnpm bump`（nbump）会交互选择版本、提交、打标签并推送，不是只改版本号。
2. 核对 CI 的 API、Sentry、PostHog 及 Sparkle 配置；执行类型检查、相关测试和构建。`pnpm build` 会准备媒体资源，不能跳过。
3. 提交经验收的代码和本次版本说明，再推送对应 `v<version>` 标签。默认分支必须先包含 `.github/workflows/update-channels.yml`，才能接收后续 published 事件。
4. release.yml 生成 ARM64 DMG/ZIP、Windows x64 NSIS，以及 Linux x64 / arm64 的 AppImage 与 deb（分别在 `ubuntu-24.04` 与 `ubuntu-24.04-arm` 原生 runner 上安装依赖并打包，因为 `node-datachannel` 按宿主架构下载预编译二进制）。动态父配置自动设置 Windows 的 latest/beta/alpha.yml 名称及 Mac 内部构建号，本地和 CI 相同。Mac 需先 `pnpm sparkle:build`。
5. 构建后验证最终包：Linux 由 `verify-linux.mjs` 解包 AppImage 与 deb，检查主程序与全部原生模块的 ELF 架构、ASAR 资源与版本、`.desktop`（`%U`、MIME 类型、`StartupWMClass`、不写死 `--no-sandbox`）、deb 控制字段与 AppArmor profile、更新元数据 sha512；再在 xvfb 中启动解包后的应用做冒烟（`MARCHEN_SMOKE_MARKER`，仅 CI 使用，CI 无 SUID / AppArmor 配置所以只在此处 `--no-sandbox`）。Mac 生成带签名 appcast 和最多两个旧基线的官方直接差分；首发无基线则全量。基线从同渠道已公开发行选择较低版本，Alpha/Beta 各自支持直接差分。跨渠道晋升使用全量包，避免官方生成器把不同 feed 的基线分组而漏掉或拒绝生成。
6. 汇总校验后**只创建 Draft**，不自动公开。下载 Draft 的最终包完成安装/更新验证后，由维护者在 GitHub 公开。Alpha/Beta 保持 Pre-release 且不设 Latest；正式版可手动设 Latest。
7. 公开触发 `Publish desktop update channels`：读取全部公开发行、校验选中版本的 mac / win 资产和元数据（Linux 存在时一并严格校验），一次提交更新渠道文件。成功后客户端在下一次检查时可收到更新。Draft 不进入渠道。

Sentry release 在构建协调阶段 finalize；对应 production/beta/alpha 部署标记在公开并同步渠道后记录。此流程不需要另建更新服务器，但需客户端能够访问 GitHub 的 raw 域名及发行资产。

### 本地只预览渠道元数据

在已有 GH_TOKEN 的环境执行：

```bash
node scripts/desktop/publish-channels.mjs
```

它仅读取远端发行并生成 `.tmp/channel-feeds`；不修改远端。`--publish` 才会写分支，通常只由 CI 调用。首次写入时 CI 自动创建分支，无需手动放入测试 feed。

### 发布失败与重跑

- 构建失败可重跑 Draft；已公开同版本禁止重新打包覆盖。
- 公开后的渠道同步失败，可在 Actions 手动运行 `Publish desktop update channels`。所有输入验证完成前不更新远端 ref；相同内容重跑不创建重复提交。
- 通过 GITHUB_TOKEN 在另一个 workflow 公开 Release 不保证触发新 workflow；当前设计由维护者公开，遗漏事件时手动同步。
- 自动流程拒绝渠道版本回退，包括删除最高版本后重建。紧急撤回需人工禁用相关 feed/发行资产并单独检查渠道文件；已安装客户端不自动降级，修复用更高版本发布。
- 私钥丢失或泄露时停止发布，保留旧资产，评估官方密钥迁移或安排用户手动安装可信版本。不能直接换公钥假设旧客户端可继续升级。

## Linux 验收要求

- 每次包含 Linux 的发行：CI 的 `verify-linux.mjs` 与 xvfb 冒烟必须通过。
- 首个 Linux 版本及打包配置变化时：arm64 在 Apple Silicon 本机虚拟机（Ubuntu 24.04，Wayland 与 X11 会话）手工验收；x64 在云上 x64 虚拟机或由用户 Alpha 实测。覆盖 deb 与 AppImage 安装启动、H.264 / HEVC MKV、ASS 字幕、弹幕、BT、拖放、文件关联、应用运行中再次打开文件、AppImage 应用内升级与 deb 新版本提示。
- 虚拟机没有 GPU，证据必须注明"GPU 硬件解码未在实体硬件上验证"；Linux 默认不启用任何实验性 VA-API / ANGLE 开关，原生不支持的编码由兼容内核软解。

## 当前验证边界

本次本地证据见 `marchen/changes/integrate-native-sparkle-updates/evidence/`。用户已反馈 Windows 安装运行正常；这不等同于两个版本之间的自动升级通过。真实播放器更新后历史恢复、Gatekeeper 首次下载、Windows 完整更新与失败恢复仍需实机验收。生产密钥未配置、远端 workflow 未执行时，不宣称已上线。
