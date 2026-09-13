# 本地验证

- `pnpm typecheck`：node/web 均通过。
- 修改实现及 service 回归文件的定向 ESLint：通过。
- `pnpm --filter @marchen/player-loading test`：18 项通过，包括导入持久化期间切换视频的迟到写入保护。
- `pnpm build:web`：通过。
- `pnpm exec electron-vite build`：main/preload/renderer 构建通过。
- Chrome headless 中运行 `check-browser.mjs`：16 项检查通过，覆盖 XML 时间/模式/实体/黑色、JSON、ARGB、错误/空输入、超限、同内容改名、同名不同内容。真实优酷 XML 15,354 条解析成功，读取/解析/hash 约 74–85 ms。
- `git diff --check`：通过。

复跑浏览器解析检查：启动 `pnpm exec vite --host 127.0.0.1 --port 1116`，运行 `node marchen/archive/2026-09-13-renderer-danmaku-import/check-browser.mjs [可选 XML 路径]`。可用 DANMAKU_TEST_URL 覆盖服务器地址。

边界：浏览器验证覆盖真实 File/DOMParser 与转换结果；未完成 Electron 原生文件选择、实际播放画面和 UI 人工验收，未发布线上。当前终端 Node 22，项目要求 Node 24，命令带引擎提示但上述检查通过。构建中的 Sentry 上传和 chunk 提示不影响产物生成。
