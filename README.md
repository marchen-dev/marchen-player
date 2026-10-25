<p align="center">
  <img src="resources/icon.png" alt="Marchen 应用图标" width="128" height="128" />
</p>

<h1 align="center">Marchen</h1>

<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

<p align="center">
  动漫弹幕播放器，打开视频即自动匹配弹幕。<br />
  支持本地视频、视频直链与 Jellyfin / Emby / WebDAV，提供桌面客户端和网页版。
</p>

<p align="center">
  <a href="https://marchen.suemor.com">在线体验</a> | <a href="https://github.com/marchen-dev/marchen-player/releases/latest">下载客户端</a>
</p>

<p align="center">
  <img src="https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/hero-20261012.jpg" alt="Marchen 影视库与弹幕播放" width="900" />
</p>

## ✨ 特征

### 弹幕

- 自动识别番剧和集数，匹配并加载弹幕
- 可导入本地弹幕或第三方链接，繁体弹幕可转简体
- 自研弹幕引擎，高密度弹幕下依然流畅

### 播放

- 支持本地视频和 HTTP/HTTPS 直链，MP4、MKV 等常见格式
- 双播放内核：原生播放不了时，自动切换到基于 WebCodecs + WebAssembly 的兼容内核，在 Worker 中解码不卡界面
- HEVC 无硬解时自动改用多线程软解，AC-3 / E-AC-3 / DTS 音频由 WebAssembly 解码
- 支持内嵌字幕和外挂 ASS / SSA / SRT / VTT

### 媒体源

- 连接 Jellyfin、Emby、WebDAV，浏览即播，不经服务端转码
- 自动连播、加载字幕、记住观看进度

### 影视库与下载

- 影视库记录播放进度，随时继续观看
- 支持磁力、BT 和 HTTP 下载，下完直接播放

### 其他

- 深色模式、应用内更新与反馈

## 👀 截图

![弹幕播放](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/playback-preview-20261011.png)

![播放设置](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/playback-settings-preview-20261011.png)

![下载管理](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/downloads.png)

![深色影视库](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/library-dark.png)

## 📦 下载

在 [Releases](https://github.com/marchen-dev/marchen-player/releases/latest) 中按系统选择安装包：

| 系统 | 安装包 |
| --- | --- |
| macOS 13+（Apple Silicon） | `.dmg` |
| Windows x64 | `setup.exe` |
| Linux x64 | `amd64.deb`（Ubuntu / Debian）或 `x86_64.AppImage` |
| Linux arm64 | `arm64.deb` 或 `arm64.AppImage` |

Linux 安装与常见问题见 [Linux 安装说明](docs/linux-install.md)。

## 🔧 开发

```bash
corepack enable

git clone https://github.com/marchen-dev/marchen-player.git

cd marchen-player

pnpm install

cp .env.example .env

pnpm dev          # 客户端开发

pnpm dev:web      # Web 开发，端口 1106
```



## 📎 技术栈

- Electron
- React
- TypeScript
- Tailwind CSS
- Jotai
- shadcn/ui
- TanStack Query
- Framer motion
- HTML5 Video / WebCodecs
- RxJS


## ❤️ 致谢 & 许可

- [弹弹play](https://www.dandanplay.com)
- [MediaBunny](https://mediabunny.dev/)

![AGPLv3 License](https://img.shields.io/badge/License-AGPLv3-blue.svg)
