# MP4、长 GOP 与 VFR 时间线 Spike

记录日期：2026-08-31

## 方法

新增容器无关分析器 `scripts/media-compat/analyze-keyframe-timeline.mjs`，使用 Marchen bundled ffprobe 读取选中视频全部 packet，完成：

- 按视频 stream/packet 计算真实开始和结束，不无条件使用 format duration；
- 将绝对 packet PTS 归一到逻辑视频时间；
- 从 packet flags 提取关键帧；
- 按“达到目标切点后的第一个关键帧”聚合 segment；
- 从相邻 packet PTS 判断 VFR，不依赖可能错误的平均帧率或 Matroska packet duration 字段；
- 输出 segment 总时长、最大间隔和尾段。

新增合成样本 `structure-h264-vfr-nonzero-start-long-gop.mp4`，与已有 MKV VFR、Main10 SDR/FLAC 长 GOP、HDR10/EAC-3 长 GOP 一起验证。原始脱敏数据见 [data/03-timeline-analysis.json](data/03-timeline-analysis.json)。

## 结果

| 样本                          |  start | 视频时长 | 关键帧（归一后） | 6 秒目标得到的 segment |
| ----------------------------- | -----: | -------: | ---------------- | ---------------------- |
| H.264 MP4 VFR/非零起点/长 GOP | 5.000s |  29.967s | 0、23.333        | 23.333、6.633          |
| H.264 MKV VFR/非零起点        | 5.000s |  29.966s | 0、20.000        | 20.000、9.966          |
| HEVC Main10 SDR/FLAC 长 GOP   |      0 |  30.000s | 0、10、20        | 10、10、10             |
| HEVC HDR10/EAC-3 长 GOP       |      0 |  30.000s | 0、10、20        | 10、10、10             |

两种 VFR 样本的 packet PTS delta 分别包含约 66/67/100ms。MKV 的 `r_frame_rate` 与 `avg_frame_rate` 都报告 30fps，packet `duration_time` 也近似固定 33ms，但真实 PTS 明确变化，因此 VFR 判断必须使用 PTS 序列。

MKV VFR 样本 format start/duration 为 5/34.966 秒，实际视频跨度为 29.966 秒；使用最后视频 packet 减去选中视频 start 可得到正确结果。四个样本的 segment 时长总和都与视频实际时长一致，尾段保持正数。

## 结论

1. 非零 start time 必须先从 packet PTS 中扣除，manifest 与播放器只暴露从零开始的逻辑时间；FFmpeg 实际首 PTS另行校准。
2. 目标 6 秒不是视频 copy 的强制分片长度。长 GOP MP4 的第一个安全 segment 达到 23.333 秒，说明固定 `hls_time=2/6` 不能制造不存在的关键帧。
3. 视频转码可以强制关键帧而形成等长分片；视频 copy 遇到过长关键帧 gap 时只能接受长 segment、补充更完整关键帧索引，或升级视频转码。
4. format duration 可能是绝对尾时间或被其他轨道延长；VOD timeline 必须优先视频 stream duration，否则使用最后视频 packet end。
5. 时间线应判为不可用并进入明确降级的条件包括：没有视频 packet、没有起始可用关键帧、关键帧非单调、视频 duration 非正数、最后边界产生负尾段、提取超时或最大 gap 超过待冻结体验门槛。

具体最大 gap 与超时门槛留到任务 1.9，结合 HLS.js 延迟 segment 和真实 seek 数据冻结；当前证据不支持把任意 copy 长 GOP 承诺为 1 秒级 seek。
