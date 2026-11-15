# AGENTS.md

本文档为 AI 编码助手（Codex、Claude Code 等）提供本仓库的工作指引。

## 项目概述

Marchen Player：本地动漫视频弹幕播放器，拖入视频自动匹配弹幕。Electron + React，同时支持 Web。后端 API 代理弹弹play。

- **技术栈**：Electron 44 + React 19 + TypeScript + Vite + Tailwind 4
- **运行环境**：Node.js 24.x
- **包管理**：pnpm 11（`corepack enable`），ES Module，AGPL-3.0

## 常用命令

```bash
pnpm dev                 # Electron 开发（HMR）
pnpm dev:web             # Web 开发（端口 1106）
pnpm build               # 构建 Electron（含 typecheck）
pnpm build:web           # 构建 Web
pnpm build:web:release   # Web 正式构建（EdgeOne）
pnpm typecheck           # 类型检查（node + web）
pnpm test:main           # 主进程与桌面发布相关测试
pnpm test:player-runtime # 播放运行时及相关服务测试
pnpm lint[:fix]          # ESLint
pnpm format              # Prettier
```

首次需 `cp .env.example .env`。

`pnpm bump` 会交互选择版本、提交、打标签并推送，不是只修改版本号；执行前按 `docs/desktop-release.md` 完成发版准备，未经用户明确要求不要执行。

## 架构

### 双进程 + 双构建目标

标准 Electron 三层 + 纯 Web 构建：

- **Main** (`src/main/`)：窗口、文件系统、受控媒体租约、自定义协议、更新、遥测
- **Preload** (`src/preload/`)：桥接
- **Renderer** (`src/renderer/src/`)：React 前端，同时为 Web 版本

构建：Electron 用 `electron-vite`，Web 用 `vite`。两套 tsconfig：`tsconfig.node.json` / `tsconfig.web.json`。

### Monorepo（pnpm workspace）

| 包                         | 说明                                          |
| -------------------------- | --------------------------------------------- |
| `@marchen/electron-ipc`    | 类型安全 IPC 封装                             |
| `@marchen/shared`          | main/renderer 共享常量与类型                  |
| `@marchen/player-loading`  | 视频识别、匹配和弹幕加载状态机（RxJS，纯 TS） |
| `@marchen/playback-core`   | 媒体会话、时钟和播放命令（纯 TS）             |
| `@marchen/danmaku-engine`  | DOM 弹幕调度、轨道和节点池（纯 TS）           |
| `@marchen/sparkle-updater` | macOS Sparkle 原生更新桥接                    |
| `@marchen/i18n`            | 界面文案、语言解析与 i18next 配置（纯 TS）    |

### IPC 通信

`@marchen/electron-ipc`：IPC 分组定义于 `src/main/ipc/`（app / danmaku / downloads / mediaSources / player / setting），汇总于 `ipc/index.ts` 的 `router`；渲染端通过 `ipcClient?.group.method()` 调用。事件用 `createEmitter` / `createListener`。Web 环境 `ipcClient` 为 null，必须可选链。

### 播放器分层

`player-loading` 负责识别、匹配、弹幕数据与 HISTORY 初始记录；`playback-core` 负责媒体会话；
renderer 的 `services/player-runtime/` 组合原生 H5 / compat 双内核、平台 Port、libass 字幕和 DOM 弹幕。
平台差异通过 Fullscreen、Playlist、Snapshot、SubtitleCatalog、SourceLifecycle Port 隔离。

**状态机**：

```
idle → importing → hashing → matching → [waiting_user] → loading_danmaku → ready
                                                                  ready ↔ reloading
任何步骤 → error
```

**Port**：`DanmakuAPI`、`DanmakuCache`、`VideoImporter`、`HistoryStore`、`PlayerBridge`

**Pipeline**：`load.ts`（主加载）、`rematch.ts`（重新匹配 / 本地导入）

### 状态管理

| 方案              | 用途                                                               |
| ----------------- | ------------------------------------------------------------------ |
| Jotai             | 全局 UI 状态（`atoms/`，自定义 store `jotaiStore` 支持组件外访问） |
| TanStack Query    | 服务端数据（gcTime=10min, staleTime=5min）                         |
| Dexie (IndexedDB) | 持久化（`database/`，`MARCHEN_PLAYER_DB`，当前 v1）                |
| RxJS              | player-loading 状态机                                              |

关键 atom：`videoAtom`、`playerSettingSheetAtom`，设置类在 `atoms/settings/`。

### 数据库

两张表：`history`（主键 `hash`）与 `library`（主键 `animeId`，影视库，仅 Electron 有数据）。schema 在 `database/schemas/`；`history` 写入通过 `persistence/media-path.ts` 校验，禁止持久化临时媒体路径。

