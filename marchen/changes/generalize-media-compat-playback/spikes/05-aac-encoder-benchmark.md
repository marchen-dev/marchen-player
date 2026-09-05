# macOS AAC Encoder Spike

记录日期：2026-08-31

## 方法

使用 Marchen bundled FFmpeg，将以下输入转为 AAC-LC 48kHz fMP4 HLS、目标 192kbps、2 秒 segment：

- 30 秒合成 FLAC mono，输出保持单声道；
- 真实 EAC-3 5.1 长片，输出下混 stereo，在 0 秒与 600 秒测试；
- 真实 FLAC stereo 长片，输出保持 stereo，在 0 秒与 600 秒测试。

每个 case 比较 `aac_at` 与 bundled `aac`，检查首个 segment、总 wall time、处理 speed、codec/Profile、声道、采样率、bitrate 和首音频 PTS。原始脱敏数据见 [data/05-aac-encoder-benchmark.json](data/05-aac-encoder-benchmark.json)。

## 参数兼容发现

`aac_at` 虽出现在 `-encoders` 中，但不接受当前软件 AAC preset 使用的：

```text
-profile:a aac_low
```

带该参数时三个输入都会在 encoder 初始化阶段失败。查询 encoder options 后按 Jellyfin 同类命令移除 `-profile:a`，仅保留 bitrate/sample rate/channels，所有 `aac_at` case 成功且 ffprobe 输出均为 AAC LC。

因此音频 encoder 选择必须同时选择 encoder-specific arguments，不能只替换 `-c:a`。

## 结果

| 输入               | `aac_at` speed | `aac` speed | `aac_at` wall | `aac` wall | 首段范围 |
| ------------------ | -------------: | ----------: | ------------: | ---------: | -------: |
| FLAC mono 30 秒    |           273x |       40.1x |         0.15s |      0.76s |  81–98ms |
| EAC-3 5.1 → stereo |       143–145x |     88–103x |         0.44s | 0.60–0.70s |  61–75ms |
| FLAC stereo        |       138–153x |  89.8–89.9x |    0.41–0.45s |      0.68s |  49–81ms |

所有成功输出均满足：

- codec AAC、Profile LC、sample rate 48000Hz；
- mono 输入保持 1 声道；
- stereo 保持 2 声道；
- EAC-3 5.1 下混为 stereo；
- 开头与 600 秒 seek generation 的首个音频 PTS 都为 0；
- 首个完成 segment 都小于 100ms。

`aac_at` 总吞吐明显更高，尤其 mono FLAC 达到约 6.8 倍；首段时间两者都很低，没有一致胜负。`aac_at` 的近似 CPU 略高，但 wall time 更短。目标 192kbps 下 `aac_at` 输出更稳定接近目标；软件 AAC 在短首段上的估算 bitrate 有波动。

## 结论与顺序

macOS 初始选择：

```text
aac_at（不传 aac_low profile）
→ bundled aac（传 aac_low）
```

选择前必须用对应参数真实初始化；`aac_at` 初始化失败后才回退软件 AAC。音频编码本身首段小于 100ms，之前应用等待几十秒到一分钟不能归因于 EAC-3/FLAC 转 AAC 的计算速度，而应继续检查 preflight、HLS 发布、关键帧和播放器 attach。
