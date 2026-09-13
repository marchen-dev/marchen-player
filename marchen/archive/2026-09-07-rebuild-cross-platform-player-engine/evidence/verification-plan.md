# 依赖与验证矩阵

## 固定基线

- MediaBunny 1.55.7，提交 c67c5e4072cf834743498c45a5a5bdf058947aec。
- libav.js 6.10.9.0，提交 c05a676d16c1068cce6115594858c50a7ecad4b8，FFmpeg 9.0。
- Emscripten 6.0.5，decoder-hevc，-O3；普通 WASM 与线程版分别验证。
- libmedia 1.3.1 仅为历史对照，不进入正式依赖。
- 音频官方扩展、字幕解析、DSP 版本在对应关口锁定，尚未验证或决定的依赖不伪造版本。

## 样片

| 类别 | 来源 | 现有证据 | 必须补齐 |
| --- | --- | --- | --- |
| 1080p Main 8-bit | MediaBunny test/public/video-h265.mp4 | 180 帧普通/SIMD 对照 | 正式适配与像素校验 |
| 1080p Main10 HDR PQ + EAC3 | 用户授权 Arcane 测试影片 | MediaBunny 取包、Node 和 Chrome Worker 180 帧 | 全链路渲染/音频/字幕/seek/20 分钟 |
| 低分辨率 Main10 + EAC3 | 项目测试生成媒体 | 输出 10-bit 帧 | 仅功能检查，不能代替 1080p 性能 |
| HLG、4K、VFR、长 GOP、非零起点、损坏媒体 | 按对应任务准备可控生成与授权样片 | 未验证 | 参数核对与正式路径证据 |
| 内嵌 ASS/SSA/文本、多字幕、字体、图片字幕识别 | 按字幕关口准备 | 未验证 | 内容、时间、样式和失败隔离 |

影片不上传、不提交私有 fixture、磁盘路径或协议令牌。验证命令通过环境变量或命令参数选择本地文件。

## 平台和初始验收预算

参考机器 Apple M4；已有实验 Chrome 152.0.7977.77 headless，仅纯解码。Electron macOS arm64 打包版、Web Chrome/Edge 正式部署单独验证；macOS x64、Windows x64 无证据时标记未验证。Firefox/Safari 只记录能力，不冒充目标平台性能。

测前冻结 design 的条件：1080p24/30 Main10 连续 20 分钟，非 seek 掉帧 <1%，音画偏差绝对值 <=100 ms，冷首帧 <=5 秒，seek P95 <=2 秒且单次 <=5 秒，目标误差 <=max(1帧,50ms)。首次 WASM 初始化单列。4K 是压力检查。

读取缓存 32 MiB/源、缩略图 64 MiB、字体 32 MiB/媒体；应用视频队列 3 帧、音频 ahead 0.5 秒为初始预算。WASM 参考帧、线程栈、GPU 资源另外统计；实验 256 MiB 初始内存不得视为最终预算或根因修复。

流程：模块正确性 → 正式适配取帧与像素对照 → Electron/Web 带音频/字幕/弹幕的实际播放 → 打包/部署与长期资源验收。协议跨源隔离、远程封面、Sentry/PostHog 分别验证，不设置 CSP。缺失平台/样片不勾选相应任务。