**HISTORY**：媒体来源 `source` 区分 Electron 路径与 Web 文件元信息（不保存 File / blob URL），音轨偏好保存在 `audioTrack`；其余字段：animeId、episodeId、animeTitle、episodeTitle、progress、duration、cover、thumbnail、danmaku、newBangumi、subtitles、updatedAt。

- `danmaku`: `Array<{ type: 'auto'|'local', source, selected?, content: CommentsData }>`
- `subtitles` 保存 defaultId / timeOffset 和轨道 tags；内嵌轨道保存稳定 UID / codec，外挂字幕保存路径或受预算限制的文本内容，不持久化临时 URL。

### 字幕渲染与设置

- `services/player-runtime/subtitles/LibassSubtitleAdapter`（文件 `libass-subtitle-adapter.ts`）是 libass 渲染生命周期入口；内置回退字体为 `notoSansSC-medium.woff2`（Noto Sans SC Medium），可加载媒体内附带的字体。
- Electron 自动发现视频同目录、文件名前缀匹配的 `.ass` / `.ssa` / `.srt` / `.vtt` 外挂字幕；Web 需要用户选择文件，不能自动扫描本地目录。
- 字幕大小保存在 `playerSettingAtom.subtitleScale`，是全局持久化偏好，默认 100%，范围 50%～200%，步进 5%；不存入单视频 HISTORY。
- 字号缩放由 `services/player-runtime/subtitles/font-scale.ts` 处理：始终基于原始字幕生成内存副本，调整样式和行内绝对字号，保留相对字号指令及定位坐标；禁止覆盖原字幕文件或累积缩放结果。
- 位图字幕（目前仅本地 MKV 内嵌 PGS）不经过 libass：`services/media/subtitles/pgs/` 的 Worker 按播放位置窗口读取（字幕 Cues 定位，缺少字幕索引时借视频 Cues 有限扫描，不做全片扫描）、解析并合成位图，`PgsSubtitleAdapter` 按共用时钟绘制到独立画布；`SubtitleRenderers` 保证文本与位图字幕互斥。`ResolvedSubtitleTrack` 用 `kind: 'text' | 'bitmap'` 区分，位图会话持有读取租约，关闭字幕时才释放。
- 位图字幕的窗口、缓存、回溯、像素预算集中在 `pgs/window.ts` 的 `PGS_WINDOW`；HDR（PQ / HLG）视频只做固定增益提亮（`HDR_SUBTITLE_GAIN`，按 mpv 标定），不做 PQ 线性化；字幕大小对位图字幕不生效。测试素材由 `scripts/generate-pgs-fixtures.mts` 自造，禁止提交影片字幕。

### 弹幕屏蔽

- 规则是全局偏好，保存在 `playerSettingAtom.danmakuBlock`（总开关、滚动 / 顶部 / 底部类型开关、关键词与正则规则，上限 500 条）；不存入单视频 HISTORY，也不改写弹幕缓存。
- 判定是 `services/player-runtime/danmaku/danmaku-block.ts` 的纯函数：匹配前统一转简体并转小写，与"繁体转简体"显示开关无关；渲染器与弹幕列表必须共用同一个 blocker，保证两处结论一致。
- 生效方式是向引擎下发被屏蔽的 id 集合（`setBlockedIds`），不走 `replaceItems`：规则变化不清屏，只撤掉命中的在屏弹幕。`packages/danmaku-engine` 只认 id 集合，禁止把规则或 OpenCC 引入引擎包。
- 画面上的复制与屏蔽在悬停工具条（`hover-toolbar.ts`）完成，工具条出现在文字正下方的鼠标位置，整个弹幕层只有一个工具条元素；禁止往池化的弹幕节点里加子元素，弹幕文字本身不响应点击。

### 弹幕翻译

