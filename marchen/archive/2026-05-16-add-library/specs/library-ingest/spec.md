## 目的

在播放流程中自动将作品信息写入影视库，无需用户手动操作。

### 需求: 播放时自动入库

系统 SHALL 在成功匹配弹幕后，自动将作品信息写入 library 表。

#### 场景: 首次播放某作品的某一集

- **GIVEN** 用户播放了一个视频文件，弹弹play 匹配成功返回 animeId
- **WHEN** 系统调用 bangumi API 获取作品详情
- **THEN** 在 library 表中创建该作品的记录（包含完整元数据和集数列表）
- **AND** 将当前集标记为已观看
- **AND** 将当前集的 fileHash 关联到对应的 episode 条目

#### 场景: 再次播放同一作品的不同集

- **GIVEN** library 表中已存在该 animeId 的记录
- **WHEN** 用户播放该作品的另一集
- **THEN** 更新 watchedEpisodeIds（追加新的 episodeId）
- **AND** 更新 lastWatchedEpisodeId 和 lastWatchedAt
- **AND** 将新集的 fileHash 关联到对应的 episode 条目
- **AND** 不重复创建 library 记录

#### 场景: 再次播放同一集

- **GIVEN** library 表中该集已标记为已观看
- **WHEN** 用户再次播放同一集
- **THEN** 只更新 lastWatchedAt
- **AND** watchedEpisodeIds 不产生重复项

### 需求: 跳过匹配时不入库

系统 SHALL NOT 在用户跳过弹幕匹配时写入 library 表。

#### 场景: 用户跳过匹配

- **GIVEN** 用户播放了一个视频文件
- **WHEN** 弹弹play 匹配失败且用户选择跳过
- **THEN** 不创建 library 记录
- **AND** history 表正常写入（现有行为不变）

### 需求: 入库不阻塞播放

系统 SHALL 异步执行 library 写入，不阻塞视频播放。

#### 场景: bangumi API 响应慢

- **GIVEN** bangumi API 请求耗时较长
- **WHEN** 用户开始播放
- **THEN** 视频播放不受影响
- **AND** library 记录在 API 响应后写入

#### 场景: bangumi API 请求失败

- **GIVEN** bangumi API 请求失败（网络错误等）
- **WHEN** 用户正在播放
- **THEN** 播放不受影响
- **AND** library 记录不创建（下次播放时重试）

### 需求: 播放完成时更新观看状态

系统 SHALL 在视频播放进度超过 90% 时将该集标记为已观看。

#### 场景: 看完一集

- **GIVEN** 用户正在播放某集，library 表中该集尚未标记为已观看
- **WHEN** 播放进度达到总时长的 90%
- **THEN** 将该 episodeId 加入 watchedEpisodeIds
- **AND** 更新 lastWatchedAt

### 需求: 重新匹配后更新 library

系统 SHALL 在用户重新匹配弹幕后更新 library 表中的关联关系。

#### 场景: 重新匹配到不同作品

- **GIVEN** 用户对某个文件执行了重新匹配弹幕操作
- **WHEN** 匹配结果指向不同的 animeId
- **THEN** 从旧作品的 library 记录中移除该文件的关联
- **AND** 在新作品的 library 记录中添加关联（如不存在则创建）
