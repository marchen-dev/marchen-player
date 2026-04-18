# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Marchen Player 是一个本地动漫视频弹幕播放器，拖入动漫视频即可自动匹配弹幕。基于 Electron + React 构建，同时支持 Web 版本。后端 API 代理弹弹play 的接口。

## 常用命令

```bash
pnpm dev          # 启动 Electron 开发服务器（含 HMR）
pnpm dev:web      # 启动 Web 开发服务器（端口 1106）
pnpm build        # 构建 Electron 应用（含 typecheck）
pnpm build:web    # 构建 Web 版本
pnpm build:mac    # 构建 macOS 安装包
pnpm build:win    # 构建 Windows 安装包
pnpm typecheck    # TypeScript 类型检查（node + web 两套配置）
pnpm lint         # ESLint 检查
pnpm lint:fix     # ESLint 自动修复
pnpm format       # Prettier 格式化
```

环境准备：需要先 `cp .env.example .env`，包管理器使用 pnpm（`corepack enable` 启用）。

## 架构

### 双进程 + 双构建目标

项目是标准的 Electron 三层架构，同时支持纯 Web 构建：

- **Main 进程** (`src/main/`)：Electron 主进程，负责窗口管理、文件系统操作、FFmpeg 调用、自定义协议处理
- **Preload** (`src/preload/`)：Electron 预加载脚本，桥接 main 和 renderer
- **Renderer** (`src/renderer/src/`)：React 前端应用，同时作为 Web 版本的代码

构建工具：

- Electron 构建使用 `electron-vite`（配置在 `electron.vite.config.ts`）
- Web 构建使用 `vite`（配置在 `vite.config.ts`）
- 两套 tsconfig：`tsconfig.node.json`（main 进程）和 `tsconfig.web.json`（renderer）

### 主进程与渲染进程通信（TIPC）

使用 `@egoist/tipc` 实现类型安全的 IPC 通信，类似 tRPC 的模式：

- **定义端**：`src/main/tipc/` 下按模块定义路由（app、player、setting、utils）
- **调用端**：`src/renderer/src/lib/client.ts` 创建 tipcClient，渲染进程通过 `tipcClient?.xxx()` 调用
- Web 环境下 `tipcClient` 为 null，需要用 `tipcClient?.` 可选链调用

### 状态管理

- **Jotai**：全局原子状态，定义在 `src/renderer/src/atoms/`，使用自定义 store（`jotaiStore`）
- **TanStack Query**：服务端数据请求与缓存
- **Dexie (IndexedDB)**：本地持久化存储（播放记录等），schema 在 `src/renderer/src/database/`

### API 请求

- HTTP 客户端基于 `ofetch`，封装在 `src/renderer/src/request/ofetch.ts`
- API 模块在 `src/renderer/src/request/api/`，对应弹弹play 的接口（match、comment、bangumi、search、related）
- 类型定义在 `src/renderer/src/request/models/`
- 基础 URL 通过 `VITE_API_URL` 环境变量配置

### 自定义协议

Electron 端使用 `marchen://` 协议处理本地文件访问，相关逻辑在 `src/main/lib/protocols.ts`。视频文件路径统一加上协议前缀存储。

### 视频播放器

使用字节跳动的 `xgplayer` 作为视频播放器内核（fork 版本 `@suemor/xgplayer`），自定义插件在 `src/renderer/src/components/ui/xgplayer/plugins/`。弹幕渲染使用 `danmu.js`，字幕渲染使用 `@jellyfin/libass-wasm`。

### UI 组件

- 基础组件基于 shadcn/ui（Radix UI），位于 `src/renderer/src/components/ui/`
- 使用 Tailwind CSS + DaisyUI，主题为 `cmyk`（亮色）和 `dark`（暗色）
- 图标使用 Iconify（`@iconify-json/mingcute`），类名格式 `icon-[mingcute--xxx]`
- 动画使用 Framer Motion

### 路由

使用 React Router 的 HashRouter，路由定义在 `src/renderer/src/router/router.tsx`。侧边栏路由通过 `siderbarRoutes` 数组定义，包含 `meta`（icon、title）用于侧边栏渲染。

### Web 兼容

代码中通过 `isWeb`（`src/renderer/src/lib/utils.ts`）判断运行环境。Electron 专属功能（tipcClient、TipcListener 等）在 Web 环境下会被跳过。

## 路线图

项目路线图和变更历史见 [marchen/roadmap.md](./marchen/roadmap.md)，调研笔记和外部参考见 [marchen/references/](./marchen/references/)。

## 路径别名

- `@renderer` → `src/renderer/src`
- `@main` → `src/main`
- `@pkg` → `package.json`

## 项目语言

项目 UI 和注释均使用中文。
