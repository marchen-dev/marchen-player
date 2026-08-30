# 播放器验收样本

样本由仓库脚本完全本地生成，不包含第三方视频、音频、字幕或用户数据。生成物位于已忽略的 `test-results/player-acceptance/`，不会进入 Git。

```bash
node scripts/generate-player-acceptance-fixtures.mjs
```

运行依赖 PATH 中存在 `ffmpeg`。脚本只使用 FFmpeg 的 `testsrc2` 测试画面、正弦音和仓库内生成的文本。

| 文件 | 内容 | 用于证明 |
| --- | --- | --- |
| `native-h264-aac.mp4` | 12 秒 1280×720 H.264/AAC 测试画面 | Electron/Web 原生加载、播放、暂停、seek、音量、倍速、ended、续播 |
| `native-av1-aac.mp4` | 12 秒 640×360 AV1/AAC 测试画面 | 不含专有 H.264 解码器的 Chromium Web 验收 |
| `embedded-ass.mkv` | 同一画面，内嵌中文 ASS 字幕轨 | Electron MKV、内嵌字幕探测/提取、默认中文轨、切换与销毁 |
| `fixture.ass` | 三段 ASS 字幕 | Electron/Web 外挂字幕、偏移、全屏 resize、换轨释放 |
| `fixture.ssa` | 两段 SSA 字幕 | SSA 外挂字幕兼容和换轨 |
| `local-danmaku.json` | 30 条滚动/顶部/底部本地弹幕 | Electron 本地弹幕导入、模式/时间/颜色转换和热更新 |
| `dense-danmaku.json` | 1,200 条集中在 2–4.4 秒的弹幕 | 节点上限、轨道冲突、丢弃策略、节点池和长任务观测 |

## 使用边界

- Web 不要求播放 MKV；Web 媒体兼容错误使用 `embedded-ass.mkv` 验证提示和桌面版入口。
- EAC3、HEVC、HDR 和 FFmpeg 兼容链不属于本次验收。
- 真正的用户视频只可作为本地补充观察，不得复制进仓库或验收产物。
