# Marchen 可观测性运行手册

## 当前事件口径

所有安装数按匿名 install_id 去重。Web 清除站点数据或重置会产生新 ID，不等于自然人身份。筛选 environment=production、app_target=web，避免混入预览。

| 指标 | 当前事件 |
| --- | --- |
| DAU / WAU / MAU、留存 | app_session_started 的唯一 install_id |
| 启动到播放漏斗 | 同一 app_session_id 下 video_import_started → video_import_completed → media_prepare_completed → playback_started，按 operation_id 关联一次导入 |
| 功能使用率 | feature_used 的 feature/action |
| 自动切兼容率 | playback_engine_changed，trigger=automatic、to=compat、result=success；按唯一 operation_id 去重，分母为同窗口唯一 video_import_started operation_id |
| 播放失败 | playback_failed；区分 attempt_id 的失败尝试与用户最终未能播放，恢复成功不可直接计为最终失败 |
| 首帧 | playback_started.time_to_first_frame_ms，按 engine/backend/dist 分组 |
| seek | playback_seek_completed 的 result、duration_ms |
| 卡顿 | playback_ended 的 stall_count、stall_duration_ms、watched_ms，显著卡顿阈值 1 秒 |
| 字幕失败 | subtitle_failed.stage：resolve / renderer / catalog / import；用户取消不计故障 |

关键事件有本地 outbox（见 outbox.ts），并不代表服务端一定已收妥。终端关闭、网络及采集拦截会造成缺失，漏斗应按相同时间窗与操作去重，不混用事件条数和安装数。

## Sentry

查询标签：release、dist、app_target、runtime、error_code。字幕主动降级错误使用 SUBTITLE_RESOLVE_FAILED / SUBTITLE_RENDERER_FAILED / SUBTITLE_CATALOG_FAILED / SUBTITLE_IMPORT_FAILED。字幕错误诊断只保留阶段与错误类型，不上传字幕内容、文件名或临时 URL。组件捕获错误后不能仅 setError，必须显式经过 telemetry 边界。

Web 使用 @sentry/react；Electron 使用对应 SDK。Source Map 构建期上传，运行时变量不包含上传认证。SDK 接入、日志和单元测试成功不证明线上事件、源码还原或告警已验收。

## 发布

Web 走 [EdgeOne 独立发布](./web-edgeone-release.md)，不再由 Electron tag 协调。release=Marchen@版本+提交，生产 dist=web/environment=production，预览 dist=web-preview/environment=preview。构建校验变量、上传 Source Map 并检查不携带 .map；生产 deploy 记录应晚于实际发布成功。

Electron tag workflow 继续完成桌面各平台的 Source Map、release 和安装包发布。Main/Preload/Renderer 的诊断独立于 Web 发布。

## 本地验证

开发默认不上报，只有显式 VITE_TELEMETRY_DEBUG=true 才临时打开。分别验证会话、播放漏斗、字幕错误、React 异常、Source Map、回放和告警；检查结束关闭诊断窗口。不要将本地 .env 的秘密提交。回放默认未遮蔽普通文字，视频/弹幕/字幕等层以 data-telemetry-replay-block 排除；实际采集范围需要在后台核实。

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

事件仅使用白名单枚举和数值，不传任务 ID、infoHash、文件名、本地路径、链接、磁力、节点 IP 或错误原文。下载页及其门户弹窗、目录设置和下载错误详情同时屏蔽 PostHog 自动采集、两端回放；Sentry 自动 UI breadcrumb 忽略带屏蔽标记的目标。开发环境仍遵循既有 `VITE_TELEMETRY_DEBUG` 开关，不为验收自动开启线上上报。
