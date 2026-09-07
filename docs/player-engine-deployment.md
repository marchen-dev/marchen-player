# 播放器部署与诊断

开发分支使用 H5 / Canvas 双内核，没有 Node 转码服务器。`pnpm media:prepare` 从固定依赖
复制 HEVC 0.1.1、SoundTouch 2.1.1 的资源和许可证；提交 lockfile，部署完整构建目录。
禁止单独替换其中一个 Worker 或 WASM 文件。资源路径保留版本号，更新后避免旧页面混用新资源。

## Web

站点需通过 HTTPS（本机 localhost 可例外）提供服务。HTML 响应配置：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Vite dev/preview 已设置；生产站点必须自行配置同样的头，不能依靠开发服务器配置。
不设置 CSP。`credentialless` 允许不带凭据的跨源图片，同时保留浏览器支持时的跨源隔离；
需要 Cookie 的跨源资源应使用支持 CORS 的加载方式或同源代理。
[Chrome 官方说明](https://developer.chrome.com/blog/coep-credentialless-origin-trial?hl=en)。

- `.wasm` 返回 `application/wasm`，`.js` / `.mjs` 返回 JavaScript MIME。
- `/api/v2` 反代至弹弹play代理。封面、字体和监控必须按实际生产域名验证，不能以 HTTP 200 代替渲染/发送成功。
- 本地 Worker、WASM、AudioWorklet、libass 字体资源均需部署，禁止把资源请求重写成 SPA 的 HTML。
- `crossOriginIsolated` 为 true、`SharedArrayBuffer` 可用仅说明运行环境满足前提；还需查看实际 decoder mode 为 threads。
- 隔离不成立时可降为单线程，UI/诊断应展示真实结果；这不等同于正式多线程验收。

## Electron

生产应用通过 `marchen://app` 加载，协议返回上述隔离头，`bypassCSP=false`。
Sentry 使用 IPCMode.Classic，通过已有 Preload 连接；不要恢复默认 Both，否则 SDK 再次注册协议会覆盖应用的 secure 声明。
原文件通过受控媒体租约访问，支持 HEAD/Range/ETag；窗口导航、关闭和释放租约会撤销读取。
打包后应验证应用资源、Worker/WASM、离线播放、远程封面/API/监控，开发态成功不能替代打包态。
不再打包旧 `resources/ffmpeg` 资源。

## 诊断边界

实际内核、backend、解码线程数、首帧、seek、缓冲和队列峰值来自运行时。
WASM 线性内存不是进程 RSS；5 个 pthread Worker 和 768 MiB 上限按解码实例计算。
后台截图/预览有独立且有界的解码任务，不应把它们误算为播放队列泄漏。

新数据库为 `MARCHEN_PLAYER_DB` v1。旧记录不迁移、不主动删除。Web 文件授权不可用时重新选择，
不保存临时媒体 URL。采集事件不能包含文件路径、blob URL 或媒体租约 token。

当前验证范围以 `marchen/changes/rebuild-cross-platform-player-engine/evidence/` 为准；
未取得目标机器、正式部署或 HDR 显示器证据的项目保持未验证。
