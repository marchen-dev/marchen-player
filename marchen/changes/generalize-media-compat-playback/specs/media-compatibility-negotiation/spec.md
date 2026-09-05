## 目的

根据输入媒体事实、客户端能力和本地兼容运行时能力，统一选择 Direct Play、Direct Stream 或 Transcode，并给出可诊断原因。

### 需求: 原生播放优先

当输入容器、选中视频、选中音频和字幕交付方式均满足客户端直放条件时，系统 SHALL 选择 Direct Play 且不得启动 FFmpeg。

#### 场景: H.264/AAC MP4 完全兼容

- **GIVEN** 输入 MP4 的主视频、主音频和容器均明确受支持
- **WHEN** 系统协商播放方式
- **THEN** 结果 SHALL 为 Direct Play
- **AND** 视频与音频动作 SHALL 均为 direct

### 需求: 分别决定容器、视频和音频动作

系统 MUST 独立决定容器 direct/remux、视频 copy/transcode 与音频 copy/transcode，禁止因单一轨道不兼容无条件重编码其他兼容轨道。

#### 场景: HEVC 支持而 EAC-3 不支持

- **GIVEN** HEVC 视频在目标 fMP4 中明确受支持
- **AND** EAC-3 音频明确不受支持
- **WHEN** 系统协商播放方式
- **THEN** 结果 SHALL 为 Direct Stream
- **AND** 视频动作 SHALL 为 copy
- **AND** 音频动作 SHALL 为 transcode-to-aac

#### 场景: 视频不支持而 AAC 可复制

- **GIVEN** 输入视频 codec 明确不受客户端支持
- **AND** AAC 音频满足目标 fMP4 条件
- **AND** 本地运行时具备输入视频 decoder 与 H.264 encoder
- **WHEN** 系统协商播放方式
- **THEN** 结果 SHALL 为 Transcode
- **AND** 视频动作 SHALL 为 transcode-to-h264
- **AND** 音频动作 SHOULD 为 copy

### 需求: 通用处理输入视频 codec

系统 SHALL 根据能力事实而非输入 codec 名称特判视频转码；任何客户端不支持但本地运行时可解码的视频均 SHALL 进入固定兼容输出路径。

#### 场景: 非 HEVC 视频不受支持

- **GIVEN** 输入视频为 AV1、VP9、VC-1、MPEG-2 或其他已探测 codec
- **AND** 客户端明确不支持该配置
- **AND** 本地运行时存在对应 decoder
- **WHEN** 系统协商播放方式
- **THEN** 视频 SHALL 规划为 H.264 兼容转码
- **AND** 决策 MUST NOT 依赖 HEVC 专用分支

### 需求: 本地运行时能力门禁

当客户端不支持输入视频且本地运行时没有对应 decoder 或兼容输出能力时，系统 MUST 在规划阶段返回结构化不支持错误，不得启动注定失败的长任务。

#### 场景: 输入 decoder 缺失

- **GIVEN** 客户端明确不支持输入视频 codec
- **AND** 本地运行时没有对应 decoder
- **WHEN** 系统协商播放方式
- **THEN** 协商 SHALL 失败
- **AND** 原因 SHALL 包含 ffmpeg-decoder-unavailable 与输入 codec

### 需求: unknown 原生试播

客户端能力为 unknown 时，系统 SHOULD 优先尝试 Direct Play；只有实际媒体解码或格式不支持证据才允许进入一次兼容回退。

#### 场景: 未知 codec string

- **GIVEN** 输入容器可尝试直放但视频能力为 unknown
- **WHEN** 系统首次协商播放方式
- **THEN** 结果 SHOULD 为 Direct Play trial
- **AND** smooth 或 powerEfficient 的 unknown MUST NOT 直接触发转码

### 需求: 结构化兼容原因

协商结果 MUST 区分容器、视频 codec/Profile/Level/位深/动态范围、音频 codec/声道/采样率、字幕和运行时能力原因，并允许一个结果携带多个原因。

#### 场景: 视频与音频同时不兼容

- **GIVEN** 视频 codec 与音频声道均超过客户端能力
- **WHEN** 系统完成协商
- **THEN** 结果 SHALL 同时包含 video-codec-not-supported 与 audio-channels-not-supported
- **AND** 播放信息 SHALL 能分别展示两条原因

### 需求: copy 使用目标传输证据

视频与音频 copy MUST 分别满足目标 fMP4/MSE 条件；原文件支持不代表可 copy。目标音频不支持时 SHALL 仅转换音频，前提是目标 AAC 能力和本地处理能力可用。

#### 场景: file 音频支持而 MSE 音频不支持

- **GIVEN** 视频可 copy，音频 file 支持但目标 MSE 明确不支持
- **AND** AAC 兼容输出已验证且运行时可处理该音频
- **WHEN** 协商兼容路径
- **THEN** 结果 SHALL 为视频 copy 与音频 AAC
- **AND** MUST NOT 因音频问题无条件重编码视频

### 需求: 执行方案与 planner 选择一致

开发态选择 generalized 时 SHALL 实际执行通用协商结果；shadow SHALL 仅作比较。不能执行新方案时 MUST 明确失败或按已声明策略回退，并报告实际 planner 与 transport，不得静默伪装已运行新路径。

#### 场景: 选择新 planner

- **GIVEN** generalized 与 v2 路径的前置门禁通过
- **WHEN** 用户从真实应用入口打开媒体
- **THEN** 提交到会话工厂的决策 SHALL 来自选中的 planner
- **AND** 诊断 SHALL 区分配置选择、实际执行与回退原因
