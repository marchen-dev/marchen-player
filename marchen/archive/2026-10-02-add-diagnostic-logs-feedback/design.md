## 背景

- Main：`initialize/log.ts` 注册 electron-log（5.4.4，默认同步追加写），路径被改到 `<appData>/Marchen/log/main.log`，`maxSize` 1 MB，默认轮转只保留一份 `.old`。实际写入只有 `lib/update.ts` 两处，且 `autoUpdater.logger = logger` 会写入纯文本。
- Main 崩溃事件：`windows/main.ts` 已监听 `render-process-gone`，但只用于释放资源；无 `uncaughtException`、`child-process-gone` 等记录。
- Renderer 遥测：`services/telemetry/client.ts` 的组合客户端统一承接 `capture / captureException / log / addBreadcrumb`；`telemetry.capture` 在下发前合并 `contextProvider()` 公共属性。`initialize.ts` 仅在遥测开启时组装客户端，否则为 noop。
- Sentry：main 由 `telemetry/sentry.ts` 初始化，`!SENTRY_DSN || !isTelemetryEnabled` 时直接返回；renderer Electron 目标用 `@sentry/electron/renderer`，事件与附件经 IPC 交给 main 上报。`captureFeedback(params, hint)` 的 hint 支持 attachments。
- 开发态 `index.ts` 只把 appData 改为 `Marchen (dev)`，应用名仍为 `Marchen`；electron-log 默认目录按应用名，开发与正式会混写。
- 关于页已有「问题反馈」区块（GitHub / X / Email / Telegram 外链）。

## 目标与非目标

**目标：**
- Electron 本地日志始终开启、结构化、体积 ≤ 约 15 MB、开发与正式隔离。
- 复用组合 telemetry client，业务代码零改动即可落地现有事件。
- 三个入口共享的反馈弹窗；Electron 由 main 打包日志并通过 Sentry 用户反馈附件发送。
- 重置应用清空日志。

**非目标：**
- 数据区「清除日志」、反馈预览、Web 持久化日志。
- 新增日志依赖或远端日志服务。
- 离线排队自动重发反馈。
- 修改 `packages/*` 纯 TS 包。

## 决策

### 1. main 是唯一文件写入者

renderer 不直接写文件，经 IPC 批量交给 main。避免多进程追加交错，也让轮转、限流只在一处实现。新增 `src/main/lib/diagnostic-log/`：
- `format.ts`：把 `{ t, lv, src, cat, msg, op?, data? }` 序列化为一行 JSON；electron-log 的非结构化输入（如 electron-updater 文本）包装为 `{ cat: 'updater', msg }`。
- `throttle.ts`（纯 TS，可注入时钟）：重复合并（同 `lv+msg+error_code` 10 秒内超过 5 条后只计数，窗口结束补写 `repeated`）、单行 8 KB 截断（标记 `truncated`）、info 每分钟 120 条限流（超出计数）。`flushSync()` 供退出时调用。
- `index.ts`：`writeLog(entry)`、`collectDiagnostics()`、`clearLogs()`、`logDirectory()`。

选纯 TS 模块 + electron-log 文件 transport，而不是换 pino 等：已有依赖、默认同步写利于崩溃场景，日志量很小无需高吞吐。

### 2. 目录与轮转

- 目录：正式版 electron-log 默认 `libraryDefaultDir`（macOS `~/Library/Logs/Marchen`，Windows `%APPDATA%\Marchen\logs`）；开发版显式改为同级 `Marchen (dev)`，与 appData 隔离方式一致。
- 文件：`marchen.log`，`maxSize` 5 MB；自定义 `archiveLogFn`：删 `marchen.2.log` → `1→2` → 当前→`1`；改名失败沿用 electron-log 兜底（裁剪当前文件到 256 KB）。
- 首次启动删除旧 `<appData>/Marchen/log/` 目录，不迁移内容。
- 不按天数清理，只按体积。

### 3. 记录口径

- 字段：`t`（ISO，产生时刻；renderer 自带时间戳，main 不覆盖）、`lv`（debug/info/warn/error）、`src`（main/renderer）、`cat`、`msg`、`op`（operation_id / attempt_id）、`data`。
- renderer 本地客户端写入前剔除 `CommonTelemetryProperties` 键（release、dist、version、commit、environment、app_target、runtime、platform、arch、app_session_id），这些只在启动快照出现。
- `data` 先经 `boundTelemetryValue` 再截断，与 Sentry 同口径；不脱敏，遵循项目遥测策略。
- 不记：逐秒进度、单条弹幕、字幕正文、点击流。

### 4. renderer 本地日志客户端

`services/telemetry/local-log.ts` 实现 `TelemetryClient`：
- `capture` → info（失败类事件按名单映射为 warn/error）；`captureException` → error（含 errorCode、message、stack）；`log` / `addBreadcrumb` 按其 level。
- Electron：RxJS `bufferTime(1000, null, 50)` 攒批，`ipcClient.app.appendLogs` 只发不等；`pagehide` 时立即 flush。
- Web：数组环形缓冲 2000 条，供反馈读取。
- 注册 `window` `error` / `unhandledrejection`（Sentry SDK 自动捕获不经过 client）。
- `initialize.ts` 改为始终把本地客户端放入组合客户端；遥测关闭时组合客户端仅含本地客户端。
- 自身任何异常只 `console.warn`，**不得**调用 telemetry，防止递归。

### 5. main 侧监听与快照

