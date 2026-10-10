# 检查记录

- 2026-10-10，Node 24.20.0。
- `pnpm test:player-runtime`：57 个测试文件，338 项通过（含新增 30 项主备线路回归）。
- `vitest run --config vitest.main.config.ts scripts/web/release.test.mjs`：3 项通过。
- `pnpm typecheck`：Node / Web 均通过。
- `pnpm build:web`：通过，保留现有大 chunk / 动静态导入提示。
- 对本次修改的请求、设置、遥测、测试、配置和发布脚本执行 scoped ESLint：通过，无输出。全仓 `pnpm lint` 未通过，扫描到了 Sparkle vendor 的 dSYM YAML 符号文件并报 plain-scalar 等错误；未修改供应商资源或扩展本次范围。
- `git diff --check`：通过。

## 浏览器验证

在内置 Chromium 浏览器打开 `http://localhost:1106`，使用页面内现有 Get / Post 请求封装，未通过 Node 或 curl 代替跨域验证。

- 手动 Cloudflare / EdgeOne：两边搜索返回 success=true；匹配 POST 使用测试文件名与全零哈希，返回有效 JSON、success=true（仅验证请求，不代表实际视频匹配成功）。浏览器 JSON POST 预检通过。
- 搜索得到 episodeId=2390001，分别请求两条线路的弹幕接口，均收到 comments 数组和 count=5423。
- EdgeOne 模式刷新后仍保持选择，证明偏好持久化；最终恢复自动模式。
- 通过 CDP 临时阻断 `.cc`，在自动模式连续调用两次搜索，均成功；UI 更新为 EdgeOne 备用状态。故障注入已解除。
- 设置页截图：`.tmp/test-results/api-route/settings.jpg`（本地不提交）。

限制：未在发行版 Electron 中重复验证；未验证生产 PostHog / Sentry 入库。五分钟到期、取消、超时和并发迟到结果通过确定性测试验证，未在浏览器等待五分钟。

## 后续调整

- 按用户确认改为从 `.env` / 构建环境读取两条线路基址；同步本地 `.env` 与示例，移除旧 `VITE_API_URL`。GitHub 发版使用同名 Repository Secrets，与用户现有配置一致。
- 通用设置顺序改为外观、播放、网络、数据；线路说明仅保留当前线路一行。
- 配置调整后 338 项运行时测试、4 项 Web 发布测试、类型检查、Web 与 Electron 构建均通过；分别验证两端缺少配置时在构建前明确失败。涉及文件的 ESLint 和 `git diff --check` 通过。
