# 设置侧栏视觉验收场景

运行 `node scripts/generate-player-acceptance-fixtures.mjs` 后，使用以下三个固定样本排除视频内容偶然性：

- `sidebar-bright.mp4`：明亮暖灰底，观察白字、分隔线和侧栏边界。
- `sidebar-dark.mp4`：近黑蓝底，观察玻璃层级是否仍能与视频区分。
- `sidebar-high-contrast.mp4`：高对比动态图，观察 blur、文字稳定性和滚动合成成本。

每个样本覆盖以下运行形态：

1. Electron 窗口态；本轮按用户要求不验证 macOS 原生全屏。
2. Web 桌面窗口；本轮按用户要求不验证 DOM 全屏。
3. 应用白天主题和夜间主题之间切换，侧栏及其 Select、Popover、Dialog 配色应保持一致。
4. 强制不支持 `backdrop-filter`，侧栏应变为不透明深色；模拟 `prefers-reduced-motion` 时取消非必要位移。
5. 依次打开播放、弹幕、字幕、播放列表标签，验证滚动、焦点、Escape、外部关闭和控制器显隐锁。

Web 不具备目录播放列表能力，因此不显示播放列表标签；这属于预期能力降级，不作为缺陷。
