# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Marchen Player 是一个本地动漫视频弹幕播放器，拖入动漫视频即可自动匹配弹幕。基于 Electron + React 构建，同时支持 Web 版本。后端 API 代理弹弹play 的接口。

- **技术栈**：Electron 41 + React 19 + TypeScript + Vite + Tailwind CSS 4
- **包管理器**：pnpm 10（`corepack enable` 启用）
- **License**：AGPL-3.0
- **模块类型**：ES Module

## 常用命令

```bash
pnpm dev          # 启动 Electron 开发服务器（含 HMR）
pnpm dev:web      # 启动 Web 开发服务器（端口 1106）
pnpm build        # 构建 Electron 应用（含 typecheck）
pnpm build:web    # 构建 Web 版本
pnpm build:mac    # 构建 macOS 安装包
pnpm build:win    # 构建 Windows 安装包
pnpm build:linux  # 构建 Linux 安装包
pnpm typecheck    # TypeScript 类型检查（node + web 两套配置）
pnpm lint         # ESLint 检查
pnpm lint:fix     # ESLint 自动修复
pnpm format       # Prettier 格式化
```

环境准备：需要先 `cp .env.example .env`。

## 架构

### 双进程 + 双构建目标

项目是标准的 Electron 三层架构，同时支持纯 Web 构建：

- **Main 进程** (`src/main/`)：Electron 主进程，负责窗口管理、文件系统操作、FFmpeg 调用、自定义协议处理
- **Preload** (`src/preload/`)：Electron 预加载脚本，桥接 main 和 renderer
- **Renderer** (`src/renderer/src/`)：React 前端应用，同时作为 Web 版本的代码

构建工具：

- Electron 构建使用 `electron-vite`（配置在 `electron.vite.config.ts`）
- Web 构建使用 `vite`（配置在 `vite.config.ts`，端口 1106）
- 两套 tsconfig：`tsconfig.node.json`（main 进程）和 `tsconfig.web.json`（renderer）

### Monorepo 结构

项目使用 pnpm workspace，内部包位于 `packages/`：

| 包名 | 路径 | 说明 |
|------|------|------|
| `@marchen/electron-ipc` | `packages/electron-ipc` | 类型安全的 Electron IPC 通信封装 |
| `@marchen/shared` | `packages/shared` | main/renderer 共享的常量、工具函数和类型 |
| `@marchen/player-core` | `packages/player-core` | 播放器加载核心逻辑（RxJS 状态机，纯 TS 无平台依赖） |

### 主进程与渲染进程通信（IPC）

使用自建的 `@marchen/electron-ipc` 包实现类型安全的 IPC 通信，采用分组（defineGroup）+ handler 的模式：

- **定义端**：`src/main/tipc/` 下按模块定义分组（app、player、setting、utils），使用 `defineGroup` + `handler` API
- **调用端**：`src/renderer/src/lib/client.ts` 创建 ipcClient，渲染进程通过 `ipcClient?.group.method()` 带命名空间调用
- **事件推送**：main → renderer 使用 `createEmitter`，renderer 端使用 `createListener` 监听
- Web 环境下 `ipcClient` 为 null，需要用 `ipcClient?.` 可选链调用

**IPC 分组**：
- `app` - 窗口操作、应用生命周期、更新进度
- `player` - 视频文件操作、FFmpeg 处理、弹幕解析
- `setting` - 设置管理
- `utils` - 工具方法

### 播放器加载核心（@marchen/player-core）

纯 TypeScript + RxJS 实现，无平台依赖，通过 Port 接口实现依赖反转。

**设计模式**：
- Command Pattern：所有操作通过 `dispatch` 统一入口
- Observer Pattern：`state$` 供多个消费者订阅
- Strategy Pattern：Port 接口实现可替换
- State Pattern：状态机明确定义转换规则

**状态机流转**：
```
idle → importing → hashing → matching → [waiting_user] → loading_danmaku → ready → playing
                                                                                      ↓
                                                                                  reloading → playing
任何步骤 → error
```

**Port 接口**（依赖注入）：
- `DanmakuAPI` - 弹幕匹配和获取
- `DanmakuCache` - 弹幕缓存（IndexedDB）
- `VideoImporter` - 视频导入（Electron/Web 各有实现）
- `HistoryStore` - 历史记录存储
- `PlayerBridge` - 播放中热更新弹幕
- `SettingsReader` - 设置读取

**Pipeline**：
- `load.ts` - 主加载流程（hash → match → fetch danmaku → finish）
- `rematch.ts` - 播放中重新匹配和本地弹幕导入

### 状态管理

| 方案 | 用途 | 位置 |
|------|------|------|
| Jotai | 全局 UI 状态（播放器设置面板、视频信息、窗口状态） | `src/renderer/src/atoms/` |
| TanStack Query | 服务端数据请求与缓存（gcTime=10min, staleTime=5min） | 各组件内 |
| Dexie (IndexedDB) | 本地持久化存储（播放记录、弹幕缓存） | `src/renderer/src/database/` |
| RxJS BehaviorSubject | 播放器加载状态机 | `packages/player-core/` |

