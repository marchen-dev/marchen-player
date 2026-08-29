# 第 1 轮验收报告

## 可见结果

- Electron 播放器、影视库、设置弹层与暗色主题均有实际页面证据。
- 真实动画样本完成匹配、弹幕加载和播放，重开后影视库显示继续观看与已保存进度。
- 内嵌字幕与外部 ASS 均走 libass canvas；播放设置中可见外部字幕选中态。
- 当前 macOS arm64 unpacked 应用可启动，自定义协议可读取并播放本地视频。

## 媒体边界

- HEVC 实测继续使用系统 VideoToolbox 硬件解码，符合现有 HTML5 架构。
- EAC-3 样本的画面能播放，但 Chromium 会跳过不支持的音轨；这是升级前已知能力边界，不是本次依赖升级引入的回归。

## 设计偏离与遗留风险

- TypeScript 7 原生编译器不再提供第三方 Lint 生态所需的 JS API，因此采用官方并行迁移方式：类型门禁使用 TypeScript 7，Lint 生态使用 TypeScript 6 API 别名。
- `react-scan` 保留 0.5.6，因为 0.5.7 的传递依赖无法通过现有发布者连续性信任策略；没有为追 latest 放宽供应链门禁。
- electron-vite 仍为 6.0.0-beta.1；当前 dev/HMR、生产构建和运行均通过，但升级后续 beta/正式版时仍需复核。
- Windows、Linux 和 macOS x64 的签名、安装与平台 FFmpeg 资源需要由对应 CI runner 验证，本轮只证明 macOS arm64。