- 把中文弹幕在本机翻译成英文显示，Electron 与 Web 共用 renderer 里的同一套实现（`services/translation/`），不经过主进程，也没有任何翻译接口。设置是全局偏好 `playerSettingAtom.danmakuTranslation`（`enabled` / `target`，当前只有 `en`），入口是弹幕设置里的下拉框（「不翻译 / English」，语言名用该语言自己的写法），不存入单视频 HISTORY，译文也不持久化。
- 引擎是 Mozilla 的 Bergamot WASM（Firefox 网页翻译同款，MPL-2.0）。胶水脚本 `services/translation/vendor/bergamot-translator.js` 是上游自动生成文件，原样收录、禁止修改，由 Worker 以 `?raw` 源码文本载入；升级时连同 `vendor/README.md`、清单里的引擎哈希一起替换。
- 引擎 WASM 与模型不进安装包和 Web 构建：首次开启时（或预下载时，见下）从存储桶（`VITE_TRANSLATION_ASSETS_URL`）下载 gzip 文件，流式解压并与 `assets/manifest.ts` 中写死的 SHA-256 比对，一致才写入 OPFS（`navigator.storage.getDirectory()` 下的 `translation/`）。清单里的哈希是完整性的唯一依据，改动必须与存储桶文件一起核对。禁止把模型或引擎二进制提交进仓库，禁止运行时拉取未校验的脚本。
- 大文件分段下载（`assets/download.ts`）：先用 HEAD 取压缩后的大小，超过 8 MB 的文件按 8 MB 一段用 `Range: bytes=a-b` 请求、3 段并发，单段因网络中断或服务器临时错误（5xx / 408 / 429）失败时只重试这一段（最多两次），按顺序拼接后再解压校验；其余文件一个请求取完。原因是资源走跨境线路（Cloudflare，大陆没有节点），大陆用户下载 44 MB 的主模型可能要几十秒，慢线路上分段便于重试：整文件一个请求断了只能从头再来。HEAD 拿不到大小或服务器对 Range 回 200 时退回整文件下载。
- 存储桶目录为 `engine/<版本>/bergamot-translator.wasm.gz` 与 `models/<语言对>/<版本>/*.gz`：文件以普通二进制返回、不叠加传输压缩，支持 HEAD 与 Range 请求（含带 `Range` 头的预检），允许 Web 各 Origin 与 `marchen://app` 跨域读取并暴露 `Content-Length`，带版本的路径不可变。未配置基址或环境缺少 WASM SIMD / Worker / `DecompressionStream` / OPFS 时功能显示为不支持，弹幕照常按原文显示。
- 生效方式是给渲染器换「显示文本」的来源（`DomDanmakuRenderer.setTextResolver`），不走 `replaceItems`：译文陆续到达、开关切换都不清屏，在屏弹幕不变，之后出场的弹幕才读到译文；出场时译文未就绪就显示原文。测量、上屏、宽度缓存必须用同一份显示文本。`packages/danmaku-engine` 不感知翻译，禁止把翻译逻辑引入引擎包。
- 屏蔽判定、悬停工具条的复制与屏蔽始终基于原文；显示的是译文时工具条多一行原文。弹幕列表原文与译文对照显示，搜索两者都匹配，译文在渲染与过滤时现查（`useTranslationLookup`），不写进行数据。
- 调度是全量后台翻译（`schedule.ts`）：只翻含汉字且不含假名的文本，统一转简体后按文本去重，被屏蔽的不翻；每批从当前播放位置之后最近的未翻译文本取起，翻到片尾再回头，因此跳转无需特殊处理。Worker 内逐条调用引擎（比整批快约 40%）。
- 翻译资源预下载：界面语言有对应的翻译模型时（`policy.ts` 的 `translationTargetForLanguage`，目前是 English，伪本地化按英文），不等用户开启翻译就在空闲时把引擎与模型下载好（`preload.ts` 负责时机，`service.preload` 只下载、不改设置、不启动引擎，与主动开启共用同一个下载任务）。条件集中在 `policy.ts` 的 `shouldPreloadTranslation`：环境支持、本机缺资源、没有退出标记（`appSettingAtom.translationPreloadOptOut`：清除过模型或在询问里选过「不用」，主动开启翻译时清掉）、不在省流量模式；Web 端还要等本次运行里打开过视频。预下载期间设置行显示「准备中」（状态 `preparing`），失败不提示。简体中文界面不预下载。
- 下载确认：界面语言就是目标语言时开启翻译不再确认（省流量模式除外），简体中文界面首次开启仍先确认，规则是 `shouldConfirmTranslationDownload`；确认弹窗由 `useTranslationDownloadConfirm`（`components/modules/shared/TranslationDownloadConfirm.tsx`）提供，设置行与加载提示共用。
- 首次询问：界面语言不是中文、用户从未对弹幕翻译做过选择（`appSettingAtom.danmakuTranslationPrompt`）时，「弹幕加载完成」的提示（`MatchResultToast`）里问一次是否翻译，带「翻译」「不用」，停留 12 秒，同一次运行最多问一次，条件是 `shouldAskDanmakuTranslation`。在设置里操作过弹幕翻译、或翻译已经开着，都算做过选择。
- 弹幕翻译选了目标语言时「繁体转简体」置灰并保留原值：有译文的弹幕显示译文，没有译文的仍按原来的开关值决定是否转简体。
- 引擎只在开关开启、资源就绪且播放页确有需要翻译的弹幕时加载；关闭翻译、离开播放页、清除资源时终止 Worker 释放内存。引擎出错后不自动重启。清除「翻译模型」会同时关闭开关；重置应用在 `resetApp` 里显式清空 OPFS。
- 服务层只产出状态码（`status.ts`）与数值，不写面向用户的字符串；状态说明由 `services/translation/status-text.ts` 按当前界面语言生成，文案在 `packages/i18n` 的 `danmaku` 命名空间。新增目标语言时扩展 `assets/manifest.ts` 的语言对与 `TranslationTarget`。

### 界面多语言

