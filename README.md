# Marchen

Marchen 是本地视频弹幕播放器，使用 [弹弹play API](https://github.com/kaedei/dandanplay-libraryindex/blob/master/api/API.md)，拖入动漫视频即可匹配对应的弹幕。

采用 Electron 开发，支持 **Web, macOS, Windows, Linux** 四个版本，目前主要先适配 **macOS** 版本。

## ✨ 特征
- [x] 导入动漫自动匹配弹幕
- [x] 支持设置弹幕字体大小、持续时间、显示区域
- [x] 支持手动添加第三方弹幕网址
- [x] 支持本地 xml 弹幕文件
- [x] 支持对不同平台的弹幕进行单独的开关
- [x] 自动安装更新，无需手动下载安装
- [x] 跨平台，支持 macOS Windows Linux Web 版本
- [x] 支持白天夜间模式，可以跟随系统自动切换
- [x] 支持解析视频内嵌字幕和导入本地字幕
- [x] 支持修改匹配的弹幕库
- [x] 精美的 UI 设计
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

![](https://fastly.jsdelivr.net/gh/suemor233/static@main/img/CleanShot%202024-11-21%20at%2019.39.19%402x.png)

## 🔧 开发

```bash
$ git clone https://github.com/marchen-dev/marchen-player.git

$ pnpm install

$ pnpm dev
```

## 📎 技术栈
* Electron
* React
* TypeScript
* Tailwind CSS
* Jotai
* shadcn/ui
* TanStack Query
* Framer motion
* xgplayer

## ❤️ 致谢 & 许可

- [弹弹play](https://www.dandanplay.com)
- [Follow](https://github.com/RSSNext/follow)
- [xgplayer](https://github.com/bytedance/xgplayer)

[![GPLv3 License](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
