## 1. 升级前基线与版本冻结

- [x] 1.1 记录当前分支、工作区既有改动和依赖解析结果，明确排除 `.env.example`、`marchen/config.yaml`、`.agents/`、`.codex/`、`AGENTS.md` 等非本变更内容
- [x] 1.2 在旧依赖基线上运行 typecheck、player-core tests、Electron build、Web build，记录已有失败，避免把旧问题归因于升级
- [x] 1.3 按批次重新查询所有目标包的 latest / beta、engines、peerDependencies 和废弃状态，更新设计中的实施版本记录
- [x] 1.4 确认 Node 24、Electron 44 与 macOS 13 最低系统基线，并把不支持 macOS 12 作为已接受约束

## 2. 批次 A：Node 24、pnpm 11 与 CI

- [x] 2.1 将 `packageManager` 升级到实施时最新 pnpm 11，并新增或更新 Node 24 LTS 的项目版本声明
- [x] 2.2 将 build、deploy、release 等 GitHub workflows 的 Node 基线从 22.x 统一到 24.x
- [x] 2.3 使用目标 Node / pnpm 版本重新安装依赖并更新 lockfile，检查 lockfileVersion 与 workspace link 保持正确
- [x] 2.4 在 Node 24 / pnpm 11 下验证 lifecycle scripts、workspace 命令和干净环境 frozen-lockfile 安装
- [x] 2.5 运行批次 A gate，确认工具版本、CI 配置和锁文件可复现后再进入 Electron 升级

## 3. 批次 B：Electron 44 与桌面发布依赖

- [x] 3.1 将 Electron 升级到实施时最新 44.x，并同步 electron-builder、electron-updater、electron-log、notarize 与 Electron Toolkit 的最新兼容版本
- [x] 3.2 将 `@types/node` 对齐 Electron 44 / Node 24，并检查 Node、Web tsconfig 的 types / lib 边界
- [x] 3.3 审计 Electron 42–44 breaking changes涉及的 app、BrowserWindow、protocol、dialog、shell、nativeTheme、登录项和 IPC 调用，只做必要兼容迁移
- [x] 3.4 在打包配置和项目说明中明确 macOS 13 最低版本，核对 macOS x64/arm64、Windows 与 Linux 目标未被意外删改
- [x] 3.5 验证 FFmpeg/FFprobe asarUnpack、beforePack/afterPack/afterSign 脚本在 Electron 44 打包流程中的资源路径
- [x] 3.6 运行 typecheck:node 和 Electron production build，修复由 Electron 44 直接造成的类型或构建问题
- [x] 3.7 启动 Electron 实机验证主窗口、设置窗口、preload/IPC、自定义协议、文件选择、拖入视频和文件关联入口
- [x] 3.8 在当前平台生成 unpacked/安装产物并启动验证，完成批次 B gate

## 4. 批次 C：electron-vite 6 beta、Vite 8 与 TypeScript 7

- [x] 4.1 将 electron-vite 升级到实施时最新 6.x beta，并将 Vite、Vite React Plugin、TypeScript、静态复制插件升级到目标最新版
- [x] 4.2 核对目标版本的 engines 和 peerDependencies，确保不再保留 electron-vite 5 与 Vite 8 的未声明组合
- [x] 4.3 按 electron-vite 6 与 Vite 8 API 调整 Electron/Web 构建配置，保持 main、preload、renderer 入口和路径 alias
- [x] 4.4 按 TypeScript 7 迁移要求调整 node/web/workspace tsconfig 与受影响源码，不得用扩大 `any`、跳过检查或关闭严格规则消错
- [x] 4.5 验证 Electron 开发模式的 main/preload/renderer 编译、窗口加载和 HMR
- [x] 4.6 验证 Web 开发模式页面加载和 HMR
- [x] 4.7 运行完整 typecheck、Electron production build、Web production build，并检查构建产物入口与静态资源
- [x] 4.8 完成批次 C gate；若 beta 存在可复现问题，保留最小复现并检查更新 beta，不静默回退 electron-vite 5

