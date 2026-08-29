## 目的

在测试框架升级后继续证明 player-core 加载、重匹配和 service 状态机的既有行为。

### 需求: 保持现有测试可执行

player-core 的测试套件 MUST 在升级后的测试运行器上无语义修改地通过。

#### 场景: 执行 player-core 测试

- **GIVEN** 测试依赖已经升级
- **WHEN** 执行 player-core 标准测试命令
- **THEN** 加载 pipeline、重匹配 pipeline 和 service 测试 MUST 全部通过
- **AND** 不得通过跳过、删除或弱化断言来取得通过结果

### 需求: 保持失败可诊断

测试运行器 MUST 在状态机或异步 pipeline 行为回归时给出失败结果和可定位信息。

#### 场景: 状态转换不符合预期

- **GIVEN** 被测实现产生了不符合测试预期的状态或事件
- **WHEN** 测试套件运行
- **THEN** 对应测试 MUST 失败
- **AND** 输出 MUST 能定位到失败用例和断言