- 支持简体中文（源语言）与 English。基于 i18next + react-i18next，文案、语言解析规则与实例配置集中在 `packages/i18n`，main 与 renderer 共用同一份。i18next 由根 `package.json` 提供，`packages/i18n` 不单独声明这个依赖（否则会装出第二份，类型扩展只对其中一份生效）。纯逻辑包（`player-loading`、`playback-core`、`danmaku-engine`、`shared`）不得引用 `@marchen/i18n`，它们只产出状态码与错误码。
- **全部界面已迁移，尚未放开**：renderer 与 main 的界面文字都已走文案包，没有豁免名单。发布开关（`packages/i18n/src/languages.ts` 的 `LANGUAGE_SWITCH_RELEASED`）仍为 `false`：正式构建固定显示简体中文、不显示语言选项，开发态可以切换。把常量改为 `true` 即放开，这一步须由用户确认英文界面之后再做。
- **文案**放在 `packages/i18n/src/locales/<语言>/<命名空间>.ts`（`as const` 的对象），命名空间按界面区域划分。键按「区域.元素.用途」命名，不用文案本身当键；插值用具名变量，不拼接字符串；带数量的文案用 `count` 与单复数键（中文只写 `_other`，英文写 `_one` / `_other`）。键的类型来自简体中文，引用不存在的键、漏传插值变量在类型检查时报错；英文是否齐全由 `packages/i18n/tests/parity.test.ts` 检查。产品名（Marchen）与语言自称名不进文案文件。
- **取用**：组件里 `useTranslation('命名空间')`，要用别的命名空间时传数组并写 `命名空间:键`；组件之外（全局提示、服务）从 `@renderer/lib/i18n` 引入 `t`，在调用时求值；主进程从 `@main/lib/i18n` 引入 `t`。数量用 `@renderer/lib/i18n` 的 `formatNumber`，不要写死 `toLocaleString('zh-CN')`。
- **模块顶层的常量不存文字**：它们在 import 时求值，存了文字就不会随语言切换更新。存键或稳定 ID，渲染时再翻译（参考 `settings/tabs.tsx`、`DarkMode.tsx`）。调用了「组件外返回文案的函数」而自己没有用 `useTranslation` 的组件，用 `useLanguage()` 订阅语言变化。
- **语言的来源**：偏好保存在 `appSettingAtom.language`（`system` / `zh-CN` / `en`），renderer 是唯一来源。`initialize/i18n.ts` 在挂载前解析并应用，之后订阅设置变化；应用语言时同步 `<html lang>`、dayjs 与主进程。「跟随系统」按系统首选语言的顺序取第一个中文或英文，都没有用英文；Electron 的页面向主进程取系统语言列表，保证两边结论一致。
- **主进程**只保存一份镜像（`<userData>/language.json`，内容是实际语言），用于页面加载之前的应用菜单；页面每次启动都会重新上报，语言变化时重建菜单。重置应用会删除镜像。
- **不翻译的**：日志、`console` 输出、给开发者看的 `Error` 文本保持中文；番剧标题、剧集名、弹幕、搜索结果等来自弹弹play 的内容没有其他语言，接口返回什么就显示什么。显示这些外部内容（含文件名）的元素标注 `lang={CONTENT_LANG}`（`@renderer/lib/i18n`，弹幕层共用），避免英文界面下汉字回落到其他地区的字形。
- **ESLint**：`marchen/no-hardcoded-ui-text` 对 renderer 与 main 的全部源码生效，禁止直接写中文界面文字，含没有汉字的中文标点（拼接用的分隔符也要按语言取）。JSX 文本、字符串、模板字符串都查；日志调用、`new XxxError(...)` 的参数、带 `code` 的对象里的 `message` / `reason`、注释、测试除外。确实不是界面文字的（例如解析文件名用的括号）用 `eslint-disable` 并写明原因。
- **伪本地化**：开发态的语言选项里有 Pseudo，文案变成带方括号、加长约 40% 的样子；没有方括号的就是还没走文案包的文字，用它检查遗漏与溢出。正式构建不包含。
- **失败提示（错误码）**：错误对象的 `message` 始终是简体中文，只用于日志、遥测与简体中文界面；界面上显示错误一律经 `@renderer/lib/errors` 的 `describeError(error, 概括说明, { domain? })`，不直接显示 `error.message`，也不按错误文字做判断（用 `hasErrorCode`）。
  - 用户看了能明白、能采取行动的失败带稳定错误码：新写的用 `@marchen/shared/errors` 的 `new UserError('域.原因', '中文说明', 参数?)`；已有的错误类型（`MediaSourceError`、`RemoteMediaError`、`SubtitleError`、`PlaybackError` 等）沿用自己的裸错误码，显示时由 `describeError` 的 `domain` 映射。错误码就是 `packages/i18n` 里 `errors` 命名空间的键（`errors:<域>.<原因>`），两边是否对得上由 `scripts/i18n/error-codes.test.mjs` 检查。
  - 解析器、解码器等内部校验不加错误码、不逐条翻译，继续 `new Error('中文')`：英文界面只显示调用方给的概括说明（原始说明不含汉字时附在后面），细节留在日志、遥测与「错误详情」里。
  - 显示规则：简体中文界面优先显示错误原来的说明（多处具体失败会合并到同一个错误码，原说明更具体，也保证中文文字不因多语言而变化）；其他语言按错误码取文案，取不到显示概括说明。
  - 错误码要穿过只能传文字的边界时用 `encodeUserError` / `errorToText` 编码成 `⟦域.原因|{参数}⟧中文说明`，接收端用 `decodeUserError` / `errorFromText` 还原：`@marchen/electron-ipc` 对抛出的 `UserError` 自动处理；返回结果对象的 IPC 用 `toFailureResult` / `errorFromFailure`；下载子进程的应答与下载任务保存在状态文件里的失败原因也是这种文字，旧版本保存的纯中文按原文显示。
  - 主进程的对话框与推给页面的提示用 `@main/lib/i18n` 的 `t` 与 `describeMainError`。utilityProcess（下载子进程）里没有界面文案，需要文字的地方传稳定值或留空，由页面补上。
