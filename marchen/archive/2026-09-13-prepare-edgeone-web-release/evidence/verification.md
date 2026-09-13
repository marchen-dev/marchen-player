# 本地验证与未验证边界

2026-09-13，feat/player-engine 工作区。本轮未提交、推送、部署或修改 EdgeOne 控制台。

- 运行时 Vitest：37 文件、173 项通过（含新增字幕错误上报与取消测试）。
- 发布与元数据 Vitest：2 文件、9 项通过；验证缺少配置提前拒绝、固定 API 上游/请求体/错误状态、不转发 Cookie，以及预览环境标识。
- 类型检查通过。完整 lint 0 errors / 81 warnings，既有 React 警告保留。历史 experiments 排除产品 lint，正式 scripts/tests 和应用代码仍参与。
- 本地 build:web 通过，显式清空 Sentry 上传认证及客户端采集变量，未上传 Source Map / 未发送遥测。
- 本地 Web 产物普通检查通过：65 文件、dist=web，无 Electron Sentry SDK。严格 require-no-maps 检查正确拒绝本地未上传 map 的产物，防止误当正式产物发布。
- Git diff --check 通过。旧 release.yml 已移除 SSH 上传与 web-artifact 依赖。
- 早期 Node test 文件被仓库 ESLint 自动迁移为 Vitest，已统一配置和所有调用入口；最终 9 项 Vitest 通过，不保留失效的 node --test 命令。

`.tmp` 12 MB 一次性材料已移到 `/tmp/marchen-debug-backup-1789299473`，没有删除原始诊断。正式证据仍在已归档迁移目录。历史 HDR/video 脚本整体移至 scripts/player-engine/experiments，同级深度不变且入口路径同步；未重新运行这些实验，不作为正式验收。

subtitle-session-regression 去掉了可能导入另一份 Vite 模块的 open/scan 计数，改为真实 Worker、Canvas 与轨道资源身份不变断言；本轮仅语法/静态检查，没有重新运行真实文件 Electron 回归，不宣称新增运行证据。

未验证：EdgeOne Node 24.5.0 / pnpm 11 的实际构建、Functions 路由集成、生产关联分支/自动发布设置、环境变量、预览及生产 HTTP 200/304 隔离头、API 上游实网、Sentry 上传与源码还原、PostHog 入库、告警、平台回滚。完整带凭据 build:web:release 未在本地执行，以免触发上传。由 docs/web-edgeone-release.md 列出的云端验收接续。
