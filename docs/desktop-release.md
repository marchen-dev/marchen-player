# 桌面发行与更新

目标为 macOS 13+ Apple Silicon（ARM64）及 Windows x64。Linux 和 Intel Mac 不再生成新包，历史发行保留。

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

更新包继续存放在对应版本 GitHub Release，YAML 内使用版本固定的绝对地址。渠道入口不依赖 GitHub Latest，Alpha/Beta 标记为 Pre-release。各渠道取允许范围内最高版本；例如晚发布 1.0.1 不会覆盖 Alpha 渠道已有的 1.1.0-beta.0。

没有候选版本时 Mac 返回空 appcast，Windows 不生成虚构版本；已有公开客户端所属渠道至少包含其自身版本。首个 Alpha Release 公开前固定源可能尚未创建，这是预期状态，不能当成生产更新已可用。

## 构建和发布

1. 更新 package.json 并编写 `docs/releases/<version>.md`，Node 24 / pnpm 11 干净安装。现有 `pnpm bump`（nbump）会交互选择版本、提交、打标签并推送，不是只改版本号。
2. 核对 CI 的 API、Sentry、PostHog 及 Sparkle 配置；执行类型检查、相关测试和构建。`pnpm build` 会准备媒体资源，不能跳过。
3. 提交经验收的代码和本次版本说明，再推送对应 `v<version>` 标签。默认分支必须先包含 `.github/workflows/update-channels.yml`，才能接收后续 published 事件。
4. release.yml 生成 ARM64 DMG/ZIP 与 Windows x64 NSIS。动态父配置自动设置 Windows 的 latest/beta/alpha.yml 名称及 Mac 内部构建号，本地和 CI 相同。Mac 需先 `pnpm sparkle:build`。
5. 构建后验证最终包、生成带签名 appcast 和最多两个旧基线的官方直接差分；首发无基线则全量。基线从同渠道已公开发行选择较低版本，Alpha/Beta 各自支持直接差分。跨渠道晋升使用全量包，避免官方生成器把不同 feed 的基线分组而漏掉或拒绝生成。
6. 汇总校验后**只创建 Draft**，不自动公开。下载 Draft 的最终包完成安装/更新验证后，由维护者在 GitHub 公开。Alpha/Beta 保持 Pre-release 且不设 Latest；正式版可手动设 Latest。
7. 公开触发 `Publish desktop update channels`：读取全部公开发行、校验选中版本的双平台资产和元数据，一次提交更新渠道文件。成功后客户端在下一次检查时可收到更新。Draft 不进入渠道。

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

## 当前验证边界

本次本地证据见 `marchen/changes/integrate-native-sparkle-updates/evidence/`。用户已反馈 Windows 安装运行正常；这不等同于两个版本之间的自动升级通过。真实播放器更新后历史恢复、Gatekeeper 首次下载、Windows 完整更新与失败恢复仍需实机验收。生产密钥未配置、远端 workflow 未执行时，不宣称已上线。
