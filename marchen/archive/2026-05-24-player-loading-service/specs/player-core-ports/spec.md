## 目的

定义 Service 与外部系统交互的接口（Port），实现依赖反转，使核心逻辑不依赖具体实现。

### 需求: DanmakuAPI 接口

系统 SHALL 通过 DanmakuAPI 接口访问弹幕服务，包含匹配动漫和获取弹幕两个操作。

#### 场景: 匹配动漫

- **GIVEN** 已计算出视频的 hash、size、name
- **WHEN** 调用 match 方法
- **THEN** 返回匹配结果（是否精准匹配 + 候选列表）

#### 场景: 获取弹幕

- **GIVEN** 已确定 episodeId
- **WHEN** 调用 getDanmu 方法
- **THEN** 返回弹幕数据（含第三方源，服务端已合并）

### 需求: DanmakuCache 接口

系统 SHALL 通过 DanmakuCache 接口管理弹幕缓存的读写和失效判断。

#### 场景: 读取缓存

- **GIVEN** 视频 hash 已知
- **WHEN** 调用 get 方法
- **THEN** 返回缓存的弹幕数据或 null

#### 场景: 判断缓存是否过期

- **GIVEN** 视频 hash 已知
- **WHEN** 调用 isStale 方法
- **THEN** 返回 boolean（新番返回 true，非新番返回 false）

### 需求: VideoImporter 接口

系统 SHALL 通过 VideoImporter 接口获取视频文件信息，支持从 File 对象和文件路径两种方式导入。

#### 场景: 从 File 对象导入

- **GIVEN** 用户拖入或选择了文件
- **WHEN** 调用 importFromFile 方法
- **THEN** 返回视频信息（url、hash、size、name、playList）

#### 场景: 从路径导入

- **GIVEN** 已知文件路径（IPC/历史记录）
- **WHEN** 调用 importFromPath 方法
- **THEN** 返回视频信息（url、hash、size、name、playList）

### 需求: HistoryStore 接口

系统 SHALL 通过 HistoryStore 接口管理播放历史的持久化。

#### 场景: 保存历史记录

- **GIVEN** 视频加载完成
- **WHEN** 调用 save 方法
- **THEN** 历史记录写入持久化存储

#### 场景: 读取历史记录

- **GIVEN** 视频 hash 已知
- **WHEN** 调用 get 方法
- **THEN** 返回历史记录或 null

### 需求: PlayerBridge 接口

系统 SHALL 通过 PlayerBridge 接口在播放中更新弹幕渲染，支持连接和断开。

#### 场景: 播放中更新弹幕

- **GIVEN** 播放器已初始化且 bridge 已连接
- **WHEN** 弹幕数据更新（rematch/addLocal）
- **THEN** 播放器实时刷新弹幕渲染

#### 场景: 播放器未连接

- **GIVEN** bridge 未连接（播放器未初始化）
- **WHEN** 弹幕数据更新
- **THEN** 数据保存在 state 中，等播放器初始化时读取
