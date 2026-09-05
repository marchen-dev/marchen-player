## 目的

描述当前 Electron Chromium 对原文件直放与 fMP4 HLS 的可观察播放能力，为通用兼容协商提供稳定输入。

### 需求: 分离直放与兼容传输能力

系统 SHALL 分别表达原始容器直放能力与 fMP4 HLS/MSE 轨道能力，不得用“能解码裸视频轨道”替代“原文件可直放”的结论。

#### 场景: MKV 容器不支持但视频轨道可用于 fMP4

- **GIVEN** 当前 Chromium 不接受输入 MKV 的完整 content type
- **AND** 主视频与主音频在目标 fMP4 中均有明确支持事实
- **WHEN** 系统生成客户端播放能力
- **THEN** 原文件容器能力 SHALL 为不支持
- **AND** 目标 fMP4 轨道能力 SHALL 保持支持

### 需求: 表达视频与音频条件

系统 MUST 为主视频与主音频分别表达 codec、codec string、Profile、Level、位深、动态范围、分辨率、帧率、采样率和声道等可获得条件；缺失条件 MUST 保持 unknown。

#### 场景: codec string 不完整

- **GIVEN** 输入视频只有 codec 名称而没有可靠 RFC 6381 codec string
- **WHEN** 系统生成客户端播放能力
- **THEN** 对应 codec 能力 SHALL 为 unknown
- **AND** 系统 MUST NOT 把该输入静默声明为支持

### 需求: 保留能力结果维度

系统 SHALL 分别保留 supported、smooth 与 powerEfficient；只有 supported 可作为首次规划的视频转码门槛。

#### 场景: 支持但预测不流畅

- **GIVEN** Chromium 返回 supported=true、smooth=false、powerEfficient=false
- **WHEN** 系统生成客户端播放能力
- **THEN** 三个结果 SHALL 原样保留
- **AND** Profile MUST NOT 把该配置改写为不支持

### 需求: 能力探测失败可降级

能力 API 缺失、抛错或返回无法解释的结果时，系统 SHALL 产生 unknown 事实并允许后续运行时验证，不得中断媒体导入。

#### 场景: MediaCapabilities 抛错

- **GIVEN** Chromium 的能力查询抛出异常
- **WHEN** 系统仍可执行基础 content type 探测
- **THEN** 系统 SHALL 使用可获得的基础结果
- **AND** 无法确认的 smooth 与 powerEfficient SHALL 为 unknown

### 需求: 双端能力隔离

Electron MAY 使用本地兼容能力，Web 构建 MUST 只声明浏览器自身可用的播放能力，不得声明本地 FFmpeg 或 loopback Gateway 可用。

#### 场景: Web 构建加载媒体

- **GIVEN** 应用运行在纯 Web 环境
- **WHEN** 系统生成客户端播放能力
- **THEN** Profile SHALL 不包含本地转码可用声明
- **AND** 后续播放 MUST 保持浏览器原生路径

### 需求: 传输证据独立且按需探测

系统 MUST 分别记录 file 与 MSE 的能力证据，MUST NOT 将 file decodingInfo 或 canPlayType 的支持结果直接标记为 fMP4/MSE 支持。目标视频、音频及最终输出组合 SHALL 验证对应传输条件；target init probe SHALL 仅在必要事实缺失时执行并按源指纹与目标缓存。

#### 场景: 文件音频可播放但 MSE 不支持

- **GIVEN** 音频在 file 路径 supported=true，但目标 fMP4/MSE supported=false
- **WHEN** 系统构建 Profile
- **THEN** 两种结果 SHALL 独立保留
- **AND** 系统 MUST NOT 将该音轨声明为可直接复制到 MSE

#### 场景: 普通直放事实充分

- **GIVEN** 原文件直放条件已经满足
- **WHEN** 准备播放
- **THEN** 系统 MUST NOT 为补齐未使用的兼容 Profile 阻塞在 target init probe 或转码预检上