**Jotai 关键 atoms**：
- `videoAtom` - 当前视频信息（url, hash, size, name, playList）
- `playerSettingSheetAtom` - 设置面板可见性
- Settings atoms 在 `atoms/settings/`（app、player、helper）
- 使用自定义 store（`jotaiStore`），支持组件外访问

### 数据库（Dexie/IndexedDB）

Schema 定义在 `src/renderer/src/database/`，当前版本 v3：

**HISTORY 表**：
- 主键：`hash`（文件 hash）
- 字段：path, animeId, episodeId, animeTitle, episodeTitle, progress, duration, cover, thumbnail, danmaku, newBangumi, subtitles, updatedAt
- `danmaku` 字段：`Array<{ type: 'auto'|'local', source, selected?, content: CommentsData }>`
- `subtitles` 字段：`{ defaultId, timeOffset?, tags: Array<{ id, path, index?, title, language? }> }`

### API 请求

- HTTP 客户端基于 `ofetch`，封装在 `src/renderer/src/request/ofetch.ts`
- API 模块在 `src/renderer/src/request/api/`：match（视频匹配）、comment（弹幕获取）、bangumi（番剧详情）、search（搜索）
- 类型定义在 `src/renderer/src/request/models/`
- 基础 URL 通过 `VITE_API_URL` 环境变量配置（默认代理弹弹play v2 API）

### 自定义协议

Electron 端使用 `marchen://` 协议处理本地文件访问，相关逻辑在 `src/main/lib/protocols.ts`。视频文件路径统一加上协议前缀存储。协议常量定义在 `@marchen/shared` 的 `constants/protocol.ts`。

### 视频播放器

- 播放器内核：字节跳动 `xgplayer` 的 fork 版本（`@suemor/xgplayer`）
- 弹幕渲染：`danmu.js`
- 字幕渲染：`@jellyfin/libass-wasm`（ASS/SSA 字幕支持）
- 自定义插件在 `src/renderer/src/components/ui/xgplayer/plugins/`

### UI 组件

- 基础组件基于 shadcn/ui（Radix UI），位于 `src/renderer/src/components/ui/`
- 使用 Tailwind CSS 4，主题为亮色和暗色（通过 next-themes 管理）
- 图标使用 Iconify（`@iconify-json/mingcute`），类名格式 `icon-[mingcute--xxx]`
- 动画使用 Framer Motion（LazyMotion 按需加载）
- 模态框使用 ModalStackProvider

### 路由

使用 React Router 7 的 HashRouter，路由定义在 `src/renderer/src/router/router.tsx`：

| 路径 | 页面 | 图标 |
|------|------|------|
| `/player` | 视频播放器 | `icon-[mingcute--video-camera-line]` |
| `/history` | 播放历史 | `icon-[mingcute--history-line]` |

侧边栏路由通过 `siderbarRoutes` 数组定义，包含 `meta`（icon、title）用于侧边栏渲染。默认重定向到 `/player`。

### Web 兼容

代码中通过 `isWeb`（`src/renderer/src/lib/utils.ts`）判断运行环境：
- `isWeb = !window.electron`
- `isMac = getOS() === 'macOS' && window.electron`
- `isWindows = getOS() === 'Windows' && window.electron`

Electron 专属功能（ipcClient、IpcListener 等）在 Web 环境下会被跳过。

### 错误监控

使用 Sentry（`@sentry/electron` + `@sentry/react`）进行错误追踪，DSN 通过 `VITE_SENTRY_DSN` 环境变量配置。

## 目录结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 入口，app 生命周期
│   ├── ipc/                 # IPC handler 定义（app, player, setting, utils）
│   ├── initialize/          # 初始化逻辑（IPC 注册、协议、菜单、日志）
│   ├── lib/                 # 工具库（ffmpeg, protocols, danmaku, mime, update）
│   ├── windows/             # 窗口管理（main, setting）
│   ├── modules/             # 功能模块（文件对话框等）
│   ├── constants/           # 常量
│   └── types/               # 类型定义
├── preload/                 # Electron 预加载脚本
└── renderer/src/            # React 前端（同时作为 Web 版本）
    ├── main.tsx             # React 入口
    ├── App.tsx              # 根组件（Layout + Sidebar + Outlet）
    ├── components/
    │   ├── ui/              # shadcn/ui 基础组件（29 个）
    │   ├── modules/         # 功能模块
    │   │   ├── player/      # 播放器模块（Context, loading, initialize, plugins）
    │   │   ├── settings/    # 设置模块（tabs, views, hooks, provider）
    │   │   ├── shared/      # 共享组件（MatchDanmakuDialog 等）
    │   │   └── app/         # 应用级组件（Prepare, WindowsTitlebar）
    │   ├── layout/          # 布局组件（root, sidebar）
    │   ├── icons/           # 图标组件
    │   └── common/          # 通用组件（ErrorView 等）
    ├── page/                # 页面
    │   ├── player/          # 播放器页面
    │   └── history/         # 历史记录页面
    ├── atoms/               # Jotai 状态（player, settings, progress, window）
    ├── hooks/               # 自定义 hooks
    ├── services/            # 服务层（player-loading adapter）
    ├── request/             # API 请求层（ofetch + api + models）
    ├── database/            # Dexie IndexedDB（schema, constants）
    ├── router/              # React Router 配置
    ├── providers/           # Provider 组合（Query, Jotai, Theme, Modal, IpcListener）
    ├── initialize/          # 初始化（dayjs, sentry, react-scan）
    └── lib/                 # 工具函数（client, query-client, danmaku, utils, env, dom, log）

