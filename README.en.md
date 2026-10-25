<p align="center">
  <img src="resources/icon.png" alt="Marchen app icon" width="128" height="128" />
</p>

<h1 align="center">Marchen</h1>

<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

<p align="center">
  Marchen is an anime danmaku (bullet comment) player. Drop in a video, paste a direct video link, or connect to Jellyfin, Emby or WebDAV to browse your anime, and danmaku are matched automatically.<br />
  Available as a desktop app for macOS, Windows and Linux, or right in your browser.
</p>

<p align="center">
  <a href="https://marchen.suemor.com">Try it online</a> | <a href="https://github.com/marchen-dev/marchen-player/releases/latest">Download</a>
</p>

<p align="center">
  <img src="https://fastly.jsdelivr.net/gh/marchen-dev/marchen-player@main/docs/images/hero-20261012.jpg" alt="Marchen library and danmaku playback" width="900" />
</p>

## ✨ Features

### Danmaku

- Automatically identifies the anime and episode of a video and loads its danmaku
- Import local XML / JSON danmaku files, or add third-party danmaku from a link
- Toggle danmaku per source platform; Traditional Chinese danmaku can be converted to Simplified
- Adjust font size, duration and display area; click a comment to copy it
- Danmaku are cached so videos load faster the next time
- In-house danmaku engine with node pooling and GPU-composited animation, staying smooth even under dense danmaku

### Playback

- Play local videos or HTTP/HTTPS direct video links
- Supports common containers such as MP4, MKV, MOV, WebM and TS, with audio track switching
- Dual playback engines: when the native engine can't play a file, it falls back to the compatibility engine automatically
- The compatibility engine is built on WebCodecs and WebAssembly, decoding in a Worker without blocking the UI, and falls back to multi-threaded software decoding when HEVC hardware decoding is unavailable
- Decodes audio that browsers don't support natively, such as AC-3, E-AC-3 and DTS, via WebAssembly
- Supports embedded subtitles and external ASS / SSA / SRT / VTT subtitles

### Media Sources

- Connect to Jellyfin, Emby and WebDAV, browse folders in the app and play directly
- Reads original files without server-side transcoding, so danmaku matching works just like local videos
- Episodes in the same season or folder form a playlist with previous / next episode and autoplay
- Loads subtitles from the server or matching external subtitles in the same folder; shows watch progress while browsing and resumes from history or the library

### Library & Downloads

- The library remembers playback progress and thumbnails so you can pick up where you left off
- Downloads support magnet links, BT torrents and HTTP direct links; pick individual episodes from a batch and play them as soon as they finish

### Others

- Light / dark themes, optionally following the system
- In-app update checks
- In-app feedback with optional diagnostic logs

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

For Linux installation and FAQ, see the [Linux install guide](docs/linux-install.md) (in Chinese).

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
