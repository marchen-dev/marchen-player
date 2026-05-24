## 目的

核心状态机和 RxJS pipeline 编排，管理从视频导入到播放就绪的完整异步流程。

### 需求: 状态机定义

Service SHALL 维护一个明确的状态机，包含以下状态：idle、importing、hashing、matching、waiting_user、loading_danmaku、ready、playing、reloading。每个状态转换 SHALL 是确定性的。

#### 场景: 正常加载流程（精准匹配）

- **GIVEN** Service 处于 idle 状态
- **WHEN** 收到 loadFromFile 或 loadFromPath 命令
- **THEN** 状态依次经过 importing → hashing → matching → loading_danmaku → ready → playing

#### 场景: 未匹配需要用户选择

- **GIVEN** Service 处于 matching 状态
- **WHEN** API 返回 isMatched=false
- **THEN** 状态转为 waiting_user
- **AND** 等待 selectMatch 或 skipDanmaku 命令

#### 场景: 用户选择匹配结果

- **GIVEN** Service 处于 waiting_user 状态
- **WHEN** 收到 selectMatch 命令
- **THEN** 状态转为 loading_danmaku，继续加载弹幕

#### 场景: 用户跳过弹幕

- **GIVEN** Service 处于 waiting_user 状态
- **WHEN** 收到 skipDanmaku 命令
- **THEN** 状态直接转为 playing（仅加载本地弹幕如有）

### 需求: 自动取消

新的 load 命令 SHALL 自动取消正在进行的加载流程。

#### 场景: 加载中导入新视频

- **GIVEN** Service 正在执行加载（任意非 idle/playing 状态）
- **WHEN** 收到新的 loadFromFile 或 loadFromPath 命令
- **THEN** 当前加载被取消
- **AND** 从 idle 开始新的加载流程

### 需求: 播放中重新匹配

Service SHALL 支持在 playing 状态下重新匹配弹幕库，不中断播放。

#### 场景: 播放中重新匹配

- **GIVEN** Service 处于 playing 状态
- **WHEN** 收到 rematch 命令
- **THEN** 状态转为 reloading
- **AND** 获取新弹幕后通知播放器更新
- **AND** 状态回到 playing

### 需求: 播放中添加本地弹幕

Service SHALL 支持在 playing 状态下添加本地弹幕文件。

#### 场景: 添加本地弹幕

- **GIVEN** Service 处于 playing 状态
- **WHEN** 收到 addLocalDanmaku 命令
- **THEN** 弹幕数据追加到当前弹幕列表
- **AND** 通知播放器更新弹幕渲染
- **AND** 状态保持 playing

### 需求: 弹幕缓存策略

Service SHALL 优先使用缓存，新番或强制刷新时重新请求。

#### 场景: 使用缓存

- **GIVEN** 缓存中存在该视频的弹幕且非新番
- **WHEN** 执行到 loading_danmaku 步骤
- **THEN** 直接使用缓存数据，不发起网络请求

#### 场景: 新番强制刷新

- **GIVEN** 缓存中存在弹幕但视频标记为新番
- **WHEN** 执行到 loading_danmaku 步骤
- **THEN** 忽略缓存，重新请求弹幕

### 需求: 错误处理

Service SHALL 在任何步骤失败时 emit 错误状态，不终止状态流。

#### 场景: 网络请求失败

- **GIVEN** 加载流程正在进行
- **WHEN** API 请求失败
- **THEN** state 中包含 error 信息
- **AND** 状态流不终止，可以接收新命令
