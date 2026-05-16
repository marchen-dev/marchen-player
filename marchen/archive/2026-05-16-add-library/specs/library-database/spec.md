## 目的

定义影视库的持久化存储结构，支持作品级别的元数据存储和观看状态追踪。

### 需求: library 表 schema

系统 SHALL 在 IndexedDB 中维护一个 `library` 表，以弹弹play 的 `animeId` 为主键，存储作品元数据和集数信息。

#### 场景: 存储作品基本信息

- **GIVEN** 一条 library 记录被创建
- **WHEN** 读取该记录
- **THEN** 包含以下字段：标题、海报 URL、类型、类型描述、评分、简介、总集数、首播日期、是否连载中、标签列表、制作信息
- **AND** 包含完整的正片集数列表（每集含 episodeId、集号、标题、播出日期）
- **AND** 包含观看状态（已观看的 episodeId 列表、最后观看的 episodeId、最后观看时间、入库时间）

#### 场景: 集数列表只包含正片

- **GIVEN** bangumi API 返回的 episodes 中包含 episodeNumber 为 "C1"、"S1" 等非纯数字的条目
- **WHEN** 写入 library 表的 episodes 字段
- **THEN** 只保留 episodeNumber 为纯数字的条目
- **AND** 非数字条目被忽略

### 需求: 数据库迁移

系统 SHALL 在数据库版本升级时自动创建 library 表，并从现有 history 记录中提取基础信息。

#### 场景: 从 v3 升级到 v4

- **GIVEN** 用户的 IndexedDB 中存在 history 记录（部分含有 animeId）
- **WHEN** 应用启动并执行数据库迁移
- **THEN** 创建 library 表
- **AND** 为每个不同的 animeId 创建一条 library 记录（标题和海报从 history 记录中提取）
- **AND** 已观看的 episodeId 列表从对应的 history 记录中聚合
- **AND** history 表保持不变

#### 场景: history 记录无 animeId

- **GIVEN** 某些 history 记录的 animeId 为空（用户跳过了弹幕匹配）
- **WHEN** 执行迁移
- **THEN** 这些记录不产生 library 条目

### 需求: 索引支持

系统 SHALL 为 library 表建立索引以支持排序和筛选查询。

#### 场景: 按最后观看时间排序

- **GIVEN** library 表中有多条记录
- **WHEN** 按 lastWatchedAt 降序查询
- **THEN** 返回按最近观看时间排列的结果

#### 场景: 按连载状态筛选

- **GIVEN** library 表中有连载中和已完结的作品
- **WHEN** 按 isOnAir 字段筛选
- **THEN** 只返回匹配状态的记录