packages/
├── electron-ipc/            # 类型安全 IPC 封装（defineGroup, handler, createEmitter/Listener）
├── shared/                  # 共享常量和类型（protocol, calc-file-hash, renderer-handlers）
└── player-core/             # 播放器加载核心（RxJS 状态机 + Pipeline）
```

## 路径别名

| 别名 | 路径 |
|------|------|
| `@renderer` | `src/renderer/src` |
| `@main` | `src/main` |
| `@pkg` | `package.json` |
| `@marchen/electron-ipc` | `packages/electron-ipc` |
| `@marchen/shared` | `packages/shared` |
| `@marchen/player-core` | `packages/player-core` |

## 代码风格

### 格式化（Prettier）

- 无分号（`semi: false`）
- 单引号（`singleQuote: true`）
- 行宽 100（`printWidth: 100`）
- 缩进 2 空格（`tabWidth: 2`）
- 尾逗号（`trailingComma: 'all'`）
- 使用 `prettier-plugin-tailwindcss` 自动排序 class

### Lint（ESLint）

- 基于 `@antfu/eslint-config`（含 React 支持）
- 启用 `react-hooks/rules-of-hooks`
- 禁止使用全局 `location`（因为 Electron 和浏览器路由实例不同，应使用 `useLocation` 或 `getReadonlyRoute`）
- `react-refresh/only-export-components` 为 warn 级别

### 通用规范

- 项目 UI 和注释均使用中文
- 支持的视频格式：mp4、mkv
- 文件 hash 用于唯一标识视频（16MB 前缀 MD5）

### 代码质量要求

- **注释**：积极编写注释，解释代码的意图、上下文和设计决策。对复杂逻辑、非显而易见的实现、业务规则、状态转换等都应添加注释。注释使用中文。
- **可读性**：优先考虑代码可读性，变量和函数命名要清晰表达意图，避免过度缩写。
- **类型安全**：充分利用 TypeScript 类型系统，避免 `any`，优先使用 discriminated union、泛型约束等模式。
- **错误处理**：对外部交互（API 请求、文件操作、IPC 调用）做好错误处理和降级策略，参考 player-core 中弹幕获取失败降级为无弹幕播放的模式。
- **关注点分离**：遵循项目已有的分层架构（Port 接口、Service、Pipeline、Adapter），新代码应保持同样的解耦程度。
- **响应式模式**：涉及异步流和状态管理时，优先使用 RxJS operator 组合，避免命令式嵌套回调。
- **平台兼容**：新增功能需考虑 Electron 和 Web 双端兼容，Electron 专属逻辑通过 `isWeb` 判断或可选链 `ipcClient?.` 隔离。
- **UI 预览**：开发 UI 相关功能时，善用 Chrome DevTools MCP 工具预览实际效果，确保视觉和交互符合预期后再提交。

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `VITE_API_URL` | 弹弹play API 代理地址 | `https://dandi-proxy.suemor.com/api/v2` |
| `VITE_SENTRY_DSN` | Sentry 错误追踪 DSN | - |
| `APPLE_ID` | macOS 公证 Apple ID | - |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS 公证应用专用密码 | - |
| `APPLE_TEAM_ID` | macOS 公证团队 ID | - |
| `APPLE_APP_BUNDLE_ID` | macOS 应用 Bundle ID | - |

## 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| electron | 41.2.1 | 桌面应用框架 |
| react | 19.x | UI 框架 |
| react-router | 7.x | 路由（HashRouter） |
| tailwindcss | 4.x | CSS 工具类 |
| @tanstack/react-query | 5.x | 数据请求缓存 |
| jotai | 2.x | 原子状态管理 |
| dexie | 4.x | IndexedDB 封装 |
| rxjs | 7.x | 响应式编程（player-core） |
| ofetch | - | HTTP 客户端 |
| @suemor/xgplayer | 3.x | 视频播放器（fork） |
| danmu.js | 1.x | 弹幕渲染 |
| @jellyfin/libass-wasm | 4.x | ASS 字幕渲染 |
| framer-motion | 12.x | 动画 |
| @sentry/electron | 10.x | 错误监控 |
| next-themes | - | 主题切换 |
