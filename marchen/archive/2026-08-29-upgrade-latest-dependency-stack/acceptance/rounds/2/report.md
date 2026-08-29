# 第 2 轮验收报告

本轮按更新后的 `marchen-acceptance` 重新执行，没有修改第 1 轮文件。三个既有案例继续复用 `ui-runtime`、`core-playback`、`subtitle-media` ID，并使用新启动的 Electron 实例重新截图。

## 可见结果

- 设置弹层、夜间主题和导航重新验证通过。
- 真实动画从已保存位置继续播放，弹幕正常显示；影视库展示继续观看集数与 4% 进度。
- MKV 播放时 libass canvas 存在，播放设置显示外部 ASS 为当前字幕。

## 设计偏离与遗留风险

- TypeScript 7 编译器与 TypeScript 6 生态 API 的并行配置保持不变。
- `react-scan` 继续保留 0.5.6，供应链信任门禁没有放宽。
- electron-vite 仍为 6.0.0-beta.1；Windows、Linux、macOS x64 和正式签名仍需对应发布环境验收。
- EAC-3 仍是 Chromium 不支持的音轨，不把既有媒体能力边界记录为本轮通过项。
