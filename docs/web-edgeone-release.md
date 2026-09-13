# EdgeOne Web 独立发布

当前 Web 使用 EdgeOne 项目 marchen-player（Git 关联 marchen-dev/marchen-player），不是 GitHub Actions 经 SSH 上传。仓库内的 edgeone.json 会覆盖下一次 EdgeOne 构建的安装命令、构建命令和输出目录；本次未改云端、未推送或触发部署。

## 首次接入前

1. 在控制台确认生产环境的关联分支和自动部署开关。不要把含未验证代码的分支直接关联生产；先建立或使用预览环境。当前截图没有展示这些值，因此不在文档中猜测分支名。
2. Node 配置为 24.5.0（腾讯云构建文档列出的 24.x 预装版本），pnpm 固定 11.24.0。实际构建日志必须确认版本成功；若该项目运行环境不提供此版本，先在控制台选择可用的 Node 24，再同步 edgeone.json。不要退回 Node 22 忽略 engines。
3. 安装命令为 `npx --yes pnpm@11.24.0 install --frozen-lockfile`；输出 `out/web`；构建命令为 `npx --yes pnpm@11.24.0 run build:web:release`。不要将命令退回普通 build:web 绕过检查。
4. 仅提交源码、锁文件、运行资源准备脚本、函数与配置。不要上传整个工作目录。`.tmp`、out、dist、test-results 是本地输出；public/wasm/libav 与 audio/soundtouch 由 media:prepare 生成，许可证及随包源码保留。

## 环境变量

在 EdgeOne 对应环境配置，修改后需要新部署生效，不把秘密写进 Git：

| 变量 | 用途 |
| --- | --- |
| MARCHEN_DEPLOY_ENV | 必填 preview 或 production，须与控制台目标环境一致 |
| VITE_API_URL | `https://dandan-proxy.suemor.com/api/v2`，与固定 API 代理目标一致 |
| VITE_SENTRY_DSN | 客户端 Sentry 项目配置 |
| VITE_POSTHOG_KEY / VITE_POSTHOG_HOST | 产品事件采集 |
| SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT | 构建期 Source Map 上传；禁止添加 VITE_ 前缀 |

release 为 `Marchen@版本+完整提交SHA`；生产 environment=production、dist=web，预览 environment=preview、dist=web-preview。告警和仪表盘筛选 production，预览事件不能作为正式 DAU/失败率。Git 提交必须存在；本地未提交工作不会由 EdgeOne 构建。

构建入口先校验环境和 Node，然后依次执行类型检查、lint、运行时测试、发布入口/代理测试、Web 构建与 Source Map/资源门禁。凭据缺失或上传失败应阻断构建。构建成功不代表线上部署已成功，因此构建阶段不登记 Sentry production deploy。

## API 与资源

- `functions/api/v2/[[path]].js` 处理 `/api/v2/*`，仅转发到固定代理上游，保留路径、查询及 POST 正文，不转发浏览器 Cookie。上游非 2xx 状态原样返回，连接异常返回 502。更换上游须同步函数、环境和文档。
- edgeone.json 全路径配置 COOP same-origin / COEP credentialless，保持当前播放器隔离策略。仍需实测平台在 200/304 与缓存命中时均返回一致头。
- 初期使用 no-cache 重验证策略；不把无 hash 的 libass WASM 或 Worklet 设为一年 immutable。可后续对确定内容寻址的文件细分缓存。
- 应用是 HashRouter，无需把所有缺失路径重写为 index.html；不存在的 Worker/WASM 应真实返回 404。
- 线上检查 `.wasm` MIME 为 application/wasm，JS/MJS 为 JavaScript；API 返回 JSON，不是 SPA HTML。边缘函数及响应头不是 Vite preview 可以完整模拟的内容。

## 预览验收与生产发布

```text
提交确定版本 → EdgeOne 预览构建通过 → 预览域名验收
→ 通过项目的生产发布入口发布该版本 → 正式域名复验
```

预览和正式域名各执行：

- Chrome/Edge 桌面：H5 原生与兼容内核播放；Mujica/Arcane 内嵌字幕与外挂 SRT；暂停、seek、切轨；浅色应用主题下来源菜单和匹配弹窗。
- 刷新、重复打开至少三轮，确认 libass Worker 无 COEP blocked；记录 crossOriginIsolated 和实际解码后端。Safari/Firefox 不声明兼容内核支持，原生不支持时应清晰失败。
- DevTools 实查 HTML、字幕 Worker、WASM 的响应头、状态和 MIME，覆盖首次 200 与重验证 304，缺失资源 404。仅 curl 成功不证明 Worker 启动。
- PostHog 中确认 app_session_started、video_import_completed、playback_started；测试一次字幕受控失败，确认 subtitle_failed 与 Sentry SUBTITLE_* issue，关联版本和会话。
- 受控异常必须能还原源码行号；确认告警接收方收到通知。不要把代码中存在 SDK 等同于云端已收到。
- 生产发布成功并完成复验后再登记部署记录；若使用 Sentry release deploy 功能，放在实际成功之后，不能放在 EdgeOne 构建中。

保留发布前的部署 ID、提交 SHA 和域名。失败时在 EdgeOne 部署记录使用已验证版本的回滚/重新发布入口（以当前控制台提供的操作为准），再复验域名、缓存及资源。切回代码不保证撤销数据库变更；当前更改没有数据库迁移。缓存中的旧页面也应纳入恢复验证。

## 本地验证边界

`pnpm build:web` 仍供本地无凭据构建，可能保留 hidden .map，不能直接作为正式产物。`pnpm build:web:release` 是严格云端入口，本地没有凭据时应失败；不要用假凭据跑完整上传。

本次不改变现有 Replay 采集策略。默认未统一遮罩文本，公开推广前需要按已有产品决定核对采集范围。

官方参考：
- https://pages.edgeone.ai/document/edgeone-json
- https://edgeone.cloud.tencent.com/pages/document/162936788693114880
- https://edgeone.cloud.tencent.com/pages/document/162936866445025280
