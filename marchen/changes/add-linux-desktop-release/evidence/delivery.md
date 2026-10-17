# add-linux-desktop-release 交付证据

日期：2026-10-17。开发机 macOS（Apple Silicon，arm64），本地 Node 22 / 24（fnm）。

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck`（node + web） | 通过 |
| ESLint（本次改动与新增文件） | 0 error；`Prepare.tsx` 仅有既有的 exhaustive-deps 警告 |
| `test:main`（Node 24） | 35 文件 / 216 用例全部通过 |
| `test:main`（Node 22） | `scripts/web/release.test.mjs` 1 例失败：Web 发布脚本要求 Node 24，与本变更无关 |
| `test:player-runtime` | 60 文件 / 359 用例全部通过 |

新增或扩展的测试：Linux 元数据命名与更新源（`update-version.test.ts`）、AppImage / deb 更新分流与 404 语义（`update.test.ts`）、渠道源可选 Linux 平台（`channel-feeds.test.mjs`）、发行资产校验（`verify-assets.test.mjs`）、Linux 最终包纯函数（`linux-package.test.mjs`）、冒烟开关（`smoke-test.test.ts`）、安装形态（`package-type.test.ts`）、second-instance / 拖拽层 / 文案回归。

## 渠道源兼容（真实发行列表）

`GH_TOKEN=$(gh auth token) node scripts/desktop/publish-channels.mjs`（预览模式，不写远端）生成的 7 个文件（`channels.json`、`mac/{stable,beta,alpha}.xml`、`windows/*/*.yml`）与远端 `update-feeds` 分支逐字节一致；历史发行均无 Linux 元数据，因此没有生成 Linux 文件。

## Linux arm64 构建、最终包校验与冒烟（Docker）

环境：Docker Desktop，`node:24-bookworm`（linux/arm64，Apple Silicon 原生虚拟化），干净 `pnpm install --frozen-lockfile` → `pnpm build` → `electron-builder --linux --arm64 --publish never`。API 地址为测试占位值。

- 只产出 arm64 产物（`Marchen-1.0.6-arm64.AppImage`、`Marchen-1.0.6-arm64.deb`、`latest-linux-arm64.yml`）。
  - 首次构建时 target 中写死 `arch: [x64, arm64]`，与命令行 `--arm64` 合并后在 arm64 环境额外打出了 x64 包；已改为 target 不写 arch，由命令行决定。
- electron-builder 自带 `fpm-1.17.0-ruby-3.4.3-linux-arm64v8`，arm64 runner 无需另装 fpm。
- `node scripts/desktop/verify-linux.mjs dist arm64` 通过：
  - 主程序及 `node-datachannel`、`utp-native`、`bufferutil`、`utf-8-validate` 的 `build/Release/*.node` 均为 arm64 ELF；
  - 首次校验因 `bufferutil/prebuilds/darwin-arm64` 等其他平台预编译文件误报，已改为只校验运行时会加载的模块；
  - ASAR 媒体资源、无 Source Map / env、版本 1.0.6；
  - AppImage `.desktop`：`Exec=AppRun %U`（无 `--no-sandbox`）、`StartupWMClass=marchen`、MIME 类型齐全；
  - deb：`Package=marchen`、`Architecture=arm64`、版本、`/usr/share/applications/marchen.desktop`、`resources/apparmor-profile`；
  - `latest-linux-arm64.yml` 的 AppImage sha512 / size 与文件一致。
- xvfb 冒烟（与 `release.yml` 相同步骤，CI 环境 `--no-sandbox`）：`arm64-smoke-marker.json` 为 `{"ok":true,"version":"1.0.6","platform":"linux","arch":"arm64"}`，React 根节点已渲染。
- 产物 SHA-256（本地构建，未发布）：
  - `Marchen-1.0.6-arm64.AppImage` f3e074cc4bb3dc4e36f4276e19c08ab205d2dacc1cff9b8874aba8ab36827df1
  - `Marchen-1.0.6-arm64.deb` 0930487c4127e06340756971c15b5e09dbe9556e18d484a6b4cf421342e57251

## uTP 现状（任务 9.5）

1.0.6 macOS 正式包 `/Applications/Marchen.app` 的 `app.asar.unpacked` 中存在 `utp-native/build/Release/utp_native.node`：`postinstall` 的 `electron-builder install-app-deps` 会绕过 pnpm `allowBuilds: false` 按 Electron ABI 重编。Linux arm64 deb 同样包含 arm64 的 `utp_native.node`。探索阶段"uTP 已不可用"的推断有误，Linux 与 mac 行为一致。Windows 安装包未拆包确认。

## GitHub Actions 预览构建（任务 6.5）

`.github/workflows/linux-preview.yml`，分支 `feat/linux-desktop-release`：

| 运行 | 结果 | 说明 |
| --- | --- | --- |
| [39018672373](https://github.com/marchen-dev/marchen-player/actions/runs/39018672373) | arm64 通过；x64 冒烟失败 | x64 打包与 `verify-linux` 通过；冒烟固定等待 5 秒，`root_not_rendered`，日志无错误 |
| [39019013095](https://github.com/marchen-dev/marchen-player/actions/runs/39019013095) | 两者失败 | 冒烟改为轮询后，pre-commit `eslint --fix` 改写测试代码导致类型检查失败 |
| [39019151731](https://github.com/marchen-dev/marchen-player/actions/runs/39019151731) | **两者通过** | 冒烟首屏：arm64 3473 ms、x64 5827 ms，四个启动阶段标记齐全 |

结论：x64 runner 软件渲染下首屏约 5.8 秒，超过最初的 5 秒固定等待；冒烟改为最多轮询 30 秒并在失败时带回控制台错误与启动阶段标记。`ubuntu-24.04` 与 `ubuntu-24.04-arm` 上的 apt 依赖、原生模块安装、electron-builder（含 arm64 fpm）、`verify-linux.mjs` 与 xvfb 冒烟均已在真实 CI 执行通过。`release.yml` 的 Linux job 使用相同步骤，尚未经标签触发实跑。

## 桌面手工验收（进行中）

用户在 Windows 主机上的 Ubuntu x64 虚拟机中安装预览构建（运行 39019151731）的 x64 deb（任务 9.3）：功能正常，但应用网格中图标显示为默认齿轮。

- 原因：`linux.icon` 指向单张 1024px `build/icon.png`，deb / AppImage 只包含 `hicolor/1024x1024/apps/marchen.png`；hicolor 主题索引标准尺寸最大到 512x512，GNOME 找不到 `Icon=marchen`。
- 修复：新增 `build/icons/{16…512}x{16…512}.png` 图标集（由 `build/icon.png` 缩放生成），`linux.icon` 改为该目录；`verify-linux.mjs` 新增 `verifyHicolorIcons`，要求 AppImage 与 deb 都包含 48 / 128 / 256 / 512 尺寸。对旧包运行该检查会报出缺失，确认能拦住同类问题。
- 待复验：新的预览构建安装后图标是否正常显示。

## 未完成 / 未验证

- `release.yml` 的 Linux job 尚未经 `v*` 标签实跑（步骤与预览构建一致）。
- **桌面会话手工验收未做**（任务 9.2 / 9.3）：Docker 冒烟只证明打包后可启动并渲染，不覆盖 Wayland / X11 窗口行为、文件关联、二次打开、视频播放、字幕、弹幕、BT 与拖放。
- **更新链路未验证**（任务 9.4）：需要发布两个连续 Alpha。
- **Ubuntu 24.04 deb 的 AppArmor 实装行为**仅从 electron-builder 模板源码确认，未在 24.04 实机安装。
- GPU 硬件解码未在实体硬件上验证；x64 播放性能未观察。
