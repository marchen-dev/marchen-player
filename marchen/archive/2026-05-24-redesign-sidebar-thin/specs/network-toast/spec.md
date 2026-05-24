## 目的

替代旧 sidebar 内 `NetWorkCheck` 的全局 toast 适配器。监听网络状态，离线时弹持续 toast，恢复后清除。

### 需求: 离线时弹 toast

应用根级 hook MUST 监听网络状态，从在线变为离线时立即触发一条 toast：标题「网络异常」，描述「请检查网络连接」。toast 类型 SHOULD 使用 destructive 变体。

#### 场景: 网络断开

- **GIVEN** 用户正在使用应用，网络在线
- **WHEN** 网络变为离线
- **THEN** 一条「网络异常」toast SHALL 出现
- **AND** 该 toast SHALL 不会被其他短时 toast 自动覆盖（持续显示直到网络恢复）

### 需求: 恢复时清除 toast

网络从离线恢复在线时 MUST 自动清除上一条「网络异常」toast，不留残留。

#### 场景: 网络恢复

- **GIVEN** 「网络异常」toast 正在显示
- **WHEN** 网络恢复在线
- **THEN** 该 toast SHALL 被清除
- **AND** 应用 SHALL 不弹出新的"已恢复"toast（避免过度打扰）

### 需求: 仅在 Electron 桌面端生效

network-toast hook MUST 仅在 Electron 环境挂载；Web 端不挂载此 hook（Web 端有浏览器原生离线提示，且 `Prepare.tsx` 已处理 Web 的特殊需求）。

#### 场景: Web 环境

- **GIVEN** 应用运行在浏览器中
- **WHEN** 应用初始化
- **THEN** network-toast hook SHALL 不订阅 `useNetworkStatus`
