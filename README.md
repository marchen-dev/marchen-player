# Marchen Player

Marchen Player 是本地视频弹幕播放器，拖入动漫视频即可匹配对应的弹幕。

采用 Electron 开发，支持 **Web, macOS, Windows, Linux** 四个版本，目前主要适配 **macOS** 版本。

桌面端当前要求 **macOS 13 Ventura 或更高版本**；开发环境使用 **Node.js 24 LTS + pnpm 11**。

[在线体验](https://marchen-play.suemor.com) | [下载客户端](https://github.com/marchen-dev/marchen-player/releases/latest)

## ✨ 特征

- [x] 导入动漫自动匹配弹幕
- [x] 支持设置弹幕字体大小、持续时间、显示区域
- [x] 支持手动添加第三方弹幕网址
- [x] 支持导入本地 XML 和 JSON 弹幕文件
- [x] 支持对不同平台的弹幕进行单独的开关
- [x] 支持弹幕缓存，加快弹幕加载速度
- [x] 支持弹幕繁体转简体
- [x] 自动安装更新，无需手动下载安装
- [x] 跨平台，支持 macOS Windows Linux Web 版本
- [x] 支持白天夜间模式，可以跟随系统自动切换
- [x] 支持解析视频内嵌字幕和导入本地字幕
- [x] 支持修改匹配的弹幕库
- [x] 还算不错的 UI 设计
- [x] 播放记录界面可以显示播放进度和对应的画面

## 👀 截图

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/CleanShot%202024-11-21%20at%2019.38.37%402x.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/CleanShot%202024-11-21%20at%2019.41.34%402x.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/202501061557157.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/202501061604943.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/202501061604942.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/CleanShot%202024-11-21%20at%2019.40.33%402x.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/CleanShot%202024-11-21%20at%2019.39.05%402x.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/CleanShot%202024-11-21%20at%2019.39.09%402x.png)

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/202501292219389.png)

## 🔧 开发

```bash
$ corepack enable

$ git clone https://github.com/marchen-dev/marchen-player.git

$ pnpm install

$ cp .env.example .env

$ pnpm dev
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
- HTML5 Video / Canvas 双内核 + MediaBunny + 自研播放运行时
- RxJS
- libass-wasm

## ❤️ 致谢 & 许可

- [弹弹play](https://www.dandanplay.com)
- [libass-wasm](https://github.com/jellyfin/libass-wasm)

当前开发分支中，Electron 与 Web 共用 H5 / Canvas 双内核、DOM 弹幕引擎和 React 控制器。
自动模式优先 H5，明确不支持时使用 Canvas；设置可固定内核。Canvas 使用 MediaBunny 解封装、
WebCodecs 解码，以及 `@suemor/libav-hevc@0.1.1` 提供的 HEVC WASM 软解，音频通过官方
AC-3/E-AC-3、DTS 扩展和 Web Audio 输出。已删除 Node FFmpeg/HLS 播放转码。

两端提供字幕、截图和用户选定的多文件列表，Electron 另有同目录发现能力。Web 刷新后可能
需要重新选择媒体文件。新存储命名空间不迁移旧记录，也不主动删除旧数据。HDR 当前实现
HDR10/HLG 到 SDR 映射，显示设备的 HDR 输出与完整平台验收仍在进行中。
这些说明对应开发分支，不代表在线体验和已发布客户端已经升级。

Web 构建通过同源 `/api/v2` 请求弹弹play代理：本地 `dev:web` / `vite preview` 已内置反代；
部署 `out/web` 时，静态站点服务也需要把 `/api/v2` 反向代理到 `VITE_API_URL` 对应服务。

多线程与静态资源部署要求见 [播放器部署说明](docs/player-engine-deployment.md)。

[![AGPLv3 License](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
