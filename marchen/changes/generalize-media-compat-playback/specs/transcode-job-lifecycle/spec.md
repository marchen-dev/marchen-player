## 目的

管理兼容播放 FFmpeg Job 的并发、请求所有权、生产窗口、停止和缓存回收，避免孤儿进程与无界输出。

### 需求: Job 与兼容会话关联

每个 Playback Job MUST 属于一个逻辑媒体会话并声明覆盖的时间范围、输入媒体版本、轨道动作和 attempt；不同会话不得复用未验证的临时资源。

#### 场景: 快速切换剧集

- **GIVEN** 第一集的 Playback Job 仍在运行
- **WHEN** 用户立即加载第二集
- **THEN** 第一集 Job SHALL 被取消并释放所有权
- **AND** 第一集迟到资源 MUST NOT 注册到第二集会话

### 需求: 活跃请求保护

系统 MUST 原子维护 segment 活跃请求计数；替换 Job 或删除分片前 SHALL 等待相关响应结束或由取消策略安全终止。

#### 场景: seek 与旧 segment 响应并发

- **GIVEN** 一个旧 segment 正在返回给客户端
- **WHEN** 新 seek 需要替换当前 Job
- **THEN** 系统 MUST NOT 在响应完成前删除该 segment
- **AND** Job 替换 SHALL 避免新旧进程同时写同一路径

### 需求: 空闲 Job 自动停止

没有活跃 segment 请求且会话心跳超过空闲期限时，系统 SHALL 停止 Playback Job；播放器暂停 MAY 保留有限 ahead buffer，但不得无限运行到影片末尾。

#### 场景: 用户关闭播放器

- **GIVEN** Playback Job 正在生产
- **WHEN** 播放租约释放且无活动请求
- **THEN** Job SHALL 先尝试优雅停止再强制终止
- **AND** 不得留下继续增长的媒体文件

### 需求: ahead buffer 受控

系统 SHALL 根据消费位置与生产位置维持有限 ahead window；超过上限时 SHOULD 暂停或停止生产，请求接近窗口末端时 SHALL 恢复。

#### 场景: 音频转码速度远高于播放速度

- **GIVEN** FFmpeg 生产速度显著快于 1x 播放
- **WHEN** 已生产位置超过配置的 ahead window
- **THEN** 系统 SHALL 阻止缓存继续无界增长
- **AND** 播放接近窗口末端后 SHALL 恢复生产

### 需求: 分片回收保留回退窗口

系统 MAY 删除已消费的旧分片，但 MUST 保留可配置的后退窗口，并且只有在缺失分片能够按需重新生成时才允许启用删除。

#### 场景: 回看已清理时间点

- **GIVEN** 目标旧分片已经安全清理
- **WHEN** 用户 seek 回该时间点
- **THEN** 系统 SHALL 重新生成目标附近分片
- **AND** 逻辑 currentTime SHALL 与原媒体一致

### 需求: 磁盘与异常退出安全

每个会话 MUST 受缓存预算和最小剩余空间约束；应用退出、Renderer 崩溃、系统睡眠或源文件变化后 SHALL 停止 Job 并清理可确认归属的资源。

#### 场景: 缓存即将超过预算

- **GIVEN** 会话输出接近缓存预算
- **WHEN** Job 准备发布新 segment
- **THEN** 系统 SHALL 节流、回收或停止 Job
- **AND** MUST NOT 侵占配置的磁盘保留空间

### 需求: 未完成分片具备 Job 所有权

producing 分片 MUST 关联 jobId/epoch。Job 替换、停止或失败 MUST 结束其所有未完成生产状态：仍有需求则重新调度，失败则唤醒相关 waiter，不能让重试持续等待不存在的生产者。发布回调 MUST 校验所有权。

#### 场景: 远跳后立即回跳

- **GIVEN** 分片 A 尚未发布，其 Job 因远跳 B 被替换
- **WHEN** 客户端再次请求 A
- **THEN** 系统 SHALL 为 A 复用有效生产者或重新调度
- **AND** 旧 Job 的迟到回调 MUST NOT 污染新 Job 的生产状态

#### 场景: 单个客户端请求取消

- **GIVEN** 多个请求共享同一个 Job
- **WHEN** 其中一个请求取消
- **THEN** 仅该请求的 waiter SHALL 结束
- **AND** 其他请求仍 SHALL 获得资源或结构化失败

### 需求: 客户端活动与生产进度分离

系统 MUST 分别记录客户端活动、播放器逻辑位置、下载请求位置和生产进度。FFmpeg progress MUST NOT 刷新用于空闲停止的客户端时间；乱序下载 MUST NOT 被解释为用户已播放到该位置。

#### 场景: 客户端消失而 FFmpeg 继续产出

- **GIVEN** 无活动响应/waiter，且客户端活动已超过空闲期限
- **WHEN** FFmpeg 仍上报 progress
- **THEN** Job SHALL 按空闲规则停止，不得被生产进度保活

### 需求: 按当前需求恢复与分阶段清理

ahead SHALL 使用当前有效需求附近的连续可用范围，门槛为 20 秒恢复、60 秒暂停/停止、90 秒硬上限。恢复点 MUST NOT 取全表第一个未发布分片。先验证 stop/restart 连续性，再启用 ahead；反向再生和活动响应保护通过前 MUST NOT 启用旧分片删除。

#### 场景: 从影片中间起播并达到 ahead 上限

- **GIVEN** 用户从中间位置起播，影片开头仍未生产
- **WHEN** Job 停止后需要恢复
- **THEN** 系统 SHALL 围绕当前需求和连续窗口末端恢复
- **AND** MUST NOT 返回影片开头无效补齐；远端稀疏分片也不得冒充连续缓冲
