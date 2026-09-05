## 目的

把兼容协商结果编译为确定、可验证且可回退的本地媒体处理管线，同时保证兼容轨道不被不必要地重编码。

### 需求: 固定兼容输出契约

视频转码输出 SHALL 为 Chromium 可播放的 H.264 8-bit 4:2:0；音频转码输出 SHALL 为目标端支持的 AAC-LC；首阶段 MUST NOT 以 HEVC 或 AV1 作为兼容输出。

#### 场景: 任意可解码视频进入兼容输出

- **GIVEN** 协商结果要求视频转码
- **WHEN** 系统生成媒体处理管线
- **THEN** 目标视频 SHALL 为 H.264 8-bit 4:2:0
- **AND** 目标容器 SHALL 为 fMP4 HLS

### 需求: 轨道动作保持独立

管线 MUST 分别执行视频 copy/transcode 与音频 copy/transcode，并使用确定的主轨道索引；未选中轨道不得依赖隐式自动选择。

#### 场景: 只转换音频

- **GIVEN** 决策为视频 copy、音频 transcode-to-aac
- **WHEN** 系统启动管线
- **THEN** 视频轨道 SHALL bitstream copy
- **AND** 音频轨道 SHALL 输出 AAC-LC
- **AND** 其他音视频轨道 SHALL 不进入输出

### 需求: decoder 与 encoder 可验证选择

系统 SHALL 支持 auto、hardware 与 software 视频处理模式；auto 模式可尝试受支持的硬件路径，初始化或真实输入验证失败后 MUST 回退软件路径或返回结构化错误。

#### 场景: 硬件编码器存在但无法初始化

- **GIVEN** 运行时列出硬件 H.264 encoder
- **AND** 该 encoder 在当前设备无法初始化
- **WHEN** 系统准备视频转码
- **THEN** 系统 SHALL 尝试软件 H.264 encoder
- **AND** attempt chain SHALL 记录硬件初始化失败

#### 场景: 强制软件解码

- **GIVEN** 开发态明确要求 software decoder
- **WHEN** 系统生成视频转码管线
- **THEN** 管线 MUST NOT 使用硬件视频 decoder
- **AND** 播放信息 SHALL 标记 decoderClass=software

### 需求: 音频编码器有序回退

系统 SHALL 根据平台和真实初始化结果选择 AAC encoder；macOS SHOULD 优先系统 AAC encoder，失败后回退可用软件 AAC encoder。

#### 场景: macOS 系统 AAC 可用

- **GIVEN** 当前平台为 macOS
- **AND** 系统 AAC encoder 可初始化
- **WHEN** 音频需要转为 AAC
- **THEN** 系统 SHALL 使用该 encoder
- **AND** 输出 SHALL 满足既定采样率、声道和码率契约

### 需求: 动态范围处理保持显式

只有输入具有明确 HDR10/HLG 事实且客户端不能按原动态范围播放时，系统 MAY tone-map 到 SDR；高位深、BT.2020 或未知色彩事实本身 MUST NOT 推导为 HDR。

#### 场景: 10-bit SDR 视频转码

- **GIVEN** 输入为 10-bit 且没有明确 HDR transfer
- **WHEN** 视频必须转为 H.264
- **THEN** 输出 SHALL 转换为兼容 8-bit 像素格式
- **AND** 管线 MUST NOT 启用 HDR tone-map

### 需求: 管线启动前验证

编码器、选流、decoder、滤镜、时间戳和目标封装 MUST 在长任务启动前通过有界验证；验证失败 SHALL 返回分阶段错误且不得污染当前可见会话。

#### 场景: 输入 codec 可声明但实际无法解码

- **GIVEN** runtime 能力目录声明存在输入 decoder
- **AND** 真实输入短验证发生解码错误
- **WHEN** 系统准备播放 Job
- **THEN** 管线 SHALL 在正式生产前失败
- **AND** 错误 SHALL 包含 pipeline-preflight 阶段与有限 stderr 摘要

### 需求: 动态 fMP4 实验与正式编译器一致

正式动态管线 MUST 承接已验证的时间戳与 fMP4 参数，包括当前 spike 的 `-avoid_negative_ts disabled` 和 `movflags=+frag_discont+skip_sidx`，并按 bundled 版本验证；浏览器验收 MUST 复用正式 compiler、publisher 与 router，不得仅验证独立脚本参数。

#### 场景: 从中间分片重启

- **GIVEN** 同一 pipeline 在不同逻辑起点启动
- **WHEN** 正式 compiler 生成 FFmpeg 参数并生产分片
- **THEN** 输出 SHALL 保持约定的逻辑时间与 init 兼容性
- **AND** 其参数和发布链 SHALL 与真实应用路径一致

### 需求: 进程控制与启动参数一致

声明 stdin 优雅停止的长任务 MUST 开启可写 stdin 且不得禁用交互；不可用时 SHALL 明确采用其他停止策略。停止是否成功 MUST 由进程退出证据确认。

#### 场景: 使用 q 优雅退出

- **GIVEN** Job 使用 stdin q 作为停止方式
- **WHEN** 系统启动并停止 Job
- **THEN** 参数 MUST NOT 包含阻止交互的 `-nostdin`
- **AND** 超过退出期限 SHALL 执行有界强制终止，未完成分片 MUST NOT 发布

### 需求: HLS 尾段起点、偏移与编号联合验证

正式管线 SHALL 继续使用 HLS muxer，不以跨 Job 边界差异为唯一理由更换 muxer。MUST NOT 无条件照搬 `duration - 5` 片尾钳制或 `+0.5 秒` seek 偏移；任何偏移 SHALL 验证实际首关键帧、目标覆盖、时间戳与输出编号关系。

#### 场景: 末段不足五秒

- **GIVEN** 请求的末段计划起点位于影片最后五秒内
- **WHEN** compiler 生成输入 seek 与 start_number
- **THEN** MUST NOT 未经验证将起点钳制到更早位置并沿用末段编号
- **AND** SHALL 验证最短尾段、AAC 延迟和非零源起点的有效输出
