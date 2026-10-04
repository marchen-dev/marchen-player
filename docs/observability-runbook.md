# Marchen 可观测性运行手册

## 当前事件口径

所有安装数按匿名 install_id 去重。Web 清除站点数据或重置会产生新 ID，不等于自然人身份。筛选 environment=production、app_target=web，避免混入预览。

| 指标                  | 当前事件                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| DAU / WAU / MAU、留存 | app_session_started 的唯一 install_id                                                                                                               |
| 启动到播放漏斗        | 同一 app_session_id 下 video_import_started → video_import_completed → media_prepare_completed → playback_started，按 operation_id 关联一次导入     |
| 功能使用率            | feature_used 的 feature/action                                                                                                                      |
| 自动切兼容率          | playback_engine_changed，trigger=automatic、to=compat、result=success；按唯一 operation_id 去重，分母为同窗口唯一 video_import_started operation_id |
| 播放失败              | playback_failed；区分 attempt_id 的失败尝试与用户最终未能播放，恢复成功不可直接计为最终失败                                                         |
| 首帧                  | playback_started.time_to_first_frame_ms，按 engine/backend/dist 分组                                                                                |
| seek                  | playback_seek_completed 的 result、duration_ms                                                                                                      |
| 卡顿                  | playback_ended 的 stall_count、stall_duration_ms、watched_ms，显著卡顿阈值 1 秒                                                                     |
| 字幕失败              | subtitle_failed.stage：resolve / renderer / catalog / import；用户取消不计故障                                                                      |

关键事件有本地 outbox（见 outbox.ts），并不代表服务端一定已收妥。终端关闭、网络及采集拦截会造成缺失，漏斗应按相同时间窗与操作去重，不混用事件条数和安装数。

## Sentry

查询标签：release、dist、app_target、runtime、error_code。字幕主动降级错误使用 SUBTITLE_RESOLVE_FAILED / SUBTITLE_RENDERER_FAILED / SUBTITLE_CATALOG_FAILED / SUBTITLE_IMPORT_FAILED。字幕失败上报目前只构造阶段与错误类型的稳定诊断错误（为聚合而非隐私）。组件捕获错误后不能仅 setError，必须显式经过 telemetry 边界。

Web 使用 @sentry/react；Electron 使用对应 SDK。Source Map 构建期上传，运行时变量不包含上传认证。SDK 接入、日志和单元测试成功不证明线上事件、源码还原或告警已验收。

## 采集与脱敏策略

按产品决定完整上报，客户端不做任何隐私遮蔽或脱敏：

- Sentry 与 PostHog 不改写 URL、token、本地路径、文件名、界面文本或输入框内容；`sendDefaultPii` 开启。
- 两端回放均不遮蔽文字与输入（PostHog `mask_all_text` / `maskAllInputs` 与 Sentry `maskAllText` / `maskAllInputs` 均为 false）。
- 唯一的回放屏蔽是弹幕运动层的 `data-telemetry-replay-block`，原因是高频 DOM mutation 会拖垮录制和播放，不是隐私；Sentry 也忽略该层上的 UI breadcrumb。视频、canvas 字幕与缩略图本来就不录像素，无需屏蔽。
- `services/telemetry/bound.ts` 只限制长度、深度、集合大小并消除循环引用，防止 payload 被拒收，不承担脱敏职责。
- Sentry 服务端默认的 Data Scrubber 与 IP 存储限制仍会替换 password/token 等字段，客户端代码覆盖不到；需要完整数据时到 Sentry 项目设置 → Security & Privacy 关闭 “Data Scrubber”“Use Default Scrubbers”“Prevent Storing of IP Addresses”。

结构化产品事件（PostHog capture）仍只带白名单枚举与数值，这是为了聚合维度稳定、避免高基数，不是隐私限制；需要明细排障时看回放、breadcrumb 与 Sentry context。

## 发布

Web 走 [EdgeOne 独立发布](./web-edgeone-release.md)，不再由 Electron tag 协调。release=Marchen@版本+提交，生产 dist=web/environment=production，预览 dist=web-preview/environment=preview。构建校验变量、上传 Source Map 并检查不携带 .map；生产 deploy 记录应晚于实际发布成功。

Electron tag workflow 继续完成桌面各平台的 Source Map、release 和安装包发布。Main/Preload/Renderer 的诊断独立于 Web 发布。

## 本地验证

开发默认不上报，只有显式 VITE_TELEMETRY_DEBUG=true 才临时打开。分别验证会话、播放漏斗、字幕错误、React 异常、Source Map、回放和告警；检查结束关闭诊断窗口。不要将本地 .env 的秘密提交。回放只排除弹幕运动层；实际采集范围需要在后台核实。

FFmpeg/Gateway/media.generation 与 compat_fallback_triggered 为历史版本口径，不适用于现在的 native/compat 内核；历史事件不直接拼接为同一条性能趋势。

## 下载与远程导入事件

