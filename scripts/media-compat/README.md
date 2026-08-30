# 媒体兼容回归样本

运行下面的命令生成小体积、无外部版权依赖的合成媒体：

```bash
node scripts/media-compat/generate-fixtures.mjs
```

默认输出到被 Git 忽略的 `test-results/media-compat/`。也可以把输出目录作为第一个参数传入。
生成器将样本分为两层：

- `unit`：2–3 秒，用于 planner、probe、选流和命令参数等快速测试。
- `structure`：30 秒低分辨率媒体，用于暴露长 GOP、目标 codec 表达、首片段等待、VFR 和色彩元数据问题；它不是性能基准。

生成器最后使用 `ffprobe` 写出 `generated-manifest.json`，记录生成环境、样本层级、覆盖 traits 与实际轨道信息。

| 样本                                     | 预期边界                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `native-h264-aac.mp4`                    | Chromium 常规 H.264/AAC 直放，不应启动 FFmpeg                                   |
| `hevc-main8-aac.mp4`                     | HEVC Main 8-bit；原生能力足够时优先直放                                         |
| `hevc-main10-aac.mkv`                    | HEVC Main10；覆盖 10-bit 能力判断                                               |
| `hevc-main10-hdr-aac.mkv`                | BT.2020/PQ HDR；需要 H.264 回退时必须 tone-map                                  |
| `h264-eac3-5.1.mkv`                      | 视频可复制，只把 EAC-3 5.1 转为 AAC 立体声                                      |
| `hevc-main10-eac3-5.1.mkv`               | 同时覆盖 HEVC 与 EAC-3 的组合决策                                               |
| `vfr-nonzero-start.mkv`                  | 可变帧间隔且从约 5 秒开始，验证逻辑时间校准                                     |
| `multi-audio-attached-picture.mp4`       | 正片、attached picture、默认日语及评论音轨的确定性选流                          |
| `含 空格/路径 样本.mp4`                  | 空格和非 ASCII 路径必须作为字面参数处理                                         |
| `structure-main10-sdr-flac-long-gop.mkv` | 30 秒未标记 Main10 SDR、FLAC、长 GOP，且 MKV 不提供可直接复用的 RFC 6381 字符串 |
| `structure-hdr10-eac3-long-gop.mkv`      | 30 秒 HDR10、EAC-3 5.1、长 GOP，验证音频优化超时与 HDR 安全回退                 |
| `structure-vfr-nonzero-start.mkv`        | 30 秒 VFR 且约 5 秒起点，验证 generation 时间线校准                             |
| `structure-hlg-long-gop.mkv`             | 30 秒 HLG Main10 长 GOP，验证 HLG→SDR tone-map                                  |
| `structure-rotated-multi-audio.mp4`      | 30 秒旋转/SAR、多音轨和 attached picture，验证选流与几何信息保持                |

样本只用于开发与自动化回归，不进入 Electron 安装包。

## Electron 首帧 smoke

下面的门禁会启动独立 Electron 开发实例，经 CDP 导入真实本地文件，并验证 HLS manifest/init/segment、有效 duration、首个解码帧、时间推进以及 seek 后继续播放：

```bash
node scripts/media-compat/electron-first-frame-smoke.mjs \
  --file /absolute/path/video.mkv \
  --profile safe
```

`--profile` 接受 `audio`、`safe` 或 `hdr-sdr`。脚本只读取传入路径，不复制、修改或提交媒体内容。
