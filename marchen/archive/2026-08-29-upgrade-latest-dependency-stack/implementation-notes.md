# 实施记录

## 升级前工作区边界

- 基线提交：`cf8331659cef3c21774fcf1d7e33f29a1a5702f6`（`main`，与 `origin/main` 对齐）
- 本地运行时：Node `v22.22.3`、pnpm `10.11.0`
- 已有且不属于本变更的改动：
  - 删除：`.env.example`
  - 修改：`marchen/config.yaml`
  - 未跟踪：`.agents/`、`.codex/`、`AGENTS.md`
- 本变更不得恢复、删除、格式化或提交上述既有内容。

## 升级前核心依赖解析

| 依赖              | 实际解析版本 |
| ----------------- | -----------: |
| Electron          |       41.5.0 |
| electron-vite     |        5.0.0 |
| Vite              |       8.0.11 |
| TypeScript        |        6.0.3 |
| React / React DOM |       19.2.6 |
| React Router      |       7.15.0 |
| Framer Motion     |      12.38.0 |
| Radix UI          |        1.4.3 |
| Tailwind CSS      |        4.2.4 |
| AI SDK            |      6.0.175 |

## 验收记录

### 旧依赖基线

- `pnpm typecheck`：通过。
- `pnpm --filter @marchen/player-core test`：通过，3 个文件、16 个测试；弹幕服务失败用例按预期输出降级日志。
- `pnpm build`：通过，Electron main/preload/renderer 均生成产物。
- `pnpm build:web`：通过；已有大 chunk 警告，且 Vite 提示 outDir 在 project root 外，但未导致失败。

后续任务按批次继续追加结果。

### 实施版本冻结（2026-08-29）

- 正式版目标：Node 24.20.0 LTS、pnpm 11.24.0、Electron 44.0.0、Vite 8.2.2、Vite React Plugin 6.1.1、TypeScript 7.0.2、React 19.2.8、React Router 8.3.1、Motion 13.1.1、Radix UI 1.6.7、Tailwind 4.3.3、AI SDK 7.0.84、Vitest 4.1.11。
- 预发布目标：`electron-vite@6.0.0-beta.1`；engine 为 Node 20.19+ 或 22.12+，peer 支持 Vite 6/7/8。
- pnpm 11.24.0 要求 Node 22.13+；目标 Node 24 满足。
- 已确认 deprecated：`fluent-ffmpeg@2.1.3`，本变更不替换。
- Node 官方将 24.x 标记为 LTS；Electron 44 内置 Node 24.18.1。
- Electron 44 仅发布 64 位 x64/arm64 目标，并要求 macOS 13 Ventura 或更高版本；项目接受该最低系统变化。

### 批次 A：安装与配置迁移

- 已安装本地隔离的 Node 24.20.0，并通过 Corepack 使用 pnpm 11.24.0。
- pnpm 11 已移除 `onlyBuiltDependencies`，workspace 配置迁移为显式 `allowBuilds`；`electron-winstaller` 明确禁止运行依赖脚本，其余沿用旧 allowlist 语义。
- pnpm 11 对旧锁文件的 `semver@5/6` 和旧 Tailwind Prettier 插件触发已知 trust downgrade 误判；基线重建仅临时使用 `trustLockfile=true`，项目的 `trustPolicy: no-downgrade` 保持不变，最终新锁仍需通过原策略。
- pnpm 11 安装成功；lockfileVersion 保持 `9.0`，workspace 包仍解析为本地 link。
- `simple-git-hooks` 因当前执行环境无法 chmod `.git/hooks/pre-commit` 输出非致命错误；依赖安装本身成功，后续工具链升级后复核。
- 为保证 pnpm 11 的普通 workspace 命令可运行，已对三个核实过的旧锁版本增加精确 `trustPolicyExclude`；安全策略本身仍为 `no-downgrade`，frozen 安装显示 1097 个条目通过策略校验。
- workspace 命令在 Node 24.20.0 下覆盖根项目及三个 workspace 包并成功执行。
- `shamefully-hoist` 已从 pnpm 11 不再读取的 `.npmrc` 迁到 workspace 配置；内部复合 scripts 改用 pnpm 调用，Node 24 下完整 typecheck 通过。
- 批次 A gate：Node 24.20.0、pnpm 11.24.0、三条 CI workflow 24.x、frozen install、supply-chain policy 和 typecheck 均通过。