## 5. 批次 D：现代 UI 基础栈

- [x] 5.1 将 React、React DOM 及类型包升级到实施时最新 19.x，确认满足 React Router 8 最低版本
- [x] 5.2 将 React Router 升级到最新 8.x，迁移 DOM 专属导入并保持现有 HashRouter/Data Router、默认重定向与 Web 路由过滤
- [x] 5.3 将 Framer Motion 升级到最新 13.x，适配类型/API 变化并保持 LazyMotion、页面过渡和 Modal Stack 交互
- [x] 5.4 将统一 `radix-ui` 包升级到最新版，验证现有基础组件封装、焦点管理、Portal 和 z-index token
- [x] 5.5 将 Tailwind CSS、`@tailwindcss/vite`、tailwind-merge、Prettier Tailwind 插件和相关样式依赖升级到最新版
- [x] 5.6 验证 `@theme`、shadcn token、dark class、Iconify utilities 和现有 bespoke CSS 均被正确生成
- [x] 5.7 运行 typecheck、Electron/Web build，修复仅由 UI 基础依赖升级造成的问题
- [x] 5.8 实机遍历播放器、影视库、设置、Dialog、Sheet、Popover、菜单和 Modal Stack，验证亮暗主题、导航、焦点、拖拽及进入/退出动画
- [x] 5.9 完成批次 D gate，确认现有 UI 行为稳定后再处理其余应用依赖

## 6. 批次 E：AI、测试、Lint 与其余依赖

- [x] 6.1 将 AI SDK 升级到最新 7.x，OpenAI/Anthropic Provider 升级到最新 4.x，并适配现有模型类型与客户端创建 API
- [x] 6.2 验证已有 OpenAI/Anthropic 配置可继续加载、切换、连接测试和创建模型，无有效配置时仍返回无模型状态
- [x] 6.3 将 player-core 的 Vitest 升级到最新 4.x，修复运行器兼容问题但不删除、跳过或弱化现有测试
- [x] 6.4 将 ESLint、Antfu 配置、eslint-react、lint-staged、Prettier 及相关插件升级到目标最新版，处理配置/API 变化
- [x] 6.5 将 React Query、Jotai、Dexie、Sentry、Zod、nanoid、OpenCC、图标/字体等其余直接依赖升级到实施时最新版并逐项检查变更面
- [x] 6.6 对 registry 标记 deprecated 或存在异常 peer 的包生成清单；保留 `fluent-ffmpeg` 现状并登记独立替换变更，不在本批次扩张媒体架构
- [x] 6.7 运行 player-core tests、lint、format check、typecheck、Electron build 和 Web build，完成批次 E gate

## 7. 最终运行与回归验收

- [x] 7.1 在干净依赖环境执行 frozen-lockfile 安装，确认 manifests、workspace packages 与 lockfile 一致且无未解释 peer 警告
- [x] 7.2 完成 Electron 和 Web 的实际启动、页面导航、主题、弹层、设置及错误边界验收
- [x] 7.3 在 Electron 中完成“导入视频 → 散列 → 匹配 → 加载弹幕 → 播放 → 保存进度 → 再次打开”核心路径
- [x] 7.4 使用 H.264、HEVC、AAC、EAC-3、ASS 和内嵌字幕样本执行媒体矩阵，对比升级前结果并区分既有不支持与新增回归
- [x] 7.5 验证 Electron 当前平台安装/解压产物可启动，必要资源存在，自定义协议和本地文件入口可用
- [x] 7.6 检查最终 diff，确认未覆盖或混入升级前已有工作区改动，自动格式化未扩散到无关文件
- [x] 7.7 记录最终实际版本矩阵、beta 版本、验收结果和遗留风险，确认可继续 `tailwind-unify-library-sidebar`
