# AGENTS.md

本文档为 Codex 提供本仓库的工作指引。

## 项目概述

Marchen Player：本地动漫视频弹幕播放器，拖入视频自动匹配弹幕。Electron + React，同时支持 Web。后端 API 代理弹弹play。

- **技术栈**：Electron 41 + React 19 + TypeScript + Vite + Tailwind 4
- **包管理**：pnpm 10（`corepack enable`），ES Module，AGPL-3.0

## 常用命令

```bash
pnpm dev          # Electron 开发（HMR）
pnpm dev:web      # Web 开发（端口 1106）
pnpm build        # 构建 Electron（含 typecheck）
pnpm build:web    # 构建 Web
pnpm typecheck    # 类型检查（node + web）
pnpm lint[:fix]   # ESLint
pnpm format       # Prettier
```

首次需 `cp .env.example .env`。

## 架构

### 双进程 + 双构建目标

标准 Electron 三层 + 纯 Web 构建：

- **Main** (`src/main/`)：窗口、文件系统、FFmpeg、自定义协议
- **Preload** (`src/preload/`)：桥接
- **Renderer** (`src/renderer/src/`)：React 前端，同时为 Web 版本

构建：Electron 用 `electron-vite`，Web 用 `vite`。两套 tsconfig：`tsconfig.node.json` / `tsconfig.web.json`。

### Monorepo（pnpm workspace）

| 包 | 说明 |
|----|------|
| `@marchen/electron-ipc` | 类型安全 IPC 封装 |
| `@marchen/shared` | main/renderer 共享常量与类型 |
| `@marchen/player-core` | 播放器加载核心（RxJS 状态机，纯 TS） |

### IPC 通信

`@marchen/electron-ipc`：`defineGroup` + `handler` 定义于 `src/main/tipc/`（app/player/setting/utils），渲染端通过 `ipcClient?.group.method()` 调用。事件用 `createEmitter` / `createListener`。Web 环境 `ipcClient` 为 null，必须可选链。

### 播放器加载核心

纯 TS + RxJS，通过 Port 接口依赖反转。Command/Observer/Strategy/State 模式。

**状态机**：
```
idle → importing → hashing → matching → [waiting_user] → loading_danmaku → ready → playing
                                                                                     ↓
                                                                                 reloading → playing
任何步骤 → error
```

**Port**：`DanmakuAPI`、`DanmakuCache`、`VideoImporter`、`HistoryStore`、`PlayerBridge`、`SettingsReader`

**Pipeline**：`load.ts`（主加载）、`rematch.ts`（重新匹配 / 本地导入）

### 状态管理

| 方案 | 用途 |
|------|------|
| Jotai | 全局 UI 状态（`atoms/`，自定义 store `jotaiStore` 支持组件外访问） |
| TanStack Query | 服务端数据（gcTime=10min, staleTime=5min） |
| Dexie (IndexedDB) | 持久化（`database/`，当前 v3） |
| RxJS | player-core 状态机 |

关键 atom：`videoAtom`、`playerSettingSheetAtom`，设置类在 `atoms/settings/`。

### 数据库 HISTORY 表

主键 `hash`，字段：path、animeId、episodeId、animeTitle、episodeTitle、progress、duration、cover、thumbnail、danmaku、newBangumi、subtitles、updatedAt。

- `danmaku`: `Array<{ type: 'auto'|'local', source, selected?, content: CommentsData }>`
- `subtitles`: `{ defaultId, timeOffset?, tags: Array<{ id, path, index?, title, language? }> }`

### API 请求

`ofetch` 封装于 `request/ofetch.ts`，API 模块在 `request/api/`（match、comment、bangumi、search），类型在 `request/models/`。基础 URL 由 `VITE_API_URL` 配置。

**弹弹play 接口文档**：`https://api.dandanplay.net/swagger/v2/swagger.json`（需要新增/核对接口时通过 WebFetch 读取）。

### 其他

- **自定义协议**：`marchen://`，逻辑在 `src/main/lib/protocols.ts`，常量在 `@marchen/shared/constants/protocol.ts`
- **播放器**：`@suemor/xgplayer`（fork） + `danmu.js` + `@jellyfin/libass-wasm`（ASS/SSA），自定义插件在 `components/ui/xgplayer/plugins/`
- **UI**：shadcn/ui (Radix) + Tailwind 4 + next-themes，图标 `icon-[mingcute--xxx]`，动画 framer-motion（LazyMotion），模态框 ModalStackProvider
- **路由**：React Router 7 HashRouter，`router/router.tsx` 定义 `/player`、`/history`，侧边栏由 `siderbarRoutes` 渲染，默认重定向 `/player`
- **平台判断**：`isWeb = !window.electron`，见 `src/renderer/src/lib/utils.ts`
- **错误监控**：Sentry，DSN 由 `VITE_SENTRY_DSN` 配置

## 目录结构

```
src/
├── main/                 # Electron 主进程（index、ipc、initialize、lib、windows、modules、constants、types）
├── preload/              # 预加载
└── renderer/src/         # React 前端 / Web
    ├── components/{ui,modules/{player,settings,shared,app},layout,icons,common}
    ├── page/{player,history}
    ├── atoms/            # Jotai
    ├── hooks/  services/  request/  database/  router/  providers/  initialize/  lib/

packages/{electron-ipc,shared,player-core}
```

## 路径别名

`@renderer` → `src/renderer/src`，`@main` → `src/main`，`@pkg` → `package.json`，`@marchen/*` → `packages/*`。

## 代码风格

**Prettier**：无分号、单引号、行宽 100、2 空格、尾逗号 all，`prettier-plugin-tailwindcss` 自动排序。

**ESLint**：`@antfu/eslint-config`（含 React），启用 `react-hooks/rules-of-hooks`，禁止全局 `location`（用 `useLocation` 或 `getReadonlyRoute`）。

### 规范要求

- UI 与注释使用**中文**
- 支持视频：mp4、mkv；hash 为 16MB 前缀 MD5
- **注释**：积极写中文注释，解释意图、上下文、设计决策
- **类型安全**：避免 `any`，优先 discriminated union / 泛型约束
- **错误处理**：外部交互（API、文件、IPC）做降级，参考 player-core 弹幕获取失败降级为无弹幕
- **关注点分离**：遵循 Port / Service / Pipeline / Adapter 分层
- **响应式**：异步流优先用 RxJS operator，避免命令式嵌套回调
- **平台兼容**：考虑 Electron 与 Web 双端，Electron 专属逻辑用 `isWeb` 或 `ipcClient?.` 隔离
- **UI 预览**：使用 Chrome DevTools MCP（attach 模式，`.mcp.json` 配 `--browserUrl=http://127.0.0.1:9222`）。`pnpm dev` 启动 Electron 后，`isDev` 下主进程暴露 9222 调试端口。attach 后用 `list_pages` 选主窗口 target。9222 被占用时改端口并同步更新 `src/main/index.ts` 与 `.mcp.json`

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_URL` | 弹弹play API 代理（如 `https://dandi-proxy.suemor.com/api/v2`） |
| `VITE_SENTRY_DSN` | Sentry DSN |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_APP_BUNDLE_ID` | macOS 公证 |
