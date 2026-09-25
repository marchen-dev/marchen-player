# MKV 关键帧提取 Spike

记录日期：2026-08-31

## 方法

- Matroska metadata：使用 `mkvextract cues` 读取视频轨道已有 cues，不启用 full parse；
- 全关键帧扫描：使用 Marchen bundled ffprobe，参数与 Jellyfin 的 `-skip_frame nokey -show_entries packet=pts_time,flags` 路径一致；
- 样本来自本机外置卷，报告只保留特征标签，不记录完整路径；
- 每条方法记录 wall time、macOS maximum resident set size、关键帧数量和间隔；
- 两组时间戳按 2ms 容差双指针匹配，避免 cues 子集造成按序号比较错位。

可复现命令：

```bash
pnpm media-compat:benchmark-keyframes -- <long-mkv> [<long-mkv>...]
```

原始脱敏数据见 [data/02-keyframe-benchmark.json](data/02-keyframe-benchmark.json)。单次 wall time 会受外置卷缓存影响，只用于发现数量、时间线和数量级差异，不作为最终性能阈值。

## 结果

| 样本                         | 方法            | wall time | 峰值 RSS | 关键帧 | P95 间隔 | 最大间隔 |
| ---------------------------- | --------------- | --------: | -------: | -----: | -------: | -------: |
| HEVC Main10 HDR + EAC-3 长片 | Matroska cues   |    5.409s |   20.3MB |    407 |  11.250s |  21.958s |
| HEVC Main10 HDR + EAC-3 长片 | bundled ffprobe |    3.409s |   28.6MB |    477 |   8.875s |   9.916s |
| HEVC Main10 + FLAC 长片      | Matroska cues   |    1.218s |   18.3MB |    278 |  10.427s |  10.428s |
| HEVC Main10 + FLAC 长片      | bundled ffprobe |    4.548s |   19.3MB |    278 |  10.427s |  10.428s |

第二个样本中 278 个 cues 与 ffprobe 关键帧全部匹配。第一个样本中 407 个 cues 全部是有效关键帧，但 ffprobe 额外发现 70 个关键帧；metadata 是安全子集，却会把最大分片间隔从约 9.9 秒放大到约 22 秒。

## 时长异常

第一个样本的容器 duration 为 2431.136 秒，但视频 packet 实际只到约 2322.6 秒，最后视频关键帧为 2320.292 秒。容器尾部约 108 秒由其他轨道延长。若 VOD timeline 直接使用 format duration，会构造约 109 秒的假视频尾段。

因此 timeline duration 必须优先使用选中视频的真实结束时间；stream duration 缺失时需要从 Matroska track metadata、最后视频 packet 或一次有界校准获得，不能只使用 format duration。

## 结论

1. Matroska metadata 不能被假设为始终更快；两个样本分别表现为比 ffprobe 慢约 1.6 倍和快约 3.7 倍。
2. cues 中的时间点可以作为安全边界，但可能是稀疏子集；在最大间隔超过待冻结门槛时应后台补充 ffprobe 扫描或选择视频转码，不能无条件生成超长 copy segment。
3. 关键帧结果必须按源指纹持久缓存，不能在每次 seek 前重新扫描。
4. 首次实现可优先尝试 metadata，并同时执行质量门禁：首帧存在、单调递增、末端覆盖合理、最大 gap 可接受；失败或过稀再走 ffprobe。
5. 关键帧数量一致不代表 duration 正确，segment timeline 还必须独立校验选中视频结束时间。

本 spike 已回答 metadata 与 ffprobe 的正确性、速度、内存和关键帧覆盖差异；最终 gap/准备期限在任务 1.9 结合 HLS.js 与 seek 结果冻结。