### 批次 B：Electron 44

- Electron 44.0.0、electron-builder 26.15.3、electron-updater 6.8.9、electron-log 5.4.4 已安装；notarize 与 Electron Toolkit 已是最新版。
- 内部 `@marchen/electron-ipc` peer 下限同步到 Electron 44，workspace 依赖图只剩一个 Electron 44.0.0。
- 当前唯一 peer 告警为 electron-vite 5 不声明支持 Vite 8，按批次 C 解决。
- `@types/node` 已对齐 24.13.3；Node tsconfig 使用 `electron-vite/node`，Web 入口由 `vite/client` 提供环境类型。Electron 44 类型检查发现 `websql` 已从 storage data 类型移除，归入下一项 breaking change 迁移。
- Electron 42–44 API 审计仅命中 `Session.clearStorageData` 的 `websql` 移除，已删除两个重复项；项目未使用 quotas、Electron Notification、offscreen、clipboard、openAsHidden、net.request frame headers、Unity API 或 32 位目标。
- FFmpeg/FFprobe 当前 arm64 二进制存在且可执行，四个 pack/sign 脚本均通过 Node 24 语法检查；asar unpack 后路径由现有 `app.asar` → `app.asar.unpacked` 逻辑解析，实际产物在任务 3.8 再确认。
- Electron 44 下 `typecheck:node`、完整 typecheck 和 Electron main/preload/renderer production build 通过。
- 为适配 Electron 42 起不再在包安装阶段自动下载二进制的变化，根项目 `postinstall` 已显式执行 `install-electron`，随后再运行 electron-builder 原生依赖安装。
- Electron 44 使用独立临时 userData 和 9333 CDP 端口启动成功，未中断已有 Electron 41 开发实例。实机验证覆盖：主窗口 `#/player`、设置 Dialog、`window.electron`/`window.api` preload 暴露、`setting:getWindowIsFullScreen` IPC、`marchen://` 视频 metadata 加载，以及通过真实文件输入触发“视频导入 → 计算哈希 → 匹配动漫 → 获取弹幕”流水线。
- 文件关联入口继续由 macOS/Windows 的 mp4、mkv builder 配置与 main 进程 `open-file`/second-instance 路径提供；本批次未修改其注册范围。
- 当前 arm64 平台成功生成 `dist/mac-arm64/Marchen.app`；Info.plist 的最低系统为 13.0.0，mp4/mkv 文件关联存在，asar.unpacked 中 arm64 FFmpeg/FFprobe 均存在且可执行。
- 本机钥匙串只暴露一个没有 Team ID 的非 Apple 测试签名证书，electron-builder 自动选中后虽能通过 `codesign --verify --deep`，但会被 macOS Library Validation 拒绝启动。使用标准 `CSC_IDENTITY_AUTO_DISCOVERY=false` 重新生成本地验收包后，应用从 app.asar 正常加载 `#/player`，preload 与 IPC 可用；正式发布签名仍由 CI 的 Developer ID 与公证凭据负责。
- unpacked 包不生成 `app-update.yml`，新版 updater 会返回拒绝 Promise。启动初始化现已先注册监听和设置选项，再显式等待并消费该拒绝，避免主进程出现未处理 Promise；错误仍由 updater 的 error 事件记录。
- electron-builder 对 pnpm 的跨平台 FFmpeg/FFprobe 可选包给出提示；当前平台必需二进制已验证，其他 OS/架构只能在对应 CI runner 上做最终发布验收。
- 批次 B gate：Electron 44 类型检查、production build、独立运行时、unpacked 产物启动、当前平台资源与文件关联均通过。

