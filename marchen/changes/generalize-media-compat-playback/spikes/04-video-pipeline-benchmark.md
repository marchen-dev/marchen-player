# macOS HEVC Decoder/Encoder Pipeline Spike

记录日期：2026-08-31

## 方法

对两个 1080p HEVC Main10 长视频，在开头和随机 seek 点各处理 30 秒，统一输出 H.264 yuv420p fMP4 HLS、2 秒 segment、无音频，比较：

1. FFmpeg 软件 HEVC decode + `h264_videotoolbox` encode；
2. FFmpeg 软件 HEVC decode + `libx264 veryfast` encode；
3. VideoToolbox HEVC decode + `h264_videotoolbox` encode。

记录从进程启动到第一个完成 `.m4s` 的时间、30 秒窗口总 wall time、`/usr/bin/time -l` 的 user+sys/real 近似 CPU、峰值 RSS 和 FFmpeg speed。临时 HLS 输出在每个 case 后删除。原始脱敏数据见 [data/04-video-pipeline-benchmark.json](data/04-video-pipeline-benchmark.json)。

## 结果范围

| 路径                         | 首个 segment |   处理速度 | 近似 CPU |  峰值 RSS |
| ---------------------------- | -----------: | ---------: | -------: | --------: |
| 软件解码 + VideoToolbox 编码 |    444–659ms | 8.45–9.06x | 208–244% | 283–293MB |
| 软件解码 + libx264           |    254–658ms | 6.99–10.1x | 709–746% | 647–687MB |
| VideoToolbox 解码 + 编码     |    418–615ms | 7.95–8.50x | 111–118% | 436–466MB |

三条路径在两个样本、开头与 seek 点共 12 个 case 全部成功；每个窗口都生成 15 个 segment，实际输出时间接近 30 秒。seek 点首段最慢约 659ms，没有出现之前应用层 1 分钟等待。

VideoToolbox 编解码的 CPU 最低，约为软件解码 + 硬件编码的一半、纯软件的约六分之一。硬件 decode 的峰值 RSS 高于软件 decode + 硬件 encode，但仍明显低于 libx264。libx264 在部分 case wall time 略快，却持续占用约 7 核和约 650–690MB，不适合作为有 VideoToolbox 时的默认路径。

硬件编码使用固定 8Mbps，libx264 使用 CRF 20，输出体积和视觉质量不是同一控制模式，因此本 spike 只比较启动/吞吐/资源，不据此宣称两者画质等价。

## macOS 初始候选顺序

```text
auto:
  VideoToolbox decode + VideoToolbox H.264 encode
  → software decode + VideoToolbox H.264 encode
  → software decode + libx264

force software decode:
  software decode + VideoToolbox H.264 encode
  → software decode + libx264

force software decode + software encode:
  software decode + libx264
```

软件 HEVC decode 已由两个 Main10 样本证明可达到约 7–10x，必须保留为兼容兜底。硬件路径仍需在真实 input preflight 后才能使用，不能只依据 `-hwaccels/-decoders` 声明。

后续实现需要把 decoder 与 encoder 分开记录；“浏览器关闭硬件解码”不等于 FFmpeg 禁用 VideoToolbox，开发态必须能分别强制软件 decoder 和软件 encoder。
