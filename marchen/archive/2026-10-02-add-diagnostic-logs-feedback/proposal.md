## 动机

用户反馈问题时，我们缺少可靠的现场信息：

1. **本地日志形同虚设**：`electron-log` 已接入，但正式版 `main.log` 几乎只有 Sparkle 告警；renderer 完全不落地，导入、匹配、播放、字幕、下载的失败只存在于 Sentry。
2. **Sentry 不是兜底**：离线、开发态关闭遥测、网络或扩展拦截时事件会丢，Sentry Logs 也是逐条实时发送，无法事后补交。
3. **用户没有入口**：界面上无法打开日志或附带诊断信息反馈，只能去 GitHub / 邮件口述，往往说不清编码、内核、系统环境。

本变更为 Electron 建立始终开启、体积受控的本地诊断日志，并提供「一键反馈」把描述与日志通过 Sentry 用户反馈附件上报；Web 端只提供基于内存记录的反馈。

## 变更内容

- **本地诊断日志（Electron）**：main 作为唯一写入者，以 JSON Lines 记录失败与异常、关键播放链路节点和启动环境快照；3 × 5 MB 轮转、重复合并、单行截断、info 限流；不受遥测开关影响；开发与正式版目录隔离；替换旧 `Application Support/Marchen/log` 目录。
- **renderer 接入**：新增本地日志 telemetry client 挂入组合客户端（始终存在），监听全局 `error` / `unhandledrejection`，经 IPC 批量交给 main；Web 端仅保留内存环形缓冲。
- **main 补齐监听**：未捕获异常、渲染进程 / 子进程崩溃、窗口无响应、页面加载失败；electron-updater 文本日志兼容写入。
- **一键反馈**：共享反馈弹窗（描述必填、联系方式可选、默认附带诊断日志），入口为设置 › 关于、macOS 应用菜单「反馈问题…」、播放失败提示「反馈此问题」；Electron 由 main 读取并压缩日志后通过 Sentry 用户反馈附件发送，Web 附带内存记录；成功显示反馈编号，失败保留输入并提供兜底（打开日志目录 / 复制诊断信息 / 复制邮箱）；PostHog 记录 `feature_used`。
- **重置应用**：同时清空日志并写入 `app_reset`。
- **文档**：`docs/observability-runbook.md` 增补本地日志与用户反馈章节。

不做：数据区「清除日志」入口、反馈内容预览、Web 端持久化日志。

## 能力

### 新增能力

- `local-diagnostic-log`：本地诊断日志的记录范围、格式、体积控制、目录、生命周期与平台差异。
- `diagnostic-feedback`：用户反馈的入口、弹窗交互、附带日志、发送结果与兜底。

### 修改能力

无（仓库尚无相关主 spec）。

## 影响范围

- Main：`index.ts`、`bootstrap.ts`、`initialize/log.ts`、`initialize/menu.ts`、`windows/main.ts`、`ipc/app.ts`、`lib/cleaner.ts`、`lib/update.ts`、`telemetry/sentry.ts`、`telemetry/operational-errors.ts`。
- Renderer：`services/telemetry/`（新增 local-log、feedback，修改 initialize）、`components/modules/shared/FeedbackDialog.tsx`（新增）、设置 › 关于页、`player/shell/PlayerCompatibilityNotice.tsx`。
- 依赖：不新增依赖，复用 electron-log、zlib、@sentry/electron、@sentry/react、posthog-js、RxJS、@marchen/electron-ipc。
- 外部：Sentry User Feedback 与附件额度需后台确认。
- 与进行中变更：`data-storage-usage` 同样修改 `ipc/app.ts` 与 `lib/cleaner.ts`，建议先归档。