- **英文术语**：弹幕 danmaku（不加复数 s，不译成 bullet comments）、番剧 anime、剧集 episode、匹配 match、影视库 Library、媒体源 Media Sources、下载 Downloads、播放记录 History（句子里写 playback history）、屏蔽 block、弹幕翻译 danmaku translation、翻译资源 translation resources、繁体转简体 Traditional to Simplified、字幕 subtitles、音轨 audio track、网络视频 Play from URL。页面与侧栏名称首字母大写（Library、Media Sources），句子里泛指时小写（a media source）。失败提示统一用「Couldn't …」开头，不用 Failed to / Unable to。设置等界面用句首大写，macOS 菜单项按系统惯例每个词首字母大写。

### API 请求

`ofetch` 封装于 `request/ofetch.ts`，API 模块在 `request/api/`（match、comment、bangumi、search），类型在 `request/models/`。主备 URL 从 `VITE_API_CLOUDFLARE_URL` / `VITE_API_EDGEONE_URL` 读取，在 `request/api-route-config.ts` 统一校验；两端启动与构建都要求有效 HTTPS 地址。

**弹弹play 接口文档**：`https://api.dandanplay.net/swagger/v2/swagger.json`（需要新增/核对接口时通过 WebFetch 读取）。

Web 与 Electron 均直连环境变量配置的两条 API 线路（Cloudflare / EdgeOne）；本地 Web dev 同样直连，不保留 Vite API 代理。通用设置提供自动 / Cloudflare / EdgeOne 模式：自动模式下首选线路慢于对冲延迟（弹幕 2.5 秒，其他 1.5 秒）时并行请求另一条，先返回者胜，胜出线路写入 localStorage 学习记录（7 天）；没有记录时大陆时区先走 EdgeOne。调度在 `request/api-route-client.ts`，口径见 `docs/observability-runbook.md`。手动模式固定线路。
Web 所在的正式、预览及开发 Origin 需由 API 服务允许 CORS，JSON POST 预检和弹幕重定向后的响应也须通过跨域检查。

**代理与签名**：两条线路都是 dandan-proxy（独立仓库）：Cloudflare Worker 负责接口白名单、Origin、签名校验、弹幕缓存并回源弹弹play，EdgeOne 只做转发：经日本中转服务器（`RELAY_URL=https://dandan-jp.suemor.com`，OpenResty 透传）进入 CF 东京节点的同一个 Worker。代理只放行 match、search/episodes、comment、bangumi/shin、bangumi/<id> 五个接口，新增接口须先在代理白名单中放行。
- 每次线路尝试都由 `request/signed-fetch.ts` 签名：用 ufo `withBase` / `withQuery` 构造最终地址、自行序列化 JSON 请求体，按 `request/sign.ts` 的 v1 规范（HMAC-SHA256）把 `_kid`、`_ts`、`_nonce`、`_sig` 追加在查询串末尾，不加自定义请求头、不新增预检。签名规范以代理仓库为准，测试向量副本在 `services/player-runtime/tests/fixtures/dandan-proxy-sign-vectors.json`，两边须同步修改。
- 密钥随客户端分发，签名只用于提高调用门槛、按 kid 轮换和区分来源（Web `w1`、桌面 `d1`），不是身份认证。代理按来源分别设置 `report` / `enforce`；`enforce` 下的 401 `signature_expired` 由客户端按 `serverTime` 纠偏并重签重试一次，签名相关 401 不切换线路。
- 未配置签名变量时不签名并提示一次；Web 正式构建与桌面发行必填，构建期校验格式。

### 媒体源

