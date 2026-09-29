# Electron 本机实现与验证

2026-09-29，macOS ARM64，Node 24.20.0 / Electron 44.0.0。此记录只证明本机开发态与构建结果，不代表安装包、Windows 或公网吞吐验收。

## 已实现

- 左侧下载页、两步新建、磁力/torrent、选集、保存目录、合集展开、筛选搜索、任务操作与通用下载设置。
- utilityProcess 引擎、类型化 IPC、主进程任务所有权、JSON 备份恢复、离线校验、真正暂停、分享率/做种时长停止策略。
- 系统 torrent 请求 FIFO、重复任务定位、窗口就绪后接收；builder 中注册 torrent 打开方式。
- 完整文件播放、未完成媒体/字幕过滤、播放租约占用保护、清除数据先停止引擎且保留视频。
- 依赖导入使用 electron-vite modulePath，避免多入口共享分块改变既有主进程资源相对路径。

## 自动检查

- 主进程：30 个测试文件，164 项通过，包含本变更新增的路径/存储/策略/服务/队列测试。
- 播放运行时：45 个测试文件，209 项通过。
- Electron 构建（包含 node/web typecheck）通过。
- Web 构建通过；扫描产物未发现 webtorrent、node-datachannel、bittorrent-dht 下载运行时。
- 新增下载模块 ESLint 无错误；差异空白检查通过。
- 日志位于 `.tmp/test-results/downloads/final-build.log`、`final-build-web.log`。

## 真实应用链路

使用独立 `.tmp/test-results/downloads/app-profile`，不会复用日常播放记录。调用 FFmpeg 生成两段 8 秒测试画面，仅用于测试素材；播放器本身未引入 FFmpeg。

`local-seeder.mjs` 提供仅本地 HTTP tracker / TCP 的私有种子，禁用公网 DHT、LSD、UPnP；源样片在 `.tmp/test-results/downloads/e2e-media`。下载通过产品真实 utilityProcess 运行。

1. 冷启动携带 torrent 路径，自动进入下载确认弹窗。
2. UI 取消选择第二个视频，确认后第一集完成；与源文件 SHA-256 一致。
3. 完成后保持下载页，不自动播放或创建影视库作品。
4. 点击播放进入原有导入流程；测试片无动漫匹配，使用原有直接播放入口。主 video readyState=4、时长 8 秒、currentTime 前进，无媒体错误。
5. 播放时 IPC 请求同时删除文件，返回「文件正在播放，请先结束播放」。
6. 暂停两个任务后重新启动：完整文件恢复 completed/paused 意图；未完成文件恢复 paused，不自动联网继续。
7. 冷启动再次同时打开两个已有种子：任务数仍为 2，依次定位已有任务，最终没有残留确认弹窗。
8. 搜索无结果与清空筛选通过；Esc 关闭弹窗后焦点回到新建下载。
9. 独立 IndexedDB 记录 history=1、library=0，符合无匹配样片只产生观看历史、不批量入库的规则。

## 界面证据

截图位于 `.tmp/test-results/downloads/`：
- `new-download.png`：真实种子选集弹窗。
- `completed.png`：下载完成/做种状态。
- `playback.png`：本地样片播放。
- `dark-small.png`、`dialog-dark-small.png`：800×650 深色布局和弹窗。
- `long-name-dark-small.png`：长文件名与等待连接，viewport/document scrollWidth 均为 800，无横向溢出。
- `final-light.png`、`final-dark-small.png`：恢复后的任务列表。
- `app-result.json`、`restart-ui.json`、`duplicate-open.json`：对应运行时断言。

9222 被现有 Chrome 占用，隔离测试应用通过命令行使用 9223，未修改日常调试端口配置。当前会话没有 Chrome DevTools MCP 工具，使用 playwright-core 直接连接该测试 Electron 的 CDP 验证。

## 尚未验收

任务 6.4：macOS ARM64 / Windows x64 正式安装包中的原生依赖、asar、文件读写/停止和 Finder/资源管理器关联。没有以开发态 argv 测试冒充 Finder 安装关联；无 Windows 运行证据。检查本地 `.env` 后确认未配置 `SPARKLE_ED_PUBLIC_KEY`，现有 after-pack.cjs 要求该正式更新公钥，因此未绕过发布配置创建正式 macOS 安装包。

任务 6.5：正式 Marchen 人工验收轮次尚未创建，不能将本地检查结果视作用户接受。公网发现、真实资源速度也未作支持或性能承诺。

测试收尾：已停止隔离 Electron 与本地 seeder，删除本次生成的两个测试下载任务及其下载副本；源 fixture、截图、结果 JSON 保留在 .tmp，日常应用数据未变。
