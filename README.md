<p align="center">
  <img src="resources/icon.png" alt="Marchen 应用图标" width="128" height="128" />
</p>

<h1 align="center">Marchen</h1>

<p align="center">
  Marchen 是一个动漫弹幕播放器。拖入视频或粘贴视频直链，即可自动匹配弹幕。<br />
  支持 macOS、Windows、Linux 客户端，也可以在浏览器中直接使用。
</p>

<p align="center">
  <a href="https://marchen.suemor.com">在线体验</a> | <a href="https://github.com/marchen-dev/marchen-player/releases/latest">下载客户端</a>
</p>

<p align="center">
  <img src="https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/hero-20261012.jpg" alt="Marchen 影视库与弹幕播放" width="900" />
</p>

## ✨ 特征

### 弹幕

- 自动识别视频对应的番剧和集数并加载弹幕
- 可导入本地 XML / JSON 弹幕文件，也可以通过链接添加第三方弹幕
- 可分别开关各平台弹幕，繁体弹幕可转为简体
- 可调整字号、持续时间和显示区域，点击弹幕即可复制
- 缓存弹幕，再次打开时加载更快
- 自研弹幕引擎，节点池复用，GPU 合成动画，高密度弹幕下保持流畅

### 播放

- 可播放本地视频，也可直接播放 HTTP/HTTPS 视频直链
- 支持 MP4、MKV、MOV、WebM、TS 等常见容器，可切换音轨
- 原生与兼容双播放内核，原生内核播放不了时自动切换到兼容内核
- 兼容内核基于 WebCodecs 和 WebAssembly，在 Worker 中解码不卡界面，HEVC 硬解不可用时自动改用多线程软解
- 通过 WebAssembly 解码 AC-3、E-AC-3、DTS 等浏览器原生不支持的音频
- 支持内嵌字幕和外挂 ASS / SSA / SRT / VTT 字幕

### 影视库与下载

- 影视库记录播放进度和画面缩略图，方便继续观看
- 下载支持磁力链接、BT 种子和 HTTP 直链，合集可按集选择，下载完成后直接播放

### 其他

- 浅色 / 深色主题，可跟随系统切换
- 应用内检查更新
- 应用内反馈，可附带诊断日志

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