### 批次 C：electron-vite 6 beta、Vite 8 与 TypeScript 7

- 批次开始重新查询 registry：electron-vite 6.0.0-beta.1、Vite 8.2.2、React Plugin 6.1.1、TypeScript 7.0.2、vite-plugin-static-copy 4.1.1 仍为目标发布线最新版本。
- electron-vite beta 的 peer 明确覆盖 Vite 6/7/8，Vite、React Plugin 和静态复制插件的 Node/peer 条件均由 Node 24 + Vite 8 满足；electron-vite 5 与 Vite 8 的未声明组合已消除。
- `pnpm peers check` 当前仅剩 TypeScript ESLint 8 对 TS 7 的上限告警，属于批次 E 的 Lint 工具链迁移，不是 electron-vite/Vite 构建组合告警。
- Electron/Web 构建配置无需 API 级改写；electron-vite 6 + Vite 8.2.2 已保持 main、preload、renderer 入口、alias、Tailwind 插件及 libass worker 静态复制。
- TypeScript 7 移除了 `baseUrl`。node/web tsconfig 已删除该选项，并把 paths 目标改为显式 `./` 相对路径；严格检查保持开启，没有新增 any 或跳过检查。
- TypeScript 7 完整 typecheck 通过；Electron 与 Web production build 均通过。Rolldown 新增提示 `db.ts` 同时静态/动态导入，Web 仍保留既有大 chunk 与 outDir 提示，均不影响产物生成。
- Electron 开发态使用 6.x beta 的 watch 模式实测：main 改动完成重编译并重启应用，preload 改动完成重编译并刷新 Renderer，Renderer CSS 探针通过 HMR 即时生效；所有临时探针已回退。
- 为兼容并行开发与自动化验收，远程调试默认仍为 9222，但会尊重 electron-vite CLI 已传入的端口；新增 `MARCHEN_ALLOW_MULTIPLE_INSTANCES=1` 仅在 development 环境显式启用多实例，生产单实例行为不变。
- Web 开发服务器在 1106 启动成功，独立 headless Chrome 加载后自动落到 `#/player`，确认 `window.electron` 不存在且 CSS HMR 探针即时生效；临时探针已回退。
- 已核对 Electron main/preload/renderer、Web index 与两端 libass worker wasm 产物存在，`git diff --check` 通过。
- 批次 C gate：beta 未出现可复现阻塞，无需回退；完整 typecheck、双端 dev/HMR、双端 production build 和产物检查通过。

### 批次 D：现代 UI 基础栈

- 批次开始通过 registry/outdated 重新核对版本，升级为 React/React DOM 19.2.8、React 类型 19.2.18/19.2.5、React Router 8.3.1、Framer Motion 13.1.1、Radix UI 1.6.7、Tailwind CSS/Vite Plugin 4.3.3、tailwind-merge 3.6.0、Prettier Tailwind 插件 0.8.1。
- React Router 8 要求 Node 22.22+ 与 React 19.2.7+，当前基线满足。按官方 v8 迁移要求，DOM 专属 `RouterProvider` 已改从 `react-router/dom` 导入；Hash Data Router、默认重定向与 Web 路由过滤结构不变。
- React Router 8.3.1 发布不足 pnpm 的默认等待窗口；因用户明确选择“最新优先”，pnpm 自动生成了精确 `minimumReleaseAgeExclude`，仅允许这一已核实版本。
- Motion 13 与 Radix 1.6 无需源码 API 迁移即可通过严格类型和双端构建，既有 LazyMotion、AnimatePresence、Modal Stack 与统一组件封装保持。
- Electron/Web 产物 CSS 均确认包含 `--color-background`、`.dark`、`--z-dialog` 和 Iconify `icon-[mingcute...]` 规则；`@theme`、shadcn token、暗色变体与 bespoke CSS 均成功生成。
- UI 基础栈升级后的完整 typecheck、Electron build 与 Web build 通过；运行时交互在任务 5.8 继续验收。
- Electron 实机确认播放器/影视库导航及激活态同步；系统、白天、夜间主题可切换，夜间切换后 html class 为 `dark` 且焦点落在对应 Radix Tab。
- 设置 Modal Stack 与新增 AI Provider Dialog 可嵌套打开，实测 z-index 分别为 101/200；Provider Select listbox 和模型 Popover 均在 250 层，打开后焦点分别落在选项与搜索输入框。
- 使用真实已匹配动画样本完成导入、散列、匹配、5943 条弹幕加载并进入播放（video readyState 4）；播放器设置 Sheet、弹幕来源 Popover、Accordion 与字幕设置均可打开。
- Sheet 退出时观察到 150–300ms 的运行中动画，完成后 Dialog 移除而视频继续存在；设置 Modal 拖动后位移矩阵为 `(80, 45)`，焦点与拖拽交互正常。
- DropdownMenu/ContextMenu 目前只有基础封装、没有业务消费者或可触发入口；它们已被类型与构建覆盖，但本批次没有虚构运行入口。Select/Popover 的同类 Portal、菜单项、焦点和层级已通过真实交互验证。
- 批次 D gate：UI 基础栈 typecheck、双端 build、Electron 关键页面与弹层交互通过，可进入其余应用依赖升级。

