## 背景

Marchen 当前使用 Electron 41、Node 22 / pnpm 10、React 19、Vite 8、TypeScript 6、Tailwind 4 和统一的 `radix-ui` 包。影视库、Sidebar、AppHeader、DetailOverlay 与 player-core 已经历连续重构，后续 UI 工作应建立在稳定且明确受支持的依赖组合上。

当前最明显的不一致是：项目安装了 Vite 8 和只面向 Vite 8 的 React Plugin 6，但稳定版 `electron-vite@5` 的 peer 范围只声明到 Vite 7。`electron-vite@6.0.0-beta.1` 已明确声明支持 Vite 8，用户选择“最新优先”，因此本设计接受该 beta，并用独立批次和完整双端验收控制风险。

本变更创建时查询到的目标矩阵如下；实施每个批次前仍需重新查询 registry，补丁/次版本出现更新时按 `latest-version-policy` 采用新的最新版本。

> 实施冻结检查（2026-08-29）：下表核心目标仍为 registry 最新版本；`electron-vite@6.0.0-beta.1` 为 beta tag，peer 明确覆盖 Vite 8。唯一已确认的 deprecated 直接依赖为 `fluent-ffmpeg@2.1.3`。

| 分组                        |                    当前基线 |                 创建时目标 |
| --------------------------- | --------------------------: | -------------------------: |
| Node / pnpm                 | Node 22.22.3 / pnpm 10.11.0 | Node 24 LTS / pnpm 11.24.0 |
| Electron                    |                      41.5.0 |                     44.0.0 |
| electron-vite               |                       5.0.0 |               6.0.0-beta.1 |
| Vite / React Plugin         |              8.0.11 / 6.0.1 |              8.2.2 / 6.1.1 |
| TypeScript                  |                       6.0.3 |                      7.0.2 |
| React / React DOM           |                      19.2.6 |                     19.2.8 |
| React Router                |                      7.15.0 |                      8.3.1 |
| Framer Motion               |                     12.38.0 |                     13.1.1 |
| Radix UI                    |                       1.4.3 |                      1.6.7 |
| Tailwind CSS / Vite Plugin  |                       4.2.4 |                      4.3.3 |
| AI SDK / OpenAI / Anthropic |   6.0.175 / 3.0.62 / 3.0.75 |   7.0.84 / 4.0.51 / 4.0.45 |
| Vitest                      |                       3.2.4 |                     4.1.11 |

## 目标与非目标

**目标：**

- 用最新可用版本建立后续 UI 重构的统一基线，不保留已发现的 peer 范围不一致。
- 让本地开发、CI、Electron 主进程/preload、Renderer 和 Web 构建共享可解释的运行与类型版本。
- 将大版本迁移拆成可单独验证和回退的批次，失败能定位到具体依赖组。
- 保持播放器、弹幕、影视库、设置、AI Provider、IPC、协议、数据库和主题切换的现有可观察行为。
- 在依赖升级完成后，为 `tailwind-unify-library-sidebar` 和后续播放器 UI 重构提供干净基线。

**非目标：**

- 不重新设计任何页面，不趁依赖升级改布局、配色、交互或信息架构。
- 不替换 xgplayer、danmu.js、libass-wasm 或 player-core 架构。
- 不把 Electron 升级解释为新增 HEVC 软件解码或 EAC-3 支持。
- 不实施 mpv/libmpv/VLC/GStreamer，也不增加 FFmpeg 音视频转码播放链路。
- 不在本变更替换 `fluent-ffmpeg`；仅记录其废弃状态和后续迁移边界。
- 不修改弹弹play接口契约、数据库 schema 或已有持久化配置格式。

## 决策

### 1. 最新优先按“目标版本最新、实施过程分批”执行

“最新优先”不等于一次性运行全量 latest 更新。版本选择遵循：

1. 每批开始时重新查询最新版本及 engines / peerDependencies。
2. 正式版依赖选择最新正式版。
3. `electron-vite` 明确选择 `6.0.0-beta.1` 或实施时更新的同线 beta，因为只有 6.x 声明支持 Vite 8。
4. `pnpm-lock.yaml` 固化实际解析结果，禁止使用不受约束的动态版本。
5. 如果新版本在实施期间发布，只在尚未验收的批次内追新；已通过的批次不反复滚动，避免永不收敛。

### 2. 升级按依赖方向拆成五个批次

```text
批次 A  Node 24 + pnpm 11 + CI
           │
           ▼
批次 B  Electron 44 + 打包/更新依赖
           │
           ▼
批次 C  electron-vite 6 beta + Vite 8 + TS 7
           │
           ▼
批次 D  React/Router/Motion/Radix/Tailwind
           │
           ▼
批次 E  AI SDK/Vitest/ESLint/其余直接依赖
```

每批只处理由该组版本升级直接造成的兼容修改，并在批次结束运行适用的 gate。这样 Electron API 变化不会和 Router/Motion 迁移混在同一故障窗口中。

### 3. Node 类型跟随实际运行边界

CI 和开发工具升级到 Node 24 LTS；Electron 44 内置 Node 24，因此根级 `@types/node` 对齐 Node 24，而不是追到与实际运行时不对应的 25/26。workspace 中如有不同运行边界，优先通过 tsconfig `types` / `lib` 限定，而不是用一个更高版本类型掩盖差异。

### 4. Electron 44 接受平台基线变化，但不扩张产品能力

Electron 44 将最低 macOS 提升到 13，项目打包与说明需要同步该约束。迁移重点核对：

