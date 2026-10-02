## 1. 验证外部前提

- [x] 1.1 在 `VITE_TELEMETRY_DEBUG=true` 下发送带 gzip 附件的测试 `captureFeedback`：Electron main 已验证附件出现在 User Feedback 详情且可下载，无需 `captureMessage` 退路；Web 端与 Data Scrubber 对附件内容的影响待发版前补测

## 2. Main 日志核心

- [x] 2.1 新增 `src/main/lib/diagnostic-log/format.ts`：结构化记录序列化为单行 JSON，兼容 electron-log 纯文本输入（归类 updater）
- [x] 2.2 新增 `throttle.ts`（可注入时钟）：重复合并、单行 8 KB 截断、info 每分钟 120 条限流、`flushSync()`
- [x] 2.3 为 format / throttle 编写 vitest 单测并纳入 `test:main`
- [x] 2.4 新增 `diagnostic-log/index.ts`：`writeLog`、`logDirectory`、`collectDiagnostics`（拼接三份并 gzip）、`clearLogs`
- [x] 2.5 改写 `initialize/log.ts`：正式 / 开发目录隔离、`marchen.log` 5 MB、自定义三份轮转 `archiveLogFn`、首次启动删除旧 `log/` 目录
- [x] 2.6 `will-quit` 调用 `flushSync()`

## 3. Main 监听与接入

- [x] 3.1 `index.ts` 最早注册 `uncaughtException` / `unhandledRejection` 写日志
- [x] 3.2 `windows/main.ts` 记录 `render-process-gone`、`unresponsive` / `responsive`、`did-fail-load`
- [x] 3.3 `bootstrap.ts` 记录 `child-process-gone`，就绪后写启动环境快照
- [x] 3.4 `telemetry/operational-errors.ts` 同步写本地日志；`lib/update.ts` 两处改用 `writeLog`
- [x] 3.5 `ipc/app.ts` 新增 `appendLogs`、`feedbackAvailable`、`sendFeedback`（main 打包附件并 `captureFeedback`）、`openLogDirectory`
- [x] 3.6 `lib/cleaner.ts` 重置时 `clearLogs()` 并写 `app_reset`

## 4. Renderer 本地日志

- [x] 4.1 新增 `services/telemetry/local-log.ts`：实现 TelemetryClient，剔除公共属性、事件级别映射、Electron 用 RxJS `bufferTime` 批量 IPC、Web 内存环形缓冲 2000 条、`pagehide` flush、全局 `error` / `unhandledrejection` 监听、自身异常不走遥测
- [x] 4.2 `services/telemetry/initialize.ts` 始终挂载本地客户端（遥测关闭时仅本地）
- [x] 4.3 renderer 初始化后写 renderer 环境快照（兼容内核支持、关键播放设置、语言；Web 含解码能力与 `crossOriginIsolated`）
- [x] 4.4 local-log 单测：公共属性剔除、级别映射、环形缓冲上限

## 5. 反馈功能

- [x] 5.1 新增 `services/telemetry/feedback.ts`：可用性判断、Electron 走 IPC、Web 直接 `captureFeedback` 附内存记录、15 秒超时、成功埋点
- [x] 5.2 新增 feedback atom（开关、预填、operation_id、运行期草稿）与「附带诊断日志」持久化设置
- [x] 5.3 新增 `components/modules/shared/FeedbackDialog.tsx`：表单校验、editing / sending / success / failed 状态、编号复制、兜底按钮、关闭确认、30 秒重复发送确认、⌘↵ 发送
- [x] 5.4 设置 › 关于：「发送诊断反馈」行与「日志位置 · 打开目录」（仅 Electron）
- [x] 5.5 macOS 应用菜单「反馈问题…」：打开关于页并弹出反馈框
- [x] 5.6 `PlayerCompatibilityNotice` 错误态加入「反馈此问题」，预填错误码并携带 operation_id

## 6. 文档与验证

- [x] 6.1 `docs/observability-runbook.md` 增补本地日志（位置、轮转、格式、开发态目录）与用户反馈（Sentry 查找方式、调试开关）章节
- [x] 6.2 运行 typecheck、lint、`test:main`、`test:player-runtime`
