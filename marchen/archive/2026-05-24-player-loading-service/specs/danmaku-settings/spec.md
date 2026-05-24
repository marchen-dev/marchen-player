## 目的

播放中的弹幕设置面板通过 Service 方法操作弹幕，不再直接操作 queryClient 或 atom。

### 需求: 弹幕源选择

设置面板 SHALL 从 service state 读取弹幕源列表，通过 service 方法切换选中状态。

#### 场景: 切换弹幕源选中状态

- **GIVEN** 用户在设置面板查看弹幕源列表
- **WHEN** 用户取消勾选某个弹幕源
- **THEN** 调用 service 方法更新选中状态
- **AND** 播放器实时刷新弹幕渲染

### 需求: 重新匹配弹幕库

设置面板 SHALL 通过 service.rematch() 触发播放中重新匹配。

#### 场景: 点击重新匹配

- **GIVEN** 用户正在播放视频
- **WHEN** 用户点击"重新匹配弹幕库"
- **THEN** 弹出匹配对话框
- **AND** 用户选择后调用 service.rematch(match)
- **AND** 弹幕更新，播放不中断

### 需求: 本地弹幕导入

设置面板 SHALL 通过 service.addLocalDanmaku() 添加本地弹幕文件。

#### 场景: 导入本地弹幕文件

- **GIVEN** 用户在设置面板点击"导入弹幕文件"
- **WHEN** 选择文件并解析成功
- **THEN** 调用 service.addLocalDanmaku(data)
- **AND** 弹幕追加到播放器渲染

### 需求: 清除弹幕缓存

设置面板 SHALL 支持清除缓存并重新加载。

#### 场景: 清除并重新加载

- **GIVEN** 用户点击"清除弹幕缓存"并确认
- **WHEN** 确认操作
- **THEN** 清空缓存后触发 service.loadFromPath() 重新加载
