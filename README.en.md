<p align="center">
  <img src="resources/icon.png" alt="Marchen app icon" width="128" height="128" />
</p>

<h1 align="center">Marchen</h1>

<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

<p align="center">
  An anime danmaku (bullet comment) player that matches danmaku automatically.<br />
  Plays local files, direct links and Jellyfin / Emby / WebDAV, on desktop or in your browser.
</p>

<p align="center">
  <a href="https://marchen.suemor.com">Try it online</a> | <a href="https://github.com/marchen-dev/marchen-player/releases/latest">Download</a>
</p>

<p align="center">
  <img src="https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/hero-20261012.jpg" alt="Marchen library and danmaku playback" width="900" />
</p>

## ✨ Features

### Danmaku

- Identifies the anime and episode automatically and loads matching danmaku
- Import local danmaku files or third-party links; convert Traditional Chinese to Simplified
- In-house danmaku engine that stays smooth under dense danmaku

### Playback

- Plays local videos and HTTP/HTTPS direct links in common formats such as MP4 and MKV
- Dual playback engines: when the native engine can't play a file, it switches to a compatibility engine built on WebCodecs + WebAssembly, decoding in a Worker so the UI stays responsive
- Falls back to multi-threaded software decoding when HEVC hardware decoding is unavailable; AC-3 / E-AC-3 / DTS audio is decoded via WebAssembly
- Embedded subtitles and external ASS / SSA / SRT / VTT

### Media Sources

- Connect to Jellyfin, Emby and WebDAV, then browse and play without server-side transcoding
- Autoplay next episode, load subtitles and remember watch progress

### Library & Downloads

- The library remembers your progress so you can pick up where you left off
- Download via magnet, BT or HTTP and play as soon as it finishes

### Others

- Dark mode, in-app updates and feedback

## 👀 Screenshots

![Danmaku playback](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/playback-preview-20261011.png)

![Playback settings](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/playback-settings-preview-20261011.png)

![Download manager](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/downloads.png)

![Library in dark mode](https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/library-dark.png)

## 📦 Download

Pick the installer for your system from [Releases](https://github.com/marchen-dev/marchen-player/releases/latest):

| System | Installer |
| --- | --- |
| macOS 13+ (Apple Silicon) | `.dmg` |
| Windows x64 | `setup.exe` |
| Linux x64 | `amd64.deb` (Ubuntu / Debian) or `x86_64.AppImage` |
| Linux arm64 | `arm64.deb` or `arm64.AppImage` |

## 🔧 Development

```bash
corepack enable

git clone https://github.com/marchen-dev/marchen-player.git

cd marchen-player

pnpm install

cp .env.example .env

pnpm dev          # Desktop app development

pnpm dev:web      # Web development, port 1106
```

## 📎 Tech Stack

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

## ❤️ Acknowledgements & License

- [dandanplay](https://www.dandanplay.com)
- [MediaBunny](https://mediabunny.dev/)

![AGPLv3 License](https://img.shields.io/badge/License-AGPLv3-blue.svg)