桌面端专属，支持 WebDAV（Basic Auth）、Jellyfin、Emby（登录换 token，只存 token）。

- **主进程持有凭证**：`src/main/services/media-sources/`（store / registry / webdav / jellyfin-family / image-proxy）。配置与凭证明文存于 `<userData>/media-sources.json`（产品决定，不用 safeStorage）；renderer 只用 `sourceId` + 条目 `ref` 通过 `mediaSources` IPC 工作，错误以 `{ code, message }` 稳定错误码返回，永远拿不到凭证或带鉴权的地址。
- **播放复用远程链路**：`createProviderMediaLease` 复用租约、范围读取与 16MB 前缀缓存；`createAuthorizedFetcher` 只在同源请求带鉴权头，跨 origin 重定向去掉。只读原文件，不请求服务端转码。
- **来源类型**：HISTORY `source.kind = 'provider-item'`，主键为确定性的 `provider:<sourceId>:<encodeURIComponent(itemRef)>`，浏览页用 `bulkGet` 查进度；判断"远程来源"统一用 `isRemoteKind`，不要只写 `kind === 'remote-url'`。内容指纹或大小变化时清空旧记录并重新匹配，而不是拒绝播放。
- **海报**：统一走主进程代理 `marchen://source-image/...`（打包后页面是 secure scheme，局域网 HTTP 图片会被混合内容拦截），renderer 不直接请求服务器图片。
- **字幕与播放列表**：provider 字幕以 `provider:<subtitleId>` 作为 id 和历史偏好键；不在本地提取内嵌字幕。播放列表由 `siblings` 给出，播完时重新解析下一集。
- **重置应用**：`clearAllData` 调用 `clearMediaSources()` 撤销租约、清空 registry 和海报缓存并删除配置文件。

### 其他

- **自定义协议**：`marchen://`，固定应用 origin 为 `marchen://app`，媒体采用可撤销的不透明租约；逻辑在 `src/main/lib/media-protocol.ts`，常量在 `@marchen/shared/constants/protocol.ts`
- **播放器**：HTML5 Video + `@marchen/playback-core` + `@marchen/danmaku-engine` + `@jellyfin/libass-wasm`（ASS/SSA）；兼容内核使用 MediaBunny、WebCodecs、`@suemor/libav-hevc@0.1.1` 和官方 AC-3 / E-AC-3 / DTS 扩展；兼容画面唯一经 VideoFramePresenter → MediaStream → 静音 video 输出，音频继续 Web Audio / SoundTouch；Canvas 仅用于预览 / 缩略图 / 字幕；没有 Node FFmpeg / HLS 或主画面 Canvas 播放回退
- **UI**：shadcn/ui (Radix) + Tailwind 4 + next-themes，图标 `icon-[mingcute--xxx]`，动画 framer-motion（LazyMotion），模态框 ModalStackProvider
- **路由**：React Router 8，通过 `createHashRouter` 创建 Hash 路由；`router/router.tsx` 定义 `/player`、`/library`（影视库）、`/media-sources`（媒体源，当前来源放在 `?source=<id>` 以保持侧栏高亮）、`/downloads`（下载）。影视库、媒体源与下载仅 Electron 展示，Web 访问对应地址时重定向到 `/player`。侧边栏由 `siderbarRoutes` 渲染，默认重定向 `/player`
- **平台判断**：`isWeb = !window.electron`，见 `src/renderer/src/lib/utils.ts`
- **可观测性**：Sentry（`VITE_SENTRY_DSN`）+ PostHog，main 在 `src/main/telemetry/`，renderer 在 `services/telemetry/`；开发态默认不上报（`VITE_TELEMETRY_DEBUG`），排障见 `docs/observability-runbook.md`

### 埋点与上报

- **统一入口**：业务代码只调用 `services/telemetry` 的 `telemetry.*`、`captureFeatureUsed`、`reportOperationalError` 等封装，不直接引用 Sentry / PostHog SDK；`packages/*` 纯 TS 包不得依赖遥测 SDK，通过 observer 订阅公开状态上报（参考 `player-loading-observer.ts`、`playback-observer.ts`）
- **事件契约**：新增产品事件先在 `services/telemetry/contracts.ts` 的 `TelemetryEventMap` 声明，事件名与属性用 snake_case；属性优先用枚举、布尔和数值，用 `operation_id` / `attempt_id` 等关联 ID 串联链路。文件名、路径、URL 等高基数值不放进产品事件属性，原因是聚合维度，不是隐私
- **关键事件**：漏斗与结果类事件加入 `outbox.ts` 的 `CRITICAL_TELEMETRY_EVENTS`；普通交互用 `feature_used`（feature / action / value）
- **错误**：外部交互失败必须显式经过 telemetry 边界，不能只 `setError` 或 `console.error`；用户取消、AbortError 等预期情况不作为异常上报；fingerprint 和 tag 只用稳定错误码，明细放 context
- **不脱敏、不遮蔽**：按产品决定完整上报，禁止新增 URL / token / 路径脱敏、`mask`、`ph-no-capture` 或隐私性质的回放屏蔽；`services/telemetry/bound.ts` 只做体积与循环保护
- **性能屏蔽**：`data-telemetry-replay-block` 只用于每秒大量增删 DOM 的高频层（当前仅弹幕运动层），并注释说明是性能原因
- **降级**：遥测初始化或调用失败不得影响业务流程；口径或策略变化同步更新 `docs/observability-runbook.md`

