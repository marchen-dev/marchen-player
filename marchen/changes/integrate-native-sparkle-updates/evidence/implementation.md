# 实现与验证记录

2026-09-23，本机 macOS ARM64。实现代码仍在工作区，未提交、推送或发布。

## 已完成

- 本地 Sparkle 2.10.0 N-API 桥接、标准中文原生窗口、Mac/Windows 平台路由。
- Mac 主窗口关闭与应用退出保存屏障；Windows 显式下载和安装、进度快照、失败重试；当前版本升级通知。
- ARM64 DMG/ZIP、Windows x64 NSIS 发布流程；删除 Linux 和 Mac Intel 新包、公证旧链。
- 官方 appcast 全量/直接差分生成，公私钥配对校验，版本及产物检查；draft 完整上传后发布。
- 旧 latest-mac.yml 不再生成/上传；新 ARM64 appcast 独立命名。稳定 tag 校验拒绝预发布；已有公开同版本拒绝替换。尚未在真实 GitHub Actions 执行，旧客户端线上 URL 行为没有冒充实测。

## 本地验证

- `pnpm typecheck` 通过。
- `pnpm test:main`：19 个文件、61 项通过，含 bridge loader、主进程更新服务、窗口关闭、保存屏障、版本判断及发行元数据负例。
- `pnpm test:player-runtime`：37 个文件、184 项通过，包含严格历史写入失败回传。
- `pnpm build` / `pnpm build:web` 通过。
- 相关新增主进程服务和发布脚本 ESLint、`git diff --check` 通过。
- Mac Electron 44.0.0 最终 DMG 挂载和 ZIP 提取后分别运行 verify-mac：codesign deep/strict、ARM64、Sparkle/addon/LICENSE、公钥/feed、HEVC/音频/字幕资源及无 Source Map/env 均通过。检查完成后 DMG 已卸载。
- 测试公钥的正式布局安装包经官方工具生成全量 appcast，Node Ed25519 验证签名成功。该包引用测试源，不能作为正式发版包。
- 发布脚本负例验证：预发布 tag 和错误 Ed25519 公钥均被拒绝，未输出私钥。
- 原型全量及直接差分更新证据见 prototype.md 和截图；直接差分实际请求了 1538 字节补丁，保存后重启为 0.0.2。
- 从正式布局复制隔离 smoke bundle，仅修改 package name/bundle ID 后重新 ad-hoc 签名，使用独立 MarchenSparkleAcceptance 数据目录；真实播放器启动成功，菜单显示中文 Sparkle 网络/源错误窗口。未覆盖用户正式应用或数据。无媒体关闭窗口后退出成功。
- 测试应用已退出，loopback 原型 HTTP 服务已关闭。

## 尚未通过的发布门槛

- 6.2：浏览器首次下载的 Gatekeeper 行为、权限错误、篡改/错误密钥的客户端拒绝及完整主动/后台矩阵。当前仅有原型 UI、正式布局加载和源错误证据。
- 6.3：真实播放器 A → B 全量/差分、失败回退、实际视频播放/暂停、历史进度恢复、保存超时失败、无残留声音。原型模拟保存不得替代。
- 6.4：没有 Windows x64 实机环境；NSIS 提取检查脚本与 electron-updater 服务测试已实现，但 Windows 安装更新和恢复未运行。
- 6.6：以上未完成，不启动或伪造完整验收，不代用户接受。

正式发布还需配置生产 Ed25519 密钥、确定新版本及 docs/releases/<version>.md，并在正式流水线执行验证。本次没有配置生产 secrets，也没有公开测试资产。