- 主窗口、设置窗口和生命周期；
- preload/contextBridge 与实现优先 IPC 包；
- `marchen://` 自定义协议、本地文件引用和文件关联；
- 登录项、菜单、dialog、shell、nativeTheme；
- asarUnpack 中的 FFmpeg/FFprobe 与 macOS x64/arm64 产物；
- updater 和签名/公证脚本接口。

项目未使用 Electron 44 变化较大的 clipboard API，因此不为其引入无关改造。

### 5. 构建链采用 electron-vite beta，但将风险局限在配置与构建层

不回退 Vite 7，也不保留 `electron-vite@5 + Vite 8` 的未声明组合。`electron-vite@6` beta 与 Vite 8、React Plugin 6、TypeScript 7 作为一个原子批次升级。

该批次必须同时验证：

- Electron 主进程、preload、renderer 三入口开发构建；
- Electron HMR 和 Web HMR；
- Electron production build 与 Web production build；
- alias、workspace 源码引用、静态资源复制和 Tailwind Vite 插件；
- 构建产物中 main/preload/renderer 入口及资源路径。

beta 失败时先提供最小复现并检查更新的 6.x 预发布版本；不得静默回到 electron-vite 5。确需回退需要重新确认版本策略。

### 6. UI major 在重设计前迁完，只做兼容性修改

- React / React DOM 先满足 Router 8 的最低版本，再升级 Router。
- Router 保持当前 Data Router + HashRouter 结构；DOM 专属入口按 v8 导出位置迁移，不转成 Framework Mode。
- Motion 13 保持 `LazyMotion`、`m`、`AnimatePresence` 和 Modal Stack 现有交互，不趁机重写动画系统。
- Radix 继续使用统一 `radix-ui` 包和现有 z-index token，不回到分散包。
- Tailwind、Vite 插件、merge 与 Prettier 插件作为同组升级，保持 `@theme`、dark class 和 shadcn token 结果。

该决策避免后续 `tailwind-unify-library-sidebar` 一边迁样式、一边适配新的 Tailwind/React/Router/Motion 行为。

### 7. 应用依赖与测试工具最后升级

AI SDK 7 和 Provider 4 只适配现有 Provider 工厂及连接/模型语义，不新增 AI 功能。Vitest 4 以现有 player-core 三组测试全数通过为门槛；禁止删测试或弱化断言。ESLint、Antfu 配置、eslint-react、lint-staged、Prettier 等工具链在同批修复规则/API 变化，但格式化改动应与语义迁移分开审阅。

常规数据和工具依赖采用最新版本；对体积或 API 跨度较大的包，即使 semver major 未变化，也按实际变更面单独检查。

### 8. 验收使用逐批 gate + 最终运行矩阵

逐批 gate：

| 批次 | 最低 gate                                                                    |
| ---- | ---------------------------------------------------------------------------- |
| A    | 干净安装、Node/pnpm 版本、CI 配置一致、锁文件可复现                          |
| B    | typecheck:node、Electron 启动、窗口/IPC/协议、production build、目标平台打包 |
| C    | typecheck 全量、Electron/Web dev、Electron/Web production build、HMR         |
| D    | 双端导航、亮暗主题、Radix 弹层、Modal Stack、Motion 页面/播放器动画          |
| E    | player-core tests、AI Provider 配置/连接、lint、format check、完整构建       |

最终媒体矩阵记录 H.264、HEVC、AAC、EAC-3、ASS 和内嵌字幕在升级前后的结果。矩阵用于发现回归，不要求本变更新增浏览器原本缺失的解码能力。

### 9. 保护工作区既有改动

实施前记录并隔离当前工作区已有的 `.env.example` 删除、`marchen/config.yaml` 修改以及未跟踪的 `.agents/`、`.codex/`、`AGENTS.md`。这些内容不属于依赖升级，不得被恢复、删除或混入依赖提交。所有自动格式化仅作用于本变更明确触达的文件。

## 风险与权衡

| 风险                                   | 影响                                           | 缓解                                                              |
| -------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| electron-vite 6 仍为 beta              | Electron dev/build/HMR 可能出现预发布回归      | 构建链原子批次、双端 dev/build/HMR gate、失败保留最小复现         |
| Electron 44 刚发布且最低 macOS 变为 13 | 旧系统无法运行，窗口/协议/打包可能出现行为差异 | 明确平台基线、单独 Electron 批次、真实产物验证                    |
| TypeScript 7 与 ESLint/类型包同步升级  | 大量类型或规则噪声掩盖真实问题                 | TS 与构建链同批、Lint 放末批、禁止用 `any`/跳过检查消错           |
| Router/Motion major 影响导航和弹层     | UI 可编译但运行时动画、焦点或卸载行为异常      | 按关键交互逐项实机验证，不只依赖 build                            |
| pnpm 11 重算 lockfile                  | 大范围 lock diff 难以审阅                      | 先固定工具版本，使用 frozen lock 验证，manifest 与 lock diff 对照 |
| 一段时间内 registry 继续发布新版本     | “最新”目标持续漂移                             | 只在批次开始追新，批次验收后冻结                                  |
| `fluent-ffmpeg` 已废弃                 | 依赖健康度仍有已知缺口                         | 明确登记后续替换，不在本次无边界扩张媒体架构                      |
| 当前 UI 缺乏自动化回归测试             | 视觉或交互问题可能通过静态 gate                | 使用 Electron/Web 实机验收，后续 UI 重构补充验收基线              |

选择预发布构建工具换取 Vite 8 的最新组合，意味着接受更高的构建风险；通过批次隔离和运行证据控制风险，而不是以版本回退规避。选择不在本次替换播放器或 FFmpeg 封装，会保留已知技术债，但能确保依赖升级仍是可收敛的前置工作。
