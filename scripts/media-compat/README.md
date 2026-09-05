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

| 样本                                            | 预期边界                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `native-h264-aac.mp4`                           | Chromium 常规 H.264/AAC 直放，不应启动 FFmpeg                                   |
| `av1-video.mkv`                                 | AV1 视频输入通用 H.264 转码                                                     |
| `vp9-video.webm`                                | VP9 视频输入通用 H.264 转码                                                     |
| `mpeg2-video.mkv`                               | MPEG-2 Video 输入通用 H.264 转码                                                |
| `hevc-main8-aac.mp4`                            | HEVC Main 8-bit；原生能力足够时优先直放                                         |
| `hevc-main10-aac.mkv`                           | HEVC Main10；覆盖 10-bit 能力判断                                               |
| `hevc-main10-hdr-aac.mkv`                       | BT.2020/PQ HDR；需要 H.264 回退时必须 tone-map                                  |
| `h264-eac3-5.1.mkv`                             | 视频可复制，只把 EAC-3 5.1 转为 AAC 立体声                                      |
| `hevc-main10-eac3-5.1.mkv`                      | 同时覆盖 HEVC 与 EAC-3 的组合决策                                               |
| `vfr-nonzero-start.mkv`                         | 可变帧间隔且从约 5 秒开始，验证逻辑时间校准                                     |
| `multi-audio-attached-picture.mp4`              | 正片、attached picture、默认日语及评论音轨的确定性选流                          |
| `含 空格/路径 样本.mp4`                         | 空格和非 ASCII 路径必须作为字面参数处理                                         |
| `structure-main10-sdr-flac-long-gop.mkv`        | 30 秒未标记 Main10 SDR、FLAC、长 GOP，且 MKV 不提供可直接复用的 RFC 6381 字符串 |
| `structure-hdr10-eac3-long-gop.mkv`             | 30 秒 HDR10、EAC-3 5.1、长 GOP，验证音频优化超时与 HDR 安全回退                 |
| `structure-vfr-nonzero-start.mkv`               | 30 秒 VFR 且约 5 秒起点，验证 generation 时间线校准                             |
| `structure-h264-vfr-nonzero-start-long-gop.mp4` | MP4、H.264、VFR、非零起点与长 GOP，验证容器无关关键帧时间线                     |
| `structure-hlg-long-gop.mkv`                    | 30 秒 HLG Main10 长 GOP，验证 HLG→SDR tone-map                                  |
| `structure-rotated-multi-audio.mp4`             | 30 秒旋转/SAR、多音轨和 attached picture，验证选流与几何信息保持                |

样本只用于开发与自动化回归，不进入 Electron 安装包。

## Electron 首帧 smoke

下面的门禁会启动独立 Electron 开发实例，经 CDP 导入真实本地文件，并验证 HLS manifest/init/segment、有效 duration、首个解码帧、时间推进以及 seek 后继续播放：

```bash
node scripts/media-compat/electron-first-frame-smoke.mjs \
  --file /absolute/path/video.mkv \
  --profile safe
```

`--profile` 接受 `audio`、`safe` 或 `hdr-sdr`。脚本只读取传入路径，不复制、修改或提交媒体内容。

## 本地真实样本矩阵

通用媒体兼容变更使用环境变量登记真实长视频，只保存样本槽位和预期特征，不把媒体路径、内容或探测结果提交到仓库：

```bash
MARCHEN_SMOKE_HEVC_MAIN10_HDR_EAC3=/absolute/path/video.mkv \
MARCHEN_SMOKE_AV1=/absolute/path/av1-video.mkv \
pnpm media-compat:smoke-matrix
```

未设置的槽位会以 `skipped/not-configured` 明确跳过；设置后文件不存在会返回失败。命令输出只包含文件名，不打印用户目录。可用槽位：

| 环境变量                             | 预期特征                      |
| ------------------------------------ | ----------------------------- |
| `MARCHEN_SMOKE_HEVC_MAIN10_HDR_EAC3` | HEVC Main10、HDR、EAC-3       |
| `MARCHEN_SMOKE_HEVC_MAIN10_SDR_FLAC` | HEVC Main10、SDR/未标记、FLAC |
| `MARCHEN_SMOKE_AV1`                  | AV1                           |
| `MARCHEN_SMOKE_VP9`                  | VP9                           |
| `MARCHEN_SMOKE_VC1`                  | VC-1                          |
| `MARCHEN_SMOKE_MPEG2`                | MPEG-2 Video                  |
| `MARCHEN_SMOKE_LONG_GOP`             | 长 GOP                        |
| `MARCHEN_SMOKE_VFR_NONZERO_START`    | VFR、非零 start time          |

