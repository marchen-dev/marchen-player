## 目的

VideoProvider 组件根据 Service 状态决定渲染加载 UI、匹配对话框或播放器内容。

### 需求: 纯渲染逻辑

VideoProvider SHALL 不包含任何业务逻辑（无 useEffect 触发加载），只根据 state 渲染对应 UI。

#### 场景: 加载中显示 stepper

- **GIVEN** service state.step 为 importing/hashing/matching/loading_danmaku/ready
- **WHEN** 组件渲染
- **THEN** 显示 LoadingDanmuTimeLine 组件

#### 场景: 等待用户选择时显示对话框

- **GIVEN** service state.step 为 waiting_user
- **WHEN** 组件渲染
- **THEN** 显示 MatchAnimeDialog
- **AND** 对话框的 onSelected 调用 service.selectMatch()

#### 场景: 播放状态显示 children

- **GIVEN** service state.step 为 playing
- **WHEN** 组件渲染
- **THEN** 渲染 children（播放器）

### 需求: 加载入口统一

页面组件 SHALL 通过 service 方法触发加载，不再通过 atom 间接触发。

#### 场景: 拖拽导入

- **GIVEN** 用户在播放页面拖入文件
- **WHEN** onDrop 事件触发
- **THEN** 调用 service.loadFromFile(file)

#### 场景: IPC 导入

- **GIVEN** Electron 通过 IPC 推送文件路径
- **WHEN** IpcListener 收到 importAnime 事件
- **THEN** 调用 service.loadFromPath(path)
