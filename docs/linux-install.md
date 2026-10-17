# Linux 安装说明

Marchen 为 Linux 提供 x64 与 arm64 两种架构，每种架构有 AppImage 与 deb 两种安装包，均可在 [GitHub Releases](https://github.com/marchen-dev/marchen-player/releases) 下载。1.0.7 及更早版本的文件名不带 `linux-`（如 `Marchen-1.0.7-amd64.deb`）。

| 安装包 | 适合 | 更新方式 |
| --- | --- | --- |
| `Marchen-<版本>-linux-amd64.deb` / `-linux-arm64.deb` | Ubuntu、Debian 及其衍生发行版（推荐） | 应用会提示新版本，下载新 deb 覆盖安装 |
| `Marchen-<版本>-linux-x86_64.AppImage` / `-linux-arm64.AppImage` | 其他发行版，或不想安装的场景 | 应用内下载并重启更新 |

最低要求：glibc 2.31 及以上（Ubuntu 20.04+、Debian 11+ 等主流发行版）。

## deb（推荐 Ubuntu / Debian 用户）

```bash
sudo apt install ./Marchen-<版本>-linux-amd64.deb
```

安装后可在应用菜单找到 Marchen，也可在文件管理器中右键视频选择"用 Marchen 打开"。deb 会在 Ubuntu 24.04 及以上安装对应的 AppArmor 配置，始终在启用 Chromium 沙箱的情况下运行。

卸载：`sudo apt remove marchen`。

## AppImage

```bash
chmod +x Marchen-<版本>-linux-x86_64.AppImage
./Marchen-<版本>-linux-x86_64.AppImage
```

### 提示缺少 FUSE / 双击无反应

AppImage 依赖 FUSE 2。Ubuntu 22.04 起默认未安装：

```bash
# Ubuntu 24.04 及以上
sudo apt install libfuse2t64
# Ubuntu 22.04
sudo apt install libfuse2
```

不方便安装时可改用 deb，或执行 `./Marchen-<版本>-linux-x86_64.AppImage --appimage-extract` 后运行 `squashfs-root/AppRun`（解包后不再支持应用内更新）。

### Ubuntu 24.04 上的沙箱说明

Ubuntu 24.04 默认通过 AppArmor 限制普通程序创建 user namespace，而 AppImage 没有安装步骤，无法写入对应授权。此时 AppImage 的启动脚本会检测到限制并以**无沙箱模式**启动，以保证应用能够打开；在系统允许的发行版上（如 Ubuntu 22.04、Debian、Fedora）仍会启用沙箱。

日常使用不受影响。若希望始终启用沙箱，Ubuntu 用户请使用 deb。Marchen 不会在系统允许时主动关闭沙箱。

### 集成到应用菜单

AppImage 本身不会注册应用菜单和文件关联。可使用 [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever) 或 AppImageLauncher 等工具集成，集成后的启动项同样遵循上述沙箱规则。

## 已知限制

- 大多数 Linux 环境的浏览器内核没有 HEVC 硬件解码，HEVC 视频由兼容内核软件解码播放，对 CPU 要求较高。
- arm64：不保证 16K 页内核（如 Asahi Linux）与树莓派等低功耗设备上的播放流畅度。
- 不同桌面环境（GNOME / KDE、Wayland / X11）的窗口图标、分数缩放与全屏切换可能存在差异，遇到问题请在 设置 › 关于 › 反馈问题 中附带日志提交。日志位于 `~/.config/Marchen/logs/`。
