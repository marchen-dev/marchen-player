<p align="center">
  <img src="resources/icon.png" alt="Marchen 应用图标" width="128" height="128" />
</p>

<h1 align="center">Marchen</h1>

<p align="center">
  Marchen 是一个动漫弹幕播放器。拖入视频或粘贴视频直链，即可自动匹配弹幕。<br />
  支持 macOS、Windows 客户端，也可以在浏览器中直接使用。
</p>

<p align="center">
  <a href="https://marchen.suemor.com">在线体验</a> | <a href="https://github.com/marchen-dev/marchen-player/releases/latest">下载客户端</a>
</p>

## ✨ 特征

### 弹幕

- 自动识别视频对应的番剧和集数并加载弹幕
- 可导入本地 XML / JSON 弹幕文件，也可以通过链接添加第三方弹幕
- 可分别开关各平台弹幕，繁体弹幕可转为简体
- 可调整字号、持续时间和显示区域，点击弹幕即可复制
- 缓存弹幕，再次打开时加载更快

### 播放

- 可播放本地视频，也可直接播放 HTTP/HTTPS 视频直链，不用先下载
- 原生与兼容双播放内核，可播放 HEVC、AC-3、E-AC-3、DTS 等编码
- 支持 MP4、MKV、MOV、WebM、TS 等常见容器，可切换音轨
- 支持内嵌字幕和外挂 ASS / SSA / SRT / VTT 字幕，字幕大小可调

### 影视库与下载

- 影视库记录播放进度和画面缩略图，方便继续观看
- 下载支持磁力链接、BT 种子和 HTTP 直链，合集可按集选择，下载完成后直接播放

### 其他

- 浅色 / 深色主题，可跟随系统切换
- 应用内检查更新
- 应用内反馈，可附带诊断日志

## 👀 截图

![浅色影视库](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/library-light.png)

![弹幕播放](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/player.png)

![播放设置](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/player-settings.png)

![下载管理](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/downloads.png)

![深色影视库](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/library-dark.png)

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
- [libass-wasm](https://github.com/jellyfin/libass-wasm)
- [MediaBunny](https://mediabunny.dev/)

![AGPLv3 License](https://img.shields.io/badge/License-AGPLv3-blue.svg)