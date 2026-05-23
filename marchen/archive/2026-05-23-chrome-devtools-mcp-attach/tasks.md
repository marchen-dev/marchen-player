## 背景

让 Chrome DevTools MCP 直接 attach 到 Electron 开发实例，替代之前通过 Web 模式 (dev:web) 启动独立 Chrome 的方式。这样 Claude 可以在真实 Electron 环境中预览 UI、调试 IPC 相关逻辑。

方案：

- 开发模式下，Electron 主进程暴露远程调试端口 9222（仅 `isDev`，生产构建不开）。
- 项目根新增 `.mcp.json`，配置 `chrome-devtools-mcp` 以 `--browserUrl=http://127.0.0.1:9222` attach 模式连入。
- CLAUDE.md 同步说明新工作流：`pnpm dev` 起 Electron 后 MCP 自动 attach，不再用 Web 模式做 MCP 预览。

## 1. 暴露调试端口

- [x] 1.1 在 `src/main/index.ts` 的 `bootstrap()` 开头，`isDev` 为真时调用 `app.commandLine.appendSwitch('remote-debugging-port', '9222')`（必须在 `app.whenReady()` 前）

## 2. MCP 配置

- [x] 2.1 在项目根新建 `.mcp.json`，注册 `chrome-devtools` server，args 使用 `--browserUrl=http://127.0.0.1:9222`

## 3. 文档同步

- [x] 3.1 更新 `CLAUDE.md` 的「UI 预览」相关说明：标注 `pnpm dev` + chrome MCP attach 模式为推荐流程，提示端口冲突处理与多 target 选择