## 目录结构

```
src/
├── main/                 # Electron 主进程（bootstrap、index、ipc、initialize、lib、services、telemetry、windows、modules、constants）
├── preload/              # 预加载
└── renderer/src/         # React 前端 / Web
    ├── components/{ui,modules/{player,settings,shared,app},layout,icons,common}
    ├── page/{player,library,media-sources,downloads}
    ├── services/{player-runtime,player-loading,danmaku,media,telemetry,translation}
    ├── atoms/            # Jotai
    ├── hooks/  request/  database/  router/  providers/  initialize/  constants/  lib/

packages/{electron-ipc,shared,player-loading,playback-core,danmaku-engine,sparkle-updater,i18n}
marchen/                  # 变更规划（changes / archive / ideas），配合 /marchen:* 技能使用
docs/                     # 发布、部署、可观测性文档
```

## 路径别名

`@renderer` → `src/renderer/src`，`@main` → `src/main`，`@pkg` → `package.json`，`@marchen/*` → `packages/*`。新增包时要同时在 `tsconfig.node.json` / `tsconfig.web.json`、`electron.vite.config.ts`、`vite.config.ts` 与两个 vitest 配置里加上对应路径。

## 代码风格

**Prettier**：无分号、单引号、行宽 100、2 空格、尾逗号 all，`prettier-plugin-tailwindcss` 自动排序。

**ESLint**：`@antfu/eslint-config`（含 React），启用 `react-hooks/rules-of-hooks`，禁止全局 `location`（用 `useLocation` 或 `getReadonlyRoute`）。

### 规范要求

- 注释、日志与给开发者看的错误信息使用**中文**；界面文字不直接写在代码里，统一放进 `packages/i18n`（简体中文为源语言，同时补英文），见「界面多语言」
- 视频入口格式以 `packages/shared/src/media/formats.ts` 为准（MP4/M4V、MOV/QT、MKV/MK3D、WebM、TS/MTS/M2TS/M2T），实际播放取决于容器和编码探测；hash 为 16MB 前缀 MD5
- **注释**：积极写中文注释，解释意图、上下文、设计决策
- **类型安全**：避免 `any`，优先 discriminated union / 泛型约束
- **错误处理**：外部交互（API、文件、IPC）做降级，参考 player-loading 弹幕获取失败降级为无弹幕
- **关注点分离**：遵循 Port / Service / Pipeline / Adapter 分层
- **异步流**：优先用 RxJS operator，避免命令式嵌套回调
- **平台兼容**：考虑 Electron 与 Web 双端，Electron 专属逻辑用 `isWeb` 或 `ipcClient?.` 隔离
- **端形态范围**：当前仅要求 Electron 与 Web 桌面端；无需适配手机、平板触控或移动端响应式布局，除非产品需求后续明确提出
- **新功能标记**：需要提示用户的新功能在 `lib/new-features.ts` 的 `NEW_FEATURES` 登记功能 ID 与引入版本，标题旁放 `<NewBadge feature="..." />`（`components/common/NewBadge.tsx`，播放器深色界面上传 `playerMaterial`），并在用户实际用到该功能处调用 `markNewFeatureSeen`。显示规则集中在登记表：用过即消失，没用过则只在引入版本和其后一个补丁版本内显示；不要在组件里自行判断版本或另存状态
- **指针样式**：交互元素默认保持系统箭头指针，不主动使用 `pointer`、`grab` 或 `grabbing`；确有产品需求时再局部例外
- **颜色**：色阶与取值见 `src/renderer/src/styles/shadcn.css` 注释（深色 L0 background < L1 popover < L2 card < L3 muted/input < L4 accent）
  - 普通界面只用语义 token（`bg-background/card/popover/muted/accent/field/raised`、`text-foreground/muted-foreground`、`border-border/input` 等），不用 `zinc-*` / `neutral-*` / `slate-*` / `stone-*` / `gray-*` 原始色阶，不写任意色值
  - `bg-background` 只表示最底层；凸起、选中、悬停用更高一档的 token；输入类控件底色用 `field`，分段 / Tabs 选中用 `raised`
  - 基础组件（`components/ui`）不写 `dark:bg-*` 这类底色变体，主题差异放进 token，保证调用方传入的 bg 类能被 tailwind-merge 覆盖
  - 模块需要特殊氛围时只在作用域内重写 token 的值；模块内的别名变量（如 `--settings-*`、`--sidebar-*`）只能指向全局 token，不写具体色值
  - 例外：浮在视频上的播放器界面使用 `--player-*` 毛玻璃材质；影视库使用 `--library-*`（历史例外，新模块不得效仿）
  - 品牌蓝只用 `--brand` / `--brand-text` / `--brand-press`（Tailwind 中为 `brand` / `brand-text` / `brand-press`）
