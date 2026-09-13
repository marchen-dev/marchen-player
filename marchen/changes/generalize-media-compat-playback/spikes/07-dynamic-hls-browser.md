# Dynamic HLS + HLS.js Spike

记录日期：2026-08-31

## 实验结构

新增 `media-compat:spike-dynamic-hls`，自动执行：

1. 生成 32 秒 H.264/AAC MP4，2 秒闭合 GOP；
2. 启动两个独立 FFmpeg copy Job，分别覆盖 0–16 秒与 16–32 秒；
3. Main 侧测试 server 生成单个稳定 VOD m3u8，始终只提供第一个 Job 的 init；
4. 后半段 Job 使用连续 start number，并使用 Jellyfin fMP4 同类参数 `frag_discont+skip_sidx`；
5. 隐藏 Electron 44 + HLS.js 1.7.1 加载一次 manifest；
6. 从开头 metadata 前跳 21 秒，目标后半段 segment 第一次返回 404，第二次等待 500ms 后返回；
7. 验证视频推进到 22 秒以上，再反向 seek 到 1 秒并验证推进到 2 秒以上；
8. 记录 HLS.js 错误、fragment 请求、decoded frames、buffer 和 manifest/init 请求次数。

所有媒体与 HLS 文件都位于临时目录，结束后删除。原始脱敏结果见 [data/07-dynamic-hls-browser.json](data/07-dynamic-hls-browser.json)。

## 失败实验与修正

第一次把当前 generation 参数直接组合为两个短 Job：

```text
-copyts -start_at_zero -ss 16 ... -t 16
```

第二个 Job 只产生约 0.25 秒 fragment，HLS.js duration 停在 16.12 秒并发生 `bufferAppendNoProgress`。原因不是稳定 manifest 本身，而是 `-copyts` 下 `-t` 与 seek 时间的终止语义不适合该动态 Job 组合。

修正为第二个 Job从目标点运行到源文件结束，并补充 Jellyfin fMP4 HLS 使用的：

```text
-copyts -avoid_negative_ts disabled -start_at_zero
-hls_segment_options movflags=+frag_discont+skip_sidx
```

后续实验通过。实现阶段必须由 timeline/compiler 明确 Job 覆盖范围和时间参数，不能简单把现有 generation 的 `-ss/-t` 拼到动态 HLS。

## 通过结果

- stable manifest 只请求 1 次；
- init 只请求 1 次，后半段使用首次 init 成功解码；
- 后半段目标 `segment-00011.m4s` 第一次 404，HLS.js 记录 non-fatal `fragLoadError`；
- HLS.js 自动重试同一 segment，第 2 次延迟 500ms 后成功；
- 前跳后 currentTime 22.034 秒、decoded frames 37；
- 反向 seek 后 currentTime 2.031 秒、decoded frames 73；
- 反向 seek 实际重新请求 segment 0–3；
- 最终 `video.error=null`、readyState=4，前后 buffer ranges 同时存在；
- manifest 逻辑 20.029 秒 segment 实际 append 起点约 19.901 秒，约 128ms 差异来自音频/fragment 时间校准，未阻止播放。

## 结论

1. HLS.js 支持稳定 VOD manifest 下请求尚未生产的远端 segment；短暂 404 可以通过同 URL 重试恢复，但正式实现更应让 Gateway 持有请求等待 Job，减少无意义错误日志。
2. 普通 forward/backward seek 不需要替换 media source 或重新请求 manifest/init；稳定 session URL 可行。
3. 不同 FFmpeg Job 的 fragment 可以复用首次 init，前提是流 fingerprint 一致且输出时间戳连续；任务 1.7 的 fingerprint 可以成为发布门禁。
4. `frag_discont+skip_sidx`、copy timestamp 与 start/duration 组合属于正确性参数，不能视为可选性能优化。
5. SegmentStore 需要将“尚未生产”表示为 waiter，而不是立即永久 404；客户端取消只取消 waiter，不应误杀 Job。
6. HLS timeline 必须接受实际 fragment PTS 与计划 start 的小偏差，并记录校准值，字幕、弹幕和 HISTORY 仍使用逻辑时间。

该实验已证明缺失分片等待/重试、稳定入口、两个 Job、单 init、前跳与反向 seek 的浏览器可行性，可以进入 Dynamic HLS 正式设计实现。
