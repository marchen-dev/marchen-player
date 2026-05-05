## 目的

定义弹幕在 IndexedDB 中的存储结构，支持自动获取和本地导入两种来源。

### 需求: 简化类型定义

DB_Danmaku 的 type 字段 SHALL 仅包含 `'auto'` 和 `'local'` 两种值。

#### 场景: 自动获取的弹幕

- **GIVEN** 系统通过 API（withRelated=true）获取到弹幕
- **WHEN** 保存到 IndexedDB
- **THEN** type 字段为 `'auto'`，source 字段为 `'dandanplay'`

#### 场景: 本地导入的弹幕

- **GIVEN** 用户通过本地文件导入弹幕
- **WHEN** 保存到 IndexedDB
- **THEN** type 字段为 `'local'`，source 字段为文件路径或文件名

### 需求: 数据库迁移

系统 SHALL 在数据库升级时将旧格式数据迁移为新格式。

#### 场景: 升级到 version 3

- **GIVEN** 用户的 IndexedDB 中存在旧格式弹幕数据（type 为 dandanplay/third-party-auto/third-party-manual）
- **WHEN** 应用启动并执行数据库迁移
- **THEN** 所有弹幕缓存被清空（danmaku 字段设为 undefined）
- **AND** local 类型的弹幕保留不变

### 需求: selected 字段保留

每个 DB_Danmaku 条目 SHALL 保留 selected 字段，用于控制该弹幕源是否参与播放器渲染。

#### 场景: 用户取消选中某个弹幕源

- **GIVEN** 播放器正在播放，弹幕列表中有多个条目
- **WHEN** 用户在设置面板取消勾选某个弹幕源
- **THEN** 该条目的 selected 设为 false
- **AND** 播放器实时更新，不再渲染该源的弹幕
