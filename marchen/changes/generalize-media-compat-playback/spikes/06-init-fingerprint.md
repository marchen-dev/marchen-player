# fMP4 Init Fingerprint Spike

记录日期：2026-08-31

## 方法

对同一个 HEVC Main10 HDR + EAC-3 长视频，在 0、600、1200 秒重启以下相同 pipeline：

- HEVC copy/hvc1 + EAC-3 → `aac_at`；
- VideoToolbox H.264 + `aac_at`；
- libx264 H.264 + `aac_at`。

每次生成 6 秒 fMP4 HLS，读取 init 的完整 SHA-256，并用 bundled ffprobe 提取所有轨道的 codec、sample entry、Profile、Level、track id、time base、extradata size 与 extradata SHA-256。原始脱敏结果见 [data/06-init-fingerprint.json](data/06-init-fingerprint.json)。

## 结果

| Pipeline                 | 流 fingerprint | 完整 init 字节 | 结论                          |
| ------------------------ | -------------- | -------------- | ----------------------------- |
| HEVC copy + AAC          | 三次完全一致   | 三次不同       | 解码配置稳定，非关键 box 变化 |
| VideoToolbox H.264 + AAC | 三次完全一致   | 三次完全一致   | 可复用                        |
| libx264 H.264 + AAC      | 三次完全一致   | 三次完全一致   | 可复用                        |

HEVC copy 三次始终为：

- video track `0x1`、HEVC Main10 Level 120、`hvc1`、time base `1/16000`、276 字节相同 extradata；
- audio track `0x2`、AAC `mp4a`、time base `1/48000`、2 字节相同 extradata。

但完整 init 大小为 2353/2365/2365 字节，完整 hash 都不同。H.264 两个 encoder 的 init 大小和完整 hash 各自在三个起点完全一致。

## Fingerprint 决策

兼容性 fingerprint SHALL 至少包含：

```text
每条输出轨道的顺序
track id
codec
sample entry
Profile/Level（存在时）
time base / timescale
extradata bytes hash
```

不得把完整 init 文件 hash 作为唯一兼容判断。完整字节可包含与 seek 起点相关但不改变 decoder configuration 的 box；对 HEVC copy 若要求完整 hash 相同，会错误地把可兼容重启判为失败。

Session 应固定并发布第一次通过 Producer Validator 的 init。后续 Job 只验证流 fingerprint：

- 相同则保留原 init，仅发布新 fragment；
- 不同则禁止把 fragment 混入当前 SegmentStore，并进入 attempt 失败/重新附着边界；
- 不得在 HLS 客户端使用旧 init 时静默覆盖为不兼容 init。

本 spike 证明静态流 fingerprint 在三个常用 pipeline、三个 seek 起点稳定；是否能用首次 init 连续 append 后续 Job 的 fragment，仍由任务 1.8 的真实 HLS.js/MSE 实验决定。