### 批次 E：AI、测试、Lint 与其余依赖

- AI SDK 已升级为 7.0.84，OpenAI/Anthropic Provider 分别为 4.0.51/4.0.45；客户端创建入口保持原有 provider 选择语义，并补充 apiKey、baseUrl、model 的 trim 后有效性检查，无完整有效配置时明确返回 null。
- AI Provider 设置 Dialog、provider 切换、模型选择和连接测试入口已在 Electron 运行时打开验证；本地没有写入或输出真实密钥，因此未向外部模型服务发出带凭据请求。
- Vitest 4.1.11 下 player-core 的 3 个测试文件、16 个测试全部通过；新增包级 `type: module` 后不再出现旧 CommonJS 配置兼容提示，没有删除、跳过或放宽测试。
- ESLint 10.9.1、Antfu 配置 9.3.0、eslint-react 5.18.6、lint-staged 17.4.1、Prettier 3.9.6 已升级。最新 TypeScript ESLint 仍依赖 TypeScript 6 的 JS API，而 TypeScript 7 原生编译器不再提供该 API，因此按 TypeScript 官方并行迁移方案：项目 `tsc` 使用 `@typescript/native` 7.0.2，Lint/生态 API 使用 `@typescript/typescript6` 6.0.3 别名；实际类型门禁仍由 TypeScript 7 执行。
- `pnpm lint` 退出码为 0；最新 React 规则暴露 89 条既有 warning，均已登记但不在纯依赖升级中批量改变组件行为。升级涉及文件的 Prettier check 通过。
- React Query、Jotai、Dexie、Sentry、nanoid、OpenCC、图标和字体等直接依赖已更新到批次冻结时最新版；Zod 原先已在最新版，无需改动。
- `react-scan@0.5.7` 的新传递依赖在 pnpm `no-downgrade` 信任策略下无法证明发布者连续性，故精确保留 0.5.6，没有放宽供应链门禁；`@types/node` 保留 24.13.3 以匹配 Node 24/Electron 44，而不是追随 Node 26 类型。
- registry 仍标记 `fluent-ffmpeg@2.1.3` deprecated，本变更按设计保留并登记后续替换；最终 `pnpm peers check` 无 peer dependency issues。
- 批次 E gate：TypeScript 7 双端 typecheck、Vitest 16/16、ESLint、目标文件 format check、Electron production build、Web production build全部通过。保留的构建提示仍是既有 db 动静态混用、Web outDir 和大 chunk 警告。

### 最终运行与回归验收

