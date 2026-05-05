## 目的

实现各 Port 接口的具体 adapter，连接 Service 核心与项目的 API、数据库、IPC 等基础设施。

### 需求: DandanplayAPI adapter

adapter SHALL 调用 dandanplay 的 match 和 comment API，处理 withRelated 和 chConvert 参数。

#### 场景: 调用匹配 API

- **GIVEN** adapter 已实例化
- **WHEN** 调用 match 方法
- **THEN** 发起 POST 请求到 /match 接口并返回结果

#### 场景: 调用弹幕 API

- **GIVEN** adapter 已实例化
- **WHEN** 调用 getDanmu 方法
- **THEN** 发起 GET 请求到 /comment/{episodeId}?withRelated=true 并返回结果

### 需求: IndexedDBCache adapter

adapter SHALL 使用 Dexie (IndexedDB) 存储和读取弹幕缓存。

#### 场景: 写入缓存

- **GIVEN** 弹幕数据已获取
- **WHEN** 调用 set 方法
- **THEN** 数据写入 IndexedDB 的 history 表 danmaku 字段

#### 场景: 判断新番

- **GIVEN** 视频 hash 已知
- **WHEN** 调用 isStale 方法
- **THEN** 读取 history 表的 newBangumi 字段返回结果

### 需求: Electron/Web Importer adapter

系统 SHALL 提供两套 VideoImporter 实现，根据运行环境选择。

#### 场景: Electron 环境从路径导入

- **GIVEN** 运行在 Electron 环境
- **WHEN** 调用 importFromPath
- **THEN** 通过 IPC 调用 getAnimeDetailByPath 获取文件信息
- **AND** 通过 IPC 获取同目录播放列表

#### 场景: Web 环境从 File 导入

- **GIVEN** 运行在浏览器环境
- **WHEN** 调用 importFromFile
- **THEN** 使用 URL.createObjectURL 生成播放地址
- **AND** 使用 calculateFileHash 计算哈希
