# 开发服务字幕 Worker COEP 诊断

2026-09-13 用户 pnpm dev 截图明确显示 subtitles-octopus-worker.js 被 COEP 拦截。此前独立窗口成功不能覆盖用户此失败。

实查原 5173：同一 Worker 200 响应包含 COOP same-origin / COEP credentialless；携带 If-None-Match 的 304 响应仅有 Vary/Date 等头，缺少隔离头。Vite 的提前返回分支未覆盖 server.headers。

修复：共享 mediaIsolationPlugin 在开发/预览中间件链前端设置隔离头，Electron/Web 均接入；保留 credentialless。修复后的独立 electron-vite dev 使用 5174（Node 22，与用户启动一致），相同 ETag 条件请求返回 304 且包含两个隔离头。三轮 Worker 创建与页面 reload 成功；独立 Arcane 真实文件播放在 12 秒显示“NETFLIX 剧集”，截图 subtitle-coep-arcane.png；记录 open 2 / scan 1 / Worker 1。退出释放成功。冷开脚本总时长 12.17 秒包含界面操作，不作为字幕提取性能结论。

边界：未在用户原 profile 中自然复现拦截，不能声称单凭缺头已证明所有失败根因；原 5173 进程未自动重载配置，用户需停止并重启 pnpm dev 验证。干净窗口修复前也可能成功。未更改用户占用的 9222 端口设置，独立验证用 9245；端口占用只阻止远程调试服务，无证据说明它导致 Worker COEP 错误。

类型检查通过，libass adapter 5 项测试通过。普通 Event 改为可读失败提示，不再展示 [object Event]；未掩盖 Worker 错误。