- 在全新 `/tmp` 目录、不复用项目 `node_modules` 的条件下执行 pnpm 11.24.0 frozen-lockfile 安装成功：997 个包由锁文件复现，锁文件通过 `no-downgrade` 供应链策略，postinstall 的 Electron 下载和原生依赖检查成功。临时目录不是 Git 仓库，因此 simple-git-hooks 输出跳过提示，不影响安装结果。
- Electron production build 使用独立 userData 实机启动，确认 `#/player`、`#/library` 导航、preload/API 暴露、设置 Modal、暗色主题物理点击与焦点状态；Web dev server 在 1106 启动，确认 `window.electron` 不存在且 Electron 专属影视库路由被过滤。
- 核心路径使用真实可匹配动画样本完成：导入、16 MiB 前缀散列、节目匹配、5943 条弹幕加载、readyState 4 播放。把播放位置推进到 42 秒后，IndexedDB 保存进度 43.78 秒；页面重载并再次导入同一文件后从保存位置继续播放，进度恢复链路通过。
- 媒体矩阵实测：H.264/AAC 与 HEVC/AAC 均可播放，HEVC 的 Media Inspector 明确为 `VideoToolboxVideoDecoder` 且 platform decoder=true；这仍是 HTML5 的硬解路径。H.264/EAC-3 样本画面可播放，但 Chromium 报 `unsupported audio decoder configuration` 并跳过音轨，属于既有 EAC-3 不支持限制，不是升级回归。
- MKV 内嵌字幕枚举出 11 条字幕轨，默认简体中文字幕成功抽取为 ASS；运行时存在 2800×1574 的 `libassjs-canvas`。外部 ASS 经 IPC 路径校验后设为当前字幕，设置面板显示对应条目且同一 libass canvas 保持加载。
- 当前 arm64 最终 unpacked 包重新生成并启动成功；应用从 `app.asar` 加载，preload/API 可用，`marchen://` 本地 H.264 文件 readyState 4 并实际播放。Info.plist 最低系统为 13.0.0，mp4/mkv 文件关联存在，asar.unpacked 中 FFmpeg/FFprobe 存在且可执行。
- unpacked 包没有发布阶段才生成的 `app-update.yml`，updater 错误被监听并消费，未造成未处理 Promise 或应用退出。启动还会输出上游 `fs.Stats` deprecation warning，登记为依赖侧遗留。
- 最终 diff/check 与目标文件 Prettier check 通过。升级前既有的 `.env.example` 删除、`marchen/config.yaml` 修改及 `.agents/`、`.codex/`、`AGENTS.md` 未跟踪内容仍保持原状，本变更未编辑或格式化它们；构建产物未进入 Git diff。

### 最终版本矩阵与遗留风险

| 分类       | 最终版本                                                                     |
| ---------- | ---------------------------------------------------------------------------- |
| Runtime    | Node 24.20.0、pnpm 11.24.0、Electron 44.0.0                                  |
| Build      | electron-vite 6.0.0-beta.1、Vite 8.2.2、React Plugin 6.1.1                   |
| TypeScript | native compiler 7.0.2；生态 JS API 6.0.3                                     |
| UI         | React 19.2.8、React Router 8.3.1、Motion 13.1.1、Radix 1.6.7、Tailwind 4.3.3 |
| AI         | AI SDK 7.0.84、OpenAI 4.0.51、Anthropic 4.0.45                               |
| Quality    | Vitest 4.1.11、ESLint 10.9.1、Prettier 3.9.6                                 |

- 预发布风险仅剩 electron-vite 6.0.0-beta.1，已通过 dev/HMR、production build 和实际启动，但后续 beta/正式版发布时仍应单独复核。
- `react-scan` 保留 0.5.6，待 0.5.7 的传递依赖满足信任策略后再升；`fluent-ffmpeg` deprecated，继续作为独立媒体架构变更处理。
- macOS x64、Windows、Linux 的 FFmpeg 平台包只能在对应 CI runner 做最终发布验收；当前 arm64 结果不能替代跨平台签名、安装和文件关联验证。
- 最新 Lint 将 89 个既有 React 结构问题提升为 warning；当前门禁无 error，但建议在 UI 重构中按组件边界逐步处理，不在依赖升级中批量改行为。
- 依赖升级 gate 已完成，可以继续 `tailwind-unify-library-sidebar`。