- `download_add_result`：HTTP／磁力／种子元数据读取、创建请求的结果与耗时。
- `download_state_changed`：新建、完成、失败、选集变化，含类型、选中文件数、容量及已完成字节。`elapsed_ms` 是自任务创建以来的墙钟时间（含暂停），不是纯传输耗时。
- `download_action_result`：暂停、继续、重试、删除、播放、打开目录及选集操作的结果；删除只记录是否同时删除文件。
- `download_progress_stalled`：运行任务连续 60 秒无已完成字节增长，每个停滞阶段只报一次；HTTP 排队、暂停和校验阶段不计入。BT 附带本轮接收量、节点数和校验失败次数，不上传节点地址。
- `remote_import_result`：远程导入成功、失败或取消，含耗时、是否恢复历史、是否取得指纹及读取字节数，不上传指纹值。
- `video_import_started.source` 增加 `remote_url` / `download`，影视库远程记录仍标为 `library`。
- `feature_used` 补充弹幕复制结果、节点详情打开、文件列表展开及下载设置保存；不包含弹幕原文或保存目录。

下载状态由根级观察器订阅，与当前路由无关；首次快照仅建立基线，不重报历史完成任务。整个渲染窗口关闭期间的状态变化不补报，因此这些事件不能用作跨应用会话的完整下载账本。完成／失败等状态事件、停滞及远程导入结果使用现有离线 outbox。

下载事件属性仅使用白名单枚举和数值，以保证聚合维度稳定；下载页、弹窗、目录设置和错误详情与其他页面一样参与 PostHog 自动采集与两端回放，不做屏蔽。开发环境仍遵循既有 `VITE_TELEMETRY_DEBUG` 开关，不为验收自动开启线上上报。

## 本地诊断日志与用户反馈

### 本地日志（Electron）

- **位置**：正式版 macOS `~/Library/Logs/Marchen/`，Windows `%APPDATA%\Marchen\logs\`；开发版在 `<userData>/logs/`（appData 为 `Marchen (dev)`），与正式版隔离。设置 › 关于 › 日志位置可直接打开。旧版 `<userData>/log/main.log` 会在首次启动时删除。
- **始终开启**：不受 `VITE_TELEMETRY_DEBUG` 与 Sentry 是否配置影响。main 是唯一写入者（electron-log 同步追加），renderer 经 `app.appendLogs` 批量（1 秒或 50 条）交给 main，页面隐藏时立即发送。
- **格式**：JSON Lines，每行 `{ t, lv, src, cat, msg, op?, data?, repeated?, truncated? }`。`t` 为产生时刻（renderer 自带），`op` 为 operation_id / attempt_id，可与 Sentry、PostHog 的同一次操作对应。electron-updater 等第三方纯文本被包装为 `cat: "updater"`。公共构建属性只出现在 `app_start`（main）与 `renderer_start`（renderer）快照中。
- **记录范围**：未捕获异常与未处理拒绝、渲染进程 / 子进程退出、窗口无响应、页面加载失败、显式上报错误、组合 telemetry client 收到的全部产品事件与面包屑；不记逐秒进度、弹幕与字幕正文。
- **体积**：`marchen.log` 5 MB 轮转，保留 `.1`、`.2` 两份历史，总量约 15 MB；同一 `级别+消息+错误码` 10 秒内超过 5 条只计数（补写 `repeated`）；单行超过 8 KB 截断 `data`；info 每分钟 120 条，超出补写 `info_rate_limited`。退出前同步写出待补汇总。
- **重置应用**：清空日志并写入 `app_reset`。
- **自身失败**：只打印到终端，不经遥测上报，避免递归。

Web 端不持久化日志，只在内存保留最近 2000 条，刷新即清空，用于反馈附带与「复制诊断信息」。

### 用户反馈

- **入口**：设置 › 关于「反馈问题…」、macOS 应用菜单「反馈问题…」、播放失败页「反馈此问题」（预填失败说明并携带最近一次导入的 operation_id）。
- **发送**：Electron 由 main 读取三份日志、gzip 为 `marchen-logs.jsonl.gz`，调用 `@sentry/electron/main` 的 `captureFeedback` 附件发送；Web 附带内存记录 `marchen-logs.jsonl`。tags：`feedback_source`、`attach_logs`、`operation_id`。联系方式为邮箱时写入 `email`，否则写入 `name`。成功后 PostHog 记录 `feature_used(feedback, sent, attachLogs)`。
- **查找**：Sentry → User Feedback，按反馈编号（事件 ID 前 8 位）或 `feedback_source` 筛选，附件在反馈详情中下载后 `gunzip` 查看。
- **不可用时**：Sentry 未初始化（开发态默认、未配置 DSN）时弹窗直接提示，并提供打开日志目录 / 复制诊断信息与复制邮箱。本地调试发送需 `VITE_TELEMETRY_DEBUG=true`。
- **已验证**：Electron 发送的 feedback 附件显示在 User Feedback 详情中并可下载。
- **垃圾识别**：Sentry 默认会把疑似无意义的反馈（如测试文本）自动归入 Spam，排查时注意查看 Spam 分栏，或在项目 User Feedback 设置中关闭。
- **待核实**：Web 端发送、附件额度与服务端 Data Scrubber 对附件内容的影响。
