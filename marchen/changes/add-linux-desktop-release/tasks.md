## 1. 桌面集成修复

- [x] 1.1 `src/main/lib/env.ts` 增加 `isLinux`
- [x] 1.2 `src/main/initialize/index.ts` 的 `second-instance` 注册条件改为 `!isMacOS`，补充注释说明 Linux / Windows 经 argv 传文件
- [x] 1.3 `Prepare.tsx` 透明拖拽层只在 `isMac` 渲染，更新注释
- [x] 1.4 渲染端增加按 OS 返回"在 Finder / 资源管理器 / 文件管理器中显示"的共用函数，替换历史记录与影视库右键菜单中的二选一文案
- [x] 1.5 确认 `windows/main.ts` 默认分支在 Linux 打包后能解析到 PNG 图标；补充与 `.desktop` `StartupWMClass` 一致性的注释
- [x] 1.6 为上述行为补充单元 / 源码回归测试（second-instance 条件、拖拽层条件、文案函数），`pnpm test:main` 与 `pnpm test:player-runtime` 通过

## 2. 更新策略与共享类型

- [x] 2.1 `packages/shared/src/update-policy.ts`：`updateFeedURL` 支持 `'linux'`（`linux/<channel>/`），新增 Linux 元数据文件名函数（x64 `<latest|channel>-linux.yml`，arm64 `<latest|channel>-linux-arm64.yml`）及测试
- [x] 2.2 `packages/shared/src/types/update.ts`：`DesktopUpdateState.platform` 扩展 `'linux' | 'linux-manual'`
- [x] 2.3 `src/main/lib/update.ts`：Linux 分支按 `APPIMAGE` 分流；AppImage 复用 Windows 的 electron-updater 配置、保存屏障与安装流程；deb 仅检查更新，不下载
- [x] 2.4 Linux 分支把更新元数据 404 视为"已是最新"，并记录 breadcrumb / 日志；Windows 行为不变
- [x] 2.5 `About.tsx`：`linux` 共用 Windows 更新 UI；`linux-manual` 只显示新版本号与"打开下载页"按钮（打开对应 GitHub Release）
- [x] 2.6 `use-update-toast.ts` 的"更新已就绪"提示覆盖 `linux`
- [x] 2.7 主进程更新分流与 404 处理的单元测试

## 3. 渠道源可选平台

- [x] 3.1 `scripts/desktop/channel-feeds.mjs`：`normalizeRelease` 对 x64 / arm64 Linux 元数据"缺失即空、存在即严格校验"，改写 files 地址为 Release 绝对地址
- [x] 3.2 `buildChannelFeeds` 在存在时输出 `linux/<channel>/*-linux*.yml`，`channels.json` 结构不变
- [x] 3.3 `channel-feeds.test.mjs` 增加用例：历史 Release 无 Linux、新 Release 有 Linux、Linux 元数据残缺报错、mac / win 输出与改动前一致
- [x] 3.4 本地以 `publish-channels.mjs` 预览模式（不带 `--publish`）对真实 Release 列表跑一次，确认 mac / win 输出不变

## 4. 打包配置

- [x] 4.1 `electron-builder.yml` 新增 `linux` / `appImage` / `deb` 段：target AppImage + deb、arch x64 + arm64、`executableName`、`category`、`maintainer`、图标、`mimeTypes` 与视频 / `.torrent` 文件关联、`artifactName`
- [x] 4.2 在 Ubuntu 24.04 上确认 electron-builder 26 deb 模板是否处理 AppArmor userns；若否，增加 `deb.afterInstall` / `afterRemove` 脚本安装与移除 AppArmor profile
- [x] 4.3 `package.json` 新增 `build:linux` 脚本
- [x] 4.4 确认 `build/` 中 Linux 图标资源（多尺寸 PNG）齐全，缺失则补齐

## 5. 最终包与资产校验

- [x] 5.1 新增 `scripts/desktop/verify-linux.mjs`：解包 AppImage / deb，复用 `verifyPackageResources`，校验 `.node` 与可执行文件 ELF 架构、`package.json` 版本、`.desktop` 的 `MimeType` 与 `Exec %U`、deb control 架构字段、元数据 yml 与 AppImage sha512 一致
- [x] 5.2 为 `verify-linux.mjs` 中的纯函数（ELF 架构判断、`.desktop` 解析、yml 校验）补测试，纳入 `pnpm test:main`
- [x] 5.3 `verify-assets.mjs`：必需清单加入 4 个 Linux 安装包与 2 份 Linux 元数据；拒绝规则改为只拒绝 Intel Mac 与 `latest-mac.yml`；更新 `verify-assets.test.mjs`

## 6. CI 发行与冒烟

- [x] 6.1 主进程增加仅由特定环境变量触发的冒烟退出开关（主窗口加载完成后写标记并退出），默认不生效
- [x] 6.2 `release.yml` matrix 增加 `ubuntu-latest`（linux-x64）与 `ubuntu-24.04-arm`（linux-arm64），执行 `electron-builder --linux --<arch>`、`verify-linux.mjs` 与可观测性构建校验
- [x] 6.3 Linux job 增加 `xvfb-run` 冒烟步骤，失败时上传日志 artifact
- [x] 6.4 确认 stage 阶段收集并上传 Linux 产物与元数据；`update-channels.yml` 无需改动或按需调整
- [x] 6.5 在分支上用 `workflow_dispatch` 或测试标签跑通一次完整 Linux 构建（不公开 Release）

## 7. 遥测

- [x] 7.1 main 端 Sentry tag 与渲染端 PostHog 公共属性增加 `package_type`（Linux 区分 `appimage` / `deb`）
- [x] 7.2 `docs/observability-runbook.md` 补充 `linux-x64` / `linux-arm64` dist 与 `package_type` 口径

## 8. 文档

- [x] 8.1 `docs/desktop-release.md`：平台目标、Linux 渠道元数据与更新源路径、arm64 实验性口径、Linux 验收要求
- [x] 8.2 Linux 安装 FAQ（推荐 deb；AppImage 的 libfuse2 安装与 Ubuntu 24.04 沙箱处理；不建议 `--no-sandbox`）
- [x] 8.3 `CLAUDE.md` 的"桌面发布入口"与相关描述同步
- [x] 8.4 准备首个包含 Linux 的版本发行说明 `docs/releases/<version>.md`

## 9. 验收与证据

- [x] 9.1 `pnpm typecheck`、`pnpm lint`、`pnpm test:main`、`pnpm test:player-runtime` 全部通过
- [ ] 9.2 arm64：本机虚拟机 Ubuntu 24.04（Wayland 与 X11 会话）分别安装 deb 与 AppImage，验证启动、H.264 / HEVC MKV 播放、ASS 字幕、弹幕、BT、拖放、文件关联、二次打开、顶部按钮点击、"在文件管理器中显示"
- [ ] 9.3 x64：CI 冒烟结果 + 云虚拟机或用户 Alpha 的同组手工验收
- [ ] 9.4 更新链路：发布两个连续 Alpha，验证 AppImage 应用内升级（含播放中保存进度）与 deb 的新版本提示
- [x] 9.5 确认 mac / win 安装包中 uTP 的现状，与 Linux 结论一并记录
- [ ] 9.6 写入 `evidence/`，明确标注"GPU 硬件解码未在实体硬件上验证"与"x64 播放性能仅在无 GPU 虚拟机上观察"
