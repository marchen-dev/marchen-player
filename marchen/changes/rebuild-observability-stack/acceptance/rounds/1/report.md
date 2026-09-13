# 第 1 轮验收报告

本轮覆盖 Web 与 Electron 的真实 SDK 初始化、四运行时 Source Map、HEVC/EAC-3 兼容播放、长视频资源量、Replay 隔离和发布流水线。

运行 Electron 时发现自定义 `marchen://` scheme 在异步 Sentry 初始化后注册会晚于 `app.ready`；已将 scheme 声明提升到同步最小入口，业务 bootstrap 仍保持在 Sentry 初始化之后，并重新启动验证成功。

项目没有自有 Worker 入口；当前 HLS 与 libass Worker 均来自第三方依赖，因此没有编造 Worker 受控异常。构建配置仍会处理所有项目自有 Rollup chunk 的 hidden Source Map 与 Debug ID。

Sentry 的四个受控事件由当前真实构建产物、Debug ID 与生成位置构造，并通过项目 DSN 进入实际项目；这既验证了 ingestion，也验证了 artifact 映射，不依赖本地 mock。

密集弹幕的碰撞和丢弃边界由仓库既有 `dense-collision` 与 `collision-regressions` 场景验证；运行态额外装载了 1200 + 1000 条评论，用于确认 Replay 请求不会随弹幕数增长。
