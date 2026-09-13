## 目的

通过稳定 VOD 时间线和请求驱动的分片生产，为本地兼容播放提供快速首帧、低延迟 seek 与受控缓存。

### 需求: 稳定 VOD 清单与会话 URL

兼容会话 SHALL 在生命周期内暴露稳定的 HLS 入口和原始媒体逻辑时长；seek 与 FFmpeg Job 替换 MUST NOT 改变逻辑媒体身份。

#### 场景: 播放中随机 seek

- **GIVEN** 兼容会话已经进入 playable
- **WHEN** 用户从当前时间跳转到另一时间
- **THEN** HLS 入口 URL SHALL 保持稳定
- **AND** 播放器、字幕、弹幕和 HISTORY SHALL 继续使用原媒体逻辑时间

### 需求: 视频复制使用关键帧时间线

视频 copy/remux 时，分片边界 SHALL 依据真实可用关键帧；关键帧事实不可获得时系统 MUST 使用明确的降级策略，不得把任意等长时间点承诺为独立分片边界。

#### 场景: 长 GOP HEVC 视频只转音频

- **GIVEN** 输入 HEVC 允许视频 copy 且关键帧间隔不固定
- **WHEN** 系统生成 VOD 清单
- **THEN** 每个媒体分片起点 SHALL 对齐可用关键帧
- **AND** 清单时长总和 SHALL 与原视频逻辑时长一致到允许误差内

### 需求: 视频转码形成可预测分片

视频重新编码时，系统 SHALL 生成与目标分片时间线匹配的闭合 GOP 和关键帧，使清单分片可独立解码。

#### 场景: 软件转码 VP9 到 H.264

- **GIVEN** 输入 VP9 需要视频转码
- **WHEN** 系统生产连续 HLS 分片
- **THEN** 每个计划分片 SHALL 从 H.264 关键帧开始
- **AND** 任一已发布分片 SHALL 可与对应 init segment 组成可验证媒体片段

### 需求: segment 请求驱动作业

请求的 init 或媒体 segment 不存在时，系统 SHALL 启动或复用覆盖该时间位置的 Playback Job；反向请求或超出当前生产窗口的远距离请求 SHALL 安全替换旧 Job。

#### 场景: seek 到尚未生产的位置

- **GIVEN** 目标 segment 尚未存在
- **AND** 当前 Job 正在生产远离目标的位置
- **WHEN** HLS 客户端请求目标 segment
- **THEN** 系统 SHALL 等待旧活动响应结束后停止旧 Job
- **AND** 新 Job SHALL 从目标 segment 对应时间附近生产
- **AND** 请求 SHALL 最终获得目标 segment 或结构化失败响应

### 需求: 只发布完整资源

VOD manifest SHALL 可提前列出尚未生产的逻辑分片端点；manifest 自身必须完整。init 与媒体端点只有在资源完整写入并通过对应验证后才能返回媒体数据，MUST NOT 暴露临时文件或工作目录路径。

#### 场景: FFmpeg 正在写下一个 segment

- **GIVEN** 下一个 segment 仍是临时文件
- **WHEN** 客户端刷新 HLS 清单
- **THEN** 可见清单 MAY 保留该分片的稳定逻辑端点，但 MUST NOT 引用临时文件
- **AND** 请求该端点 SHALL 等待完整资源或得到明确失败
- **AND** 已发布 segment SHALL 保持不可变

### 需求: 首帧与 seek 期限可验收

系统 MUST 分别记录会话准备、首个可用 segment、浏览器首帧和 seek 恢复耗时，并为真实样本定义可配置验收期限。

#### 场景: 目标附近生产成功

- **GIVEN** 本地磁盘输入且运行时可实时处理该媒体
- **WHEN** 用户请求随机 seek
- **THEN** 系统 SHALL 记录从请求到 currentTime 再次推进的耗时
- **AND** 超过期限时 SHALL 报告实际阻塞阶段而非统一媒体错误

### 需求: 分片范围变化可验证且不导致错位

系统 SHALL 保留 HLS muxer，按累计目标切点生成关键帧计划清单，并记录 Job 实际分片范围。跨 Job 同编号分片不要求范围完全一致；变化仅可在对应正式管线、客户端版本和已验证界限内接受。Publisher MUST 核对 EXTINF、实际音视频时间覆盖、尾段与 init，MUST NOT 仅按文件名发布或通过修改已交付清单掩盖错位。未验证的边界变化 MUST NOT 直接放行。

#### 场景: 非等间隔关键帧

- **GIVEN** 从零和中间启动 Job 得到不同分片边界
- **WHEN** 系统验证该输出组合
- **THEN** SHALL 分别记录计划范围与实际范围，并检查客户端目标可达、画面时间对应和音画连续性
- **AND** 无报错或 currentTime 推进 MUST NOT 单独作为通过依据

#### 场景: 清理后相同编号再生成

- **GIVEN** 旧分片已安全清理，而相邻分片或客户端缓存仍存在
- **WHEN** 新 Job 重新生成该编号
- **THEN** init SHALL 兼容，再生输出 SHALL 与剩余资源正确衔接并保持原媒体时间
- **AND** 当前已发布资源 MUST NOT 被覆盖，造成错位或不可恢复缺口的输出 MUST 拒绝

### 需求: 尾段请求与画面时间保持正确

尾段 seek 的输入起点、首关键帧与分片编号 MUST 联合验证，不得未经验证提前输入起点却沿用错误编号。验收 SHALL 检查原媒体内容时间与播放器逻辑时间，而不仅检查状态或事件。

#### 场景: 片尾再跳回片头

- **GIVEN** 客户端请求最末片段并发生 Job 重启
- **WHEN** 用户再跳回片头
- **THEN** 目标 SHALL 可达，画面 SHALL 对应原媒体时间，音视频 SHALL 连续
- **AND** MUST NOT 出现虚增总时长或无报错的时间/内容错位
