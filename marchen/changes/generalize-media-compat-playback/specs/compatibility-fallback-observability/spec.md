## 目的

为能力误报和运行时失败提供有限回退，同时让用户与开发者能够确认实际播放方式、处理阶段和性能瓶颈。

### 需求: 回退链有限且单向

系统 SHALL 为同一逻辑媒体维护有界 attempt chain；回退只能从较少处理走向更安全处理，不得在 Direct Play、Direct Stream 与 Transcode 之间循环。

#### 场景: 原生解码失败

- **GIVEN** unknown 能力导致系统先尝试 Direct Play
- **AND** 浏览器报告媒体 decode 或 source-not-supported 错误
- **WHEN** 本地兼容运行时可用
- **THEN** 系统 SHALL 创建一次兼容播放 attempt
- **AND** attempt chain SHALL 记录原生失败原因

### 需求: 非媒体兼容错误不得触发转码

文件不存在、权限拒绝、磁盘中断、用户取消和应用释放 MUST NOT 被解释为 codec 不兼容，也不得自动触发更重的转码。

#### 场景: 源文件播放中被移除

- **GIVEN** 当前媒体文件在播放中不可访问
- **WHEN** 读取返回文件不存在
- **THEN** 播放 SHALL 以 source-unavailable 失败
- **AND** 系统 MUST NOT 启动 H.264 转码 attempt

### 需求: 回退保持用户状态

发生兼容回退或 Job 替换时，系统 MUST 保持逻辑进度、暂停状态、音量、倍速、旋转、字幕选择/偏移和弹幕时间线。

#### 场景: 播放中从直放切换到转码

- **GIVEN** 用户正在 20 分钟处播放并选择了字幕
- **WHEN** 实际解码错误触发兼容回退
- **THEN** 新路径 SHALL 从对应逻辑时间恢复
- **AND** 用户播放与字幕设置 SHALL 保持不变

### 需求: 展示实际播放信息

播放信息 SHALL 展示播放方法、容器动作、视频/音频动作、输入/输出 codec、decoder/encoder 类别、动态范围处理、兼容原因与 attempt chain；unknown 字段 MUST 明确标记未知。

#### 场景: HEVC copy 与 EAC-3 转 AAC

- **GIVEN** 当前路径为 Direct Stream
- **WHEN** 用户打开播放信息
- **THEN** 视频 SHALL 显示 HEVC copy
- **AND** 音频 SHALL 显示 EAC-3 → AAC 及实际 encoder
- **AND** 原因 SHALL 显示 audio-codec-not-supported

### 需求: 记录阶段与性能指标

系统 SHALL 记录 capability、planning、probe/keyframe、pipeline preflight、job start、segment ready、browser attach、first frame、seek recovery、cache 和 cleanup 阶段结果，错误日志不得包含会话 token 或不必要的完整本地路径。

#### 场景: 首帧等待超时

- **GIVEN** HLS 已附着但浏览器未解码首帧
- **WHEN** 首帧超过配置期限
- **THEN** 错误 SHALL 标记 browser-first-frame 阶段
- **AND** 诊断 SHALL 区分 segment 尚未生成、MSE 失败与 decode 未推进

### 需求: 开发态强制测试路径

开发构建 SHALL 支持强制 Direct Stream、完整视频转码、软件视频解码和软件视频编码；这些覆盖 MUST NOT 进入 Web 或生产构建。

#### 场景: 强制纯软件视频处理

- **GIVEN** 开发态同时启用强制视频转码、软件解码与软件编码
- **WHEN** 加载浏览器原本支持的 HEVC 视频
- **THEN** 实际 attempt SHALL 使用软件 decoder 与软件 H.264 encoder
- **AND** 播放信息 SHALL 显示强制来源

### 需求: 真实样本兼容矩阵

发布前 MUST 用不提交媒体内容的本地 smoke 配置覆盖 HEVC、AV1、VP9、VC-1、MPEG-2、EAC-3、FLAC、HDR、长 GOP、VFR 与非零 start time，并验证首帧、时间推进、seek 与清理。

#### 场景: 本地 smoke 样本缺失

- **GIVEN** 某个可选真实样本路径未配置
- **WHEN** 常规 CI 运行
- **THEN** 测试 SHALL 明确跳过该真实样本而不读取外部媒体
- **AND** 单元与合成集成测试仍 MUST 覆盖对应规则

### 需求: seek 失败可恢复且最新目标优先

迁移期 generation seek 的 rejection MUST NOT 污染后续请求队列；会话仍可用时允许再次 seek，已失效时 SHALL 重建租约或明确提示重试。连续拖动 SHALL 合并未启动的过期目标，已启动操作按安全取消策略处理。seek 失败或超过恢复期限 MUST 退出 seeking，不得仅记录日志。

#### 场景: 一次 seek 失败后再次拖动

- **GIVEN** 上次 seek 因 IPC 或生产失败结束
- **WHEN** 用户重新选择目标
- **THEN** 系统 SHALL 发起有效恢复操作或明确告知会话不可恢复
- **AND** MUST NOT 沿用已失败 Promise 而无请求地重复失败

#### 场景: 连续选择三个目标

- **GIVEN** 用户快速选择 A、B、C，部分操作尚未开始
- **WHEN** 系统处理 seek
- **THEN** 最终 SHALL 以 C 为用户目标，过期结果不得恢复 A/B 的状态
- **AND** 暂停、音量、倍速等用户意图 SHALL 保持

### 需求: 应用验收与实验分层

证据 MUST 区分模块测试、独立浏览器 spike、真实应用入口、真实长片连续操作与打包态。应用验收 MUST 记录实际 planner、transport、Job 与媒体推进证据，shadow 或独立 server 通过不得替代应用 v2 验收。缺少样本或平台 MUST 标记未验证。

#### 场景: spike 通过但应用仍使用旧 transport

- **GIVEN** 稳定 VOD spike 已通过，但应用入口仍执行 v1
- **WHEN** 汇总任务进度
- **THEN** spike 成果 SHALL 保留
- **AND** 应用 v2 seek、业务回归和默认切换 SHALL 保持待验收

### 需求: 时间与内容对应是验收条件

验收 MUST 同时核对目标可达、原媒体画面时间与播放器逻辑时间对应、音视频连续性，并记录 FFmpeg、Electron/Chromium 和 HLS.js 版本。video.error 为空或 currentTime 推进不能单独证明成功。整数秒画面标记实验的 1.5 秒采样阈值 MUST NOT 用作正式 seek 精度、PTS 容差或音画同步标准。

#### 场景: 无错误但画面错位

- **GIVEN** HLS.js 无 error 且 currentTime 正在推进
- **AND** 实际画面对应另一段原媒体时间
- **WHEN** 汇总 seek 验收
- **THEN** SHALL 判定失败并保留请求目标、实际时间、内容时间及版本证据
- **AND** 合成实验通过 MUST NOT 代替正式模块和真实媒体验收