- **UI 预览**：使用 Chrome DevTools MCP（attach 模式，`.mcp.json` 配 `--browserUrl=http://127.0.0.1:9222`）。`pnpm dev` 启动 Electron 后，`isDev` 下主进程暴露 9222 调试端口。attach 后用 `list_pages` 选主窗口 target。9222 被占用时改端口并同步更新 `src/main/index.ts` 与 `.mcp.json`

## 环境变量

完整列表见 `.env.example`，常用项：

| 变量                                                  | 说明                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `VITE_API_CLOUDFLARE_URL` / `VITE_API_EDGEONE_URL` | API 主备 HTTPS 基址（含 `/api/v2`），构建时注入 |
| `VITE_API_SIGN_KID` / `VITE_API_SIGN_KEY` | API 请求签名的密钥编号与密钥（Web `w1`、桌面 `d1`），正式构建必填，会随客户端公开 |
| `VITE_TRANSLATION_ASSETS_URL` | 弹幕翻译的引擎与模型存储桶基址（HTTPS）；Web 正式构建与桌面发行必填，本地开发与 PR 检查可留空（弹幕翻译显示为不支持），格式非法时构建失败 |
| `VITE_SENTRY_DSN`                                     | Sentry DSN                                                       |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`              | PostHog 客户端配置                                               |
| `VITE_TELEMETRY_DEBUG`                                | 开发态是否上报遥测，默认 false                                   |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | CI 上传 source map 和管理 Sentry Release（严禁加 `VITE_` 前缀）  |
| `SPARKLE_ED_PUBLIC_KEY` / `SPARKLE_ED_PRIVATE_KEY`    | Sparkle 更新验签公钥与签名私钥；私钥仅用于发行，不打入客户端     |
| `MARCHEN_DEPLOY_ENV`                                  | EdgeOne 正式构建必填（preview / production）                     |

## 双内核构建与部署

`pnpm media:prepare` 从锁定发布包复制 WASM / Worker 与 AudioWorklet，禁止重新引入播放器本地 libav 补丁 / 编译链。开发与构建自动执行。部署要求见 `docs/player-engine-deployment.md`。COOP 为 same-origin，COEP 为 credentialless；不设置 CSP，协议 bypassCSP=false。所有平台验收以 change evidence 为准，不把短样片通过写成平台支持结论。

## 桌面发布入口

发布 macOS 13+ ARM64、Windows x64、Linux x64 与 arm64，不再生成 Intel Mac 新包。Linux 每个架构发行 AppImage + deb，须在对应架构的原生 runner 上构建（`node-datachannel` 安装期按宿主架构下载二进制），最终包由 `scripts/desktop/verify-linux.mjs` 校验并经 xvfb 冒烟（`MARCHEN_SMOKE_MARKER`）。Mac 当前使用 ad-hoc 签名、不做 Apple 公证；`.env.example` 中的 Apple 开发者账号变量不是当前发行流程的必要配置。

Mac 使用 `@marchen/sparkle-updater` 与 Sparkle 原生更新窗口，Windows 与 Linux AppImage 使用 `electron-updater`；Linux deb 只检查新版本并引导下载（`platform: 'linux-manual'`），不在应用内替换自身。渠道源中 Linux 为可选平台，缺少 Linux 元数据的版本不影响 mac / win，客户端把 Linux 元数据 404 视为已是最新。Linux 不启用实验性 VA-API / ANGLE 开关，AppImage 不写死 `--no-sandbox`（仅 AppRun 在系统禁止 user namespace 时降级）。按安装版本自动选择稳定 / Beta / Alpha 渠道，只升级到允许渠道内的更高版本。标签构建仅创建 Draft；公开 Release 后由 `.github/workflows/update-channels.yml` 同步渠道元数据。禁止覆盖已公开版本的标签或安装包。

具体版本命名、密钥配置、渠道规则及验收流程见 `docs/desktop-release.md`，Linux 用户安装说明见 `docs/linux-install.md`；更新说明位于 `docs/releases/<version>.md`。

## Web 发布入口

Web 托管于 EdgeOne，配置在 `edgeone.json`，正式构建用 `pnpm build:web:release`，具体环境与回滚见 `docs/web-edgeone-release.md`。不要恢复 GitHub Actions SSH Web 部署。`scripts/player-engine/experiments` 是历史实验，不是产品回归；`.tmp/test-results` 为本地输出，不提交。
