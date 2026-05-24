## 目的

提供 React hook 将 Service 的 Observable 状态桥接到 React 组件的渲染周期。

### 需求: 状态订阅 hook

hook SHALL 订阅 service.state$ 并在状态变化时触发 React 重渲染。

#### 场景: 组件挂载时订阅

- **GIVEN** 组件使用了 usePlayerLoading hook
- **WHEN** 组件挂载
- **THEN** 自动订阅 service.state$
- **AND** 返回当前状态

#### 场景: 组件卸载时清理

- **GIVEN** 组件已订阅 state$
- **WHEN** 组件卸载
- **THEN** 自动 unsubscribe，不产生内存泄漏

### 需求: Service 实例访问

hook SHALL 提供对 service 实例的访问，使组件能调用命令方法。

#### 场景: 组件调用 service 方法

- **GIVEN** 组件通过 hook 获取了 service 引用
- **WHEN** 用户触发操作（如拖入文件）
- **THEN** 组件调用 service.loadFromFile(file)
- **AND** 不需要通过 atom 或 useEffect 间接触发

### 需求: 选择性订阅

hook SHOULD 支持只订阅状态的部分字段，避免不必要的重渲染。

#### 场景: Timeline 只关心 step

- **GIVEN** Timeline 组件只需要 step 字段
- **WHEN** danmaku 数据变化但 step 不变
- **THEN** Timeline 不重渲染
