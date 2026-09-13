# 首次字幕读取分段诊断

2026-09-13，在 feat/player-engine 当前工作区，通过独立 Electron 开发窗口加载 localhost:5173 的真实模块。使用真实媒体租约与 openRangeSource，直接调用字幕解析和字体模块；未同时启动视频解码，也未把 libass 初始化计入这些阶段。脚本位于 .tmp/subtitle-phase-profile.mjs。

样本：用户提供的 Ave Mujica 第 06 集 MKV，选择轨道 3 Simplified Chinese。

| 阶段 | 耗时 | source.read 次数 | 读取字节 |
| --- | ---: | ---: | ---: |
| 元数据 | 17.60 ms | 1 | 1,048,576 |
| 全片字幕扫描 | 12,342.32 ms | 905 | 948,580,158 |
| 字体（含附件预检） | 1,417.26 ms | 854 | 4,021,775 |

扫描得到 405 条字幕、正文 UTF-8 21,940 字节。扫描阶段累积等待 source.read 为 12,253.05 ms；字体得到 11 个字体、3,949,800 字节。此单次诊断不能代表端到端冷启动或历史版本 A/B，但已证明无需视频解码即可出现十几秒的字幕准备延迟。

当前 Reader 的 1 MiB 预读窗口减少小请求，却把大量音视频载荷一并读入。cues 逐块遍历完整 Segment；resolveEmbeddedSubtitle 等待全部 cues，再串行等待 loadSubtitleFonts，才创建完整字幕 URL。附件预检未启用读缓存，仍逐个结构头读取。未发现此耗时由 video 呈现本身造成的证据。

历史对照：HEAD (Canvas 版本) 的 resolve.ts 与当前完全一致，同样等待全片扫描后才交给 libass；当前 1 MiB 预读为工作区后续改动。更早 8ce47f2 使用主进程 FFmpeg 提取，但本次没有运行旧版本，不能声称已验证用户所述两秒基线，也不能把两个不同旧版本混同。

本轮仅诊断并保存数据，未修改生产代码。