- `index.ts` 顶部最早注册 `process.on('uncaughtException' | 'unhandledRejection')` 写 error（不改变现有退出行为）。
- `windows/main.ts`：`render-process-gone`（reason、exitCode）、`unresponsive` / `responsive`、`did-fail-load`。
- `bootstrap.ts`：`app.on('child-process-gone')`；`whenReady` 后写启动快照（版本、channel、commit、OS、arch、`app.getGPUFeatureStatus()`）。renderer 初始化后补写一条 renderer 快照（`getCompatSupport()`、关键播放设置、语言）。
- `telemetry/operational-errors.ts` 同步 `writeLog`。
- `lib/update.ts` 两处 logger 调用改用 `writeLog`；`autoUpdater.logger` 保留，由 format 兼容。
- `app.on('will-quit')` 调 `throttle.flushSync()`。

### 6. 反馈发送

- **Electron**：renderer 只传 `{ message, contact?, attachLogs, operationId? }` 给 main 的 `app.sendFeedback`；main 读取三份日志拼接、`zlib.gzipSync` 成 `marchen-logs.jsonl.gz`，调用 `@sentry/electron/main` 的 `captureFeedback({ message, email: contact, associatedEventId? }, { attachments })`，返回 event id。避免日志在 main↔renderer 间往返。
- **Web**：renderer 序列化内存缓冲为附件，`@sentry/react` `captureFeedback`。
- 可用性：新增 `app.feedbackAvailable`（main Sentry 是否已 init）；Web 读取 `Sentry.getClient()` 是否存在。弹窗打开时即判断。
- 超时：renderer 侧 15 秒 `Promise.race`。
- 成功：`captureFeatureUsed('feedback', 'sent', attachLogs)`；编号取 event id 前 8 位展示，复制完整 id。
- 操作关联：播放失败入口带 `operation_id`，写入 feedback 的 `tags` / message 前缀便于检索。

### 7. 反馈界面

- 共享 `components/modules/shared/FeedbackDialog.tsx`（shadcn Dialog），通过 jotai atom 控制开启与预填；草稿存在 atom 中（运行期保留）。
- 「附带诊断日志」勾选状态存入 app 设置 atom（持久化）。
- 状态机：`editing → sending → success | failed`；sending 期间禁用关闭；有内容时关闭先确认放弃。
- 关于页「问题反馈」区块顶部新增「发送诊断反馈」行与「日志位置 · 打开目录」（仅 Electron）。
- macOS 菜单「反馈问题…」：发送 `showSetting('about')` 后再发 `openFeedback` 事件。
- `PlayerCompatibilityNotice` 错误态加「反馈此问题」按钮。

### 8. 重置

`lib/cleaner.ts` 的 `clearAllData()` 调 `clearLogs()`（删历史文件、截断当前文件），随后写 `app_reset`。

## 风险与权衡

- **Sentry 附件可用性未验证**：feedback 类型事件附件在后台能否下载、是否计费、服务端 Data Scrubber 是否改写附件需实测。若不理想，退路为 `captureMessage('user_feedback')` 携带附件并与 feedback 互相引用。作为第一个任务验证。
- **开发态无法直接测试发送**：main Sentry 在遥测关闭时不初始化，需 `VITE_TELEMETRY_DEBUG=true`；运行手册注明。
- **崩溃时丢失 renderer 最后 1 秒批次**：renderer 崩溃本身由 main 记录，可接受。
- **同步写入的性能**：每批一次 `appendFileSync`，量级每秒最多数十行，影响可忽略。
- **日志含完整路径**：符合「不脱敏」产品策略，界面不额外提示。
- **与 `data-storage-usage` 冲突**：同改 `ipc/app.ts`、`lib/cleaner.ts`，先归档该变更。
- **旧日志目录删除**：仅删除 `log/` 子目录，路径写死校验，避免误删 appData。

## 实现后调整（2026-10-02）

- **开发版日志目录**：改为 `<userData>/logs`（userData 已位于 `Marchen (dev)`），而不是 `~/Library/Logs/Marchen (dev)`；隔离效果相同，且 Windows 下无需单独推导路径。
- **renderer 批量发送**：使用简单队列（1 秒或 50 条），未用 RxJS `bufferTime`，因为页面隐藏时需要主动立即 flush。
- **未捕获异常（main）**：使用 `uncaughtExceptionMonitor` 只观察，不改变 Electron 默认异常处理。
- **菜单入口**：「反馈问题…」直接打开全局反馈弹窗（renderer 事件 `openFeedback`），不再先切到关于页；弹窗层级高于设置 ModalStack，任何页面都可用。
- **关闭确认**：草稿在本次运行内保留，关闭不会丢失内容，因此不再弹「放弃这次反馈？」确认。
- **播放失败关联**：本地日志客户端记录最近一次 `video_import_started` 的 `operation_id`，播放失败页「反馈此问题」预填失败说明与错误详情并携带该 ID；Web 全屏作用于播放器元素，点击时先退出全屏避免弹窗被遮挡。
- **反馈状态**：弹窗内容组件每次打开重新挂载，自然重置发送状态与在线检查。
- **任务 1.1 结论**：Electron main 发送的 feedback 附件在 Sentry User Feedback 详情中显示并可下载，确定沿用 `captureFeedback`。Sentry 默认开启反馈垃圾识别，测试内容会被标为 Spam，需在项目 User Feedback 设置中按需关闭。Web 端发送与 Data Scrubber 对附件的影响待发版前补测。
