# 当前媒体兼容链路基线

记录日期：2026-08-31

本基线只固定 `generalize-media-compat-playback` 实施前已经由自动化测试证明的行为。真实长视频的首帧、seek、CPU 与缓存指标由后续 1.2–1.9 spike 单独记录，不能用本页的单元/集成通过结果替代。

## 验证命令

```bash
pnpm exec vitest run --config vitest.player-runtime.config.ts \
  src/renderer/src/services/player-runtime/tests/media-compat-baseline.test.ts \
  src/renderer/src/services/player-runtime/tests/playback-plan.test.ts \
  src/renderer/src/services/player-runtime/tests/media-capabilities.test.ts \
  src/renderer/src/services/player-runtime/tests/browser-playback-readiness.test.ts \
  src/renderer/src/services/player-runtime/tests/hls-playback-controller.test.ts \
  src/renderer/src/services/player-runtime/tests/fallback-controller.test.ts \
  src/renderer/src/services/player-runtime/tests/playback-lease.test.ts \
  src/renderer/src/services/telemetry/tests/playback-observer.test.ts

pnpm exec vitest run --config vitest.main.config.ts \
  src/main/modules/ffmpeg/runtime.test.ts \
  src/main/modules/ffmpeg/cache.test.ts \
  src/main/modules/ffmpeg/hls-preset.test.ts \
  src/main/modules/media-gateway/compatible-session-factory.test.ts \
  src/main/modules/media-gateway/hls-generation-publisher.test.ts \
  src/main/modules/media-gateway/producer-validator.test.ts \
  src/main/modules/media-gateway/seekable-transcode-session.test.ts
```

结果：

- Renderer/player-runtime：8 个文件、67 个测试通过；
- Main/FFmpeg/Gateway：7 个文件、35 个测试通过；
- 合计：15 个文件、102 个测试通过。

## 已证明的当前行为

### Direct Play

- Electron 直放 lease 使用内部媒体协议提供单区间 Range；无 Range 请求当前返回 416。
- Web 为本地 File 创建独立 Blob URL，并由 lease 幂等释放。
- HISTORY、播放列表、字幕和截图仍以原始媒体身份工作，不持久化临时 HLS URL。

### 当前规划

- 完整容器与主轨道兼容时选择 `native`，不启动 FFmpeg。
- 视频在目标 fMP4 中明确受支持、但容器或音频不兼容时选择 `copy-video-aac`。
- 视频 `supported=false` 或原生实际 decode 回退时选择 H.264/AAC 安全档位。
- `smooth=false` 与 `powerEfficient=false` 不触发视频转码。
- HDR10/HLG 且必须转视频时使用 HDR→SDR 档位；10-bit 本身不推导为 HDR。

### Producer 与浏览器确认

- FFmpeg runtime 会校验固定版本和已声明 decoder/encoder/filter/format/protocol。
- H.264 encoder 先真实初始化硬件候选，再回退 libx264。
- producer 使用显式选流、fMP4 HLS、临时文件 rename、首段验证和时间线校准。
- Gateway 只登记完整资源；manifest 快照在所有引用资源登记后才可见。
- Renderer 在 SourceBuffer 建立、有效 metadata/duration 与首个解码帧后才确认 playable。

### 当前 seek、缓存与清理

- 兼容 seek 串行释放旧 generation，再从目标时间启动新 generation；过期 generation 不得覆盖当前媒体。
- session 具有缓存预算、最小磁盘空间与带 marker 的 TTL 清理；lease release 删除整个 session。
- FFmpeg 调度器限制重型任务并优先前台播放。

## 尚未由该基线证明

- 不证明真实长视频首帧或 seek 达到目标时延；
- 不证明 FFmpeg 不会继续生成完整影片；
- 不证明关键帧时间线适用于长 GOP/VFR/非零 start time；
- 不证明 AV1、VP9、VC-1、MPEG-2 能自动进入兼容转码；
- 不证明 `aac_at`、硬件 decoder 或纯软件 decoder 的性能与稳定性；
- 不证明 Job 重启后 fMP4 init 可以被同一 SourceBuffer 安全复用。

这些缺口正是后续 spike 与实现任务的门禁，完成前不得宣称新通用链路已经达到 Jellyfin 的启动和 seek 体验。
