# Dynamic HLS 第一版运行门槛

记录日期：2026-08-31

这些数值根据任务 1.3–1.8 的本机真实样本和 Electron/HLS.js spike 冻结，用于第一版实现、测试与阶段诊断。它们是内部可配置常量，不是永久产品承诺；后续若调整必须保留原始指标和回归证据。机器负载、外置卷缓存和媒体复杂度会影响耗时，因此“目标超出”只记录性能退化，“硬期限超出”才允许停止对应阶段。

机器可读值见 [data/08-initial-thresholds.json](data/08-initial-thresholds.json)。

## 关键帧与 Segment

| 项目                             | 第一版值 |
| -------------------------------- | -------: |
| Matroska metadata 优选期限       |     2 秒 |
| 冷关键帧准备总硬期限             |     8 秒 |
| 视频 copy 目标 segment           |     6 秒 |
| 视频 transcode 目标 segment      |     2 秒 |
| metadata 快路径最大 gap 质量门槛 |    12 秒 |
| 超过后标记 degraded              |    12 秒 |
| 动态 copy 不可接受 gap           |    30 秒 |

依据：两个长 MKV 的 metadata 为 1.2–5.4 秒，bundled ffprobe 为 3.4–4.5 秒；一个 cues 集合完整，另一个是 ffprobe 的安全子集但最大 gap 从 9.9 秒扩大到 22 秒。metadata 在 2 秒内且最大 gap 不超过 12 秒时可直接采用；否则补充/切换 ffprobe。完整冷准备最多 8 秒。

超过 8 秒不得因为“索引慢”自动转码原本支持的视频。迁移第一阶段回退已验证的 v1 EVENT transport，并允许后台完成指纹缓存；只有视频本身不支持、实际 decode 失败、用户强制全转码或动态 copy 永久无法形成安全边界时才进入视频转码。

视频 copy 的实际 segment 必须落在关键帧，6 秒只是聚合目标。12–30 秒 gap 可播放但必须标记 seek-degraded；超过 30 秒首阶段不启用 v2 dynamic copy。视频 transcode 使用 2 秒闭合 GOP，与现有首段 0.25–0.66 秒结果匹配。

## 首帧与 Segment Waiter

| 阶段                           |   目标 | 硬期限 |
| ------------------------------ | -----: | -----: |
| Job start → 首个完整 segment   |   1 秒 |   3 秒 |
| segment available → 浏览器首帧 | 1.5 秒 |   5 秒 |
| warm prepare → 浏览器首帧      |   3 秒 |   8 秒 |
| 单个缺失 segment waiter        |      — |  10 秒 |

依据：两个 HEVC Main10 视频的 H.264 首段为 0.25–0.66 秒，AAC 首段为 0.05–0.10 秒。动态 HLS spike 的 404 + 500ms 延迟重试仍能恢复。正式 Gateway 应持有缺失 segment 请求，10 秒内等待 Job 发布；超过后返回结构化 segment-timeout，不无限挂起。

硬期限必须按 profile/probe/keyframe/preflight/job/segment/MSE/first-frame 分阶段计算。达到目标以外只记录 degraded；达到硬期限后也只能依据错误类别推进 attempt，不允许把权限、磁盘、源文件或取消错误误判为 codec 不支持。

## Seek

| 项目            | 第一版值 |
| --------------- | -------: |
| seek 恢复目标   |   1.5 秒 |
| seek 恢复硬期限 |     5 秒 |

恢复完成定义为目标 segment 请求后，video currentTime 到达目标允许误差并再次连续推进/解码帧。HLS.js spike 已验证同一 manifest/init 下前后 seek 与 segment retry；真实视频首次目标为 1.5 秒，5 秒后报告具体 Job/segment/MSE 阶段。

## Job Ahead、Idle 与未来 Back Window

| 项目                         | 第一版值 |
| ---------------------------- | -------: |
| ahead 低水位，恢复生产       |    20 秒 |
| ahead 高水位，暂停/停止生产  |    60 秒 |
| ahead 硬上限                 |    90 秒 |
| 无请求/心跳空闲停止          |    60 秒 |
| 未来启用旧分片清理后的回看窗 |   120 秒 |

第一阶段不删除已消费分片，只控制未来 ahead，证明不会默认生成完整影片。生产位置达到 60 秒 ahead 时暂停；低于 20 秒恢复；不能可靠暂停时最晚在 90 秒停止并从下一个 segment 重启。lease release 立即停止，不等待 idle timer。

120 秒 back window 只在反向 seek 再生成和活动请求保护通过后启用；此前该值不触发删除。

## 验收解释

- 目标值用于性能回归和播放信息，不直接改变正确性路线；
- 硬期限用于取消阶段任务和产生结构化错误；
- slow/timeout 本身不等于 `video-codec-not-supported`；
- 软件 decoder 是最终兼容兜底，硬件候选失败按已定义顺序回退；
- 所有阈值测试同时记录输入类型、decoder/encoder、源存储与机器环境，不能用合成 320×180 样本替代真实长片。