## 长视频关键帧基准

下面的命令比较 Matroska cues 元数据读取与 Jellyfin 同类的 ffprobe 全关键帧扫描。输出只包含文件名、大小、耗时、峰值内存和时间戳差异，不包含完整路径：

```bash
pnpm media-compat:benchmark-keyframes -- /absolute/path/video.mkv
```

该命令要求本机安装 MKVToolNix 与 ffprobe，仅用于开发 spike，不属于常规 CI。

容器无关的 packet/关键帧与目标分片时间线可使用：

```bash
pnpm media-compat:analyze-timeline -- --segment-seconds 6 /absolute/path/video.mp4
```

分析器使用选中视频最后一个 packet 或视频 stream duration，而不是无条件使用 format duration，并报告非零起点、VFR packet duration 和关键帧聚合后的尾段。

视频 decoder/encoder 路径基准使用相同 H.264 fMP4 HLS 输出，对比软件解码 + VideoToolbox、纯软件和 VideoToolbox 解码/编码：

```bash
pnpm media-compat:benchmark-video -- \
  --file /absolute/path/video.mkv \
  --duration 30 \
  --start 0 \
  --start 1200
```

输出仅包含文件名和指标，临时 HLS session 在每个 case 结束后删除。

AAC encoder 基准会自动读取首条音轨，单声道保持 mono、其他布局下混 stereo，并比较 `aac_at` 与 bundled `aac`：

```bash
pnpm media-compat:benchmark-aac -- \
  --duration 60 \
  --start 0 \
  --start 600 \
  /absolute/path/eac3-video.mkv \
  /absolute/path/flac-video.mkv
```

每个 case 都检查 HLS 输出的 codec/profile/sample rate/channels/bitrate 与首个音频 PTS。

fMP4 init fingerprint 基准会从多个 seek 起点重启相同 pipeline，比较 sample entry、track id、timescale、extradata 与完整 init hash：

```bash
pnpm media-compat:benchmark-init -- \
  --file /absolute/path/hevc-eac3.mkv \
  --start 0 \
  --start 600 \
  --start 1200
```

动态 HLS/HLS.js spike 使用两个独立 FFmpeg Job、稳定 VOD manifest 和首次 404 后延迟提供的 segment，自动启动隐藏 Electron 验证前后 seek：

```bash
pnpm media-compat:spike-dynamic-hls
```

### 正式应用 v2 回归

生成 120 秒逐帧标记样本，然后启动独立开发实例。独立 userData 隔离 HISTORY 和单实例锁；先关闭该测试实例，再运行构建，避免旧 Main 与 HMR 后的 Renderer 使用不同 IPC 接口。

```bash
node scripts/media-compat/generate-v2-frame-marker.mjs
MARCHEN_DEV_USER_DATA_DIR=/tmp/marchen-v2-e2e \
VITE_MEDIA_COMPAT_PLANNER=generalized VITE_MEDIA_GATEWAY_V2=1 \
VITE_MEDIA_FORCE_METHOD=transcode \
VITE_MEDIA_FORCE_VIDEO_DECODER=software VITE_MEDIA_FORCE_VIDEO_ENCODER=software \
pnpm exec electron-vite --remoteDebuggingPort 9223
```

另一个终端运行：

```bash
node scripts/media-compat/electron-v2-seek-e2e.mjs
```

测试期间保持窗口可见。macOS 可显式设置 `MARCHEN_E2E_PID=<该测试 Electron 主进程 PID>` 维持前台，不能填写其他实例的 PID。脚本仅将弹幕匹配 adapter 替代为“无匹配”，结束时恢复；媒体导入、FFmpeg、Gateway、HLS 和 Runtime 真实运行。

检查稳定 URL、120 秒 VOD 清单、目标分片请求、6 次前后/片尾跳转及逐帧内容误差小于 0.15 秒。报告包含 Electron/Chromium、FFmpeg 和 HLS.js 版本。音视频 packet 连续性由正式 Publisher 及 `dynamic-hls-software-runtime.test.ts` 验证，不能把页面进度推进当作音画验收。

运行真实转码的 Main 测试使用 `pnpm test:main --maxWorkers=1`，期间避免并行构建或其他转码任务争抢 CPU。生产准备期限不会因测试负载自动放宽。
