## 1. 共享类型与来源身份

- [x] 1.1 在 `@marchen/shared/media-sources` 定义 `MediaSourceKind`、`BrowseNode`、来源摘要、`ProviderSubtitle` 和稳定错误码类型
- [x] 1.2 在 `@marchen/shared/media` 新增 `ProviderMediaSource`（`kind: 'provider-item'`），扩展 `DurableMediaSource`、`SerializableDurableMediaSource`、`PersistentMediaSource`；提供 `providerHistoryKey(sourceId, itemRef)` 和 `isRemoteKind(source)`
- [x] 1.3 扩展 `DB_History.source` 和 `assertPersistentMediaPath`，校验 `provider:` 前缀，并拒绝地址形式的 itemRef；补单测

## 2. 鉴权读取与租约

- [x] 2.1 新增 `createAuthorizedFetcher`：同源请求带鉴权头，跨 origin 重定向时去掉鉴权头，其余沿用 `fetchRemoteMedia` 的校验；单测覆盖同源跳转、跨域跳转、跳转次数上限
- [x] 2.2 在 `media-protocol.ts` 新增 `createProviderMediaLease(target, id, owner)`，复用 owner 校验、租约上限、流量统计和前缀缓存，文件名使用 provider 提供的 name；补单测

## 3. 主进程来源存储与 IPC

- [x] 3.1 实现 `media-sources/store.ts`：读写 userData 下的 JSON，凭证直接保存；写入时先写临时文件再重命名，避免写坏；补读写和损坏文件降级的单测
- [x] 3.2 定义 `MediaSourceProvider` 接口、错误码映射（401、超时、404、版本过低、无效响应）和 `registry.ts`（实例缓存，401 时标记为需要重新登录）
- [x] 3.3 新增 `ipc/media-sources.ts`，提供 list、add、update、relogin、remove、browse、siblings、subtitles、readSubtitle、createMediaLease，汇总进 router；错误统一以 `{ code, message }` 返回
- [x] 3.4 `remove` 删除配置和凭证，释放该来源仍在使用的租约，清掉该来源的海报缓存，不删除 HISTORY
- [x] 3.5 新增 `clearMediaSources()`（撤销 provider 租约、清空 registry、清空海报缓存、删除配置文件和临时文件），在 `clearAllData` 的 `win.reload()` 之前调用，删除失败时让重置整体失败；补单测

## 4. WebDAV provider

- [x] 4.1 引入 `fast-xml-parser`，实现 PROPFIND multistatus 解析（命名空间前缀、href 解码、去掉自身条目），使用多种服务端的响应夹具做单测（nginx、Apache、alist、rclone）
- [x] 4.2 实现 test、list：只保留文件夹和视频，按自然排序、文件夹在前
- [x] 4.3 实现 resolvePlayback（Basic Auth 头、大小、文件名）、siblings、subtitles（同目录前缀匹配，规则与本地 `matchSubtitleFile` 一致）、readSubtitle（有大小上限）

## 5. Jellyfin / Emby provider

- [x] 5.1 实现 `jellyfin-family.ts`：dialect 定义请求头格式，固定设备 id；登录（AuthenticateByName）、读取 `/System/Info/Public` 并检查最低版本
- [x] 5.2 实现 `image-proxy.ts` 和 `marchen://source-image` 路由：destination 与 Origin 校验、sourceId/itemId/kind 白名单、宽度分档、鉴权取图（`image/*`、5 MB、10 秒、每个来源 6 个并发）、48 MB 内存 LRU、失败统一返回 404；单测覆盖非法参数、非图片响应、缓存命中与淘汰、移除来源后清缓存
- [x] 5.3 实现 list：根层级是 Views；按媒体库类型映射为 series、season、video、folder；只有一季时直接返回单集；单集按季号和集号排序；节点的 `image` 由海报代理（5.2）生成 `marchen://source-image` 地址（带分档宽度和 ImageTag）
- [x] 5.4 实现 resolvePlayback（static stream、MediaSource 的路径和大小）、siblings（同季或同文件夹）
- [x] 5.5 实现 subtitles 和 readSubtitle：只列文本字幕轨，通过服务端 Stream 接口取正文
- [x] 5.6 分别用 Jellyfin 和 Emby 的真实响应夹具，对 5.1～5.5 做单测

## 6. 播放加载与续播

- [x] 6.1 把 `remote-importer.ts` 的主体抽成共用的「租约 → 前缀指纹 → 移交 → 上报」流程，保证 `importRemoteVideo` 的行为和测试不变
- [x] 6.2 新增 `importProviderVideo`：使用确定性 hash；指纹或大小不一致时清空旧记录的进度、匹配和弹幕，并提示「视频内容已变化」
- [x] 6.3 在 player-loading 中，`VideoImporter` 和 `load.ts` 支持 provider 输入，`PlayerLoadingService` 新增 `loadFromProvider`；补 player-loading 测试
- [x] 6.4 把 renderer 中所有 `kind === 'remote-url'` 的判断改为 `isRemoteKind`（media-resource、electron platform、native runtime、PlayerCompatibilityNotice、MediaTransferRows、Labs 等），逐处确认语义
- [x] 6.5 在 `load-history.ts` 增加 `provider-item` 分支，把来源已移除、离线、登录失效映射成对应提示；补 load-history 测试

## 7. 播放列表与字幕接入

- [x] 7.1 `PlaylistEntry` 新增 provider 字段；Electron 的 `PlaylistPort` 通过 siblings 构建列表，play 走 `loadFromProvider`；`samePlaylistSource` 支持 `provider-item`
- [x] 7.2 播完时重新解析 siblings 来决定下一集，补自动连播测试（最后一集、中途切换）
- [x] 7.3 `supportsEmbeddedSubtitles` 排除 `provider-item`；`SubtitleCatalogPort` 新增 provider 分支：列出 provider 字幕，选中后读取正文，复用外挂字幕加载流程
- [x] 7.4 HISTORY 字幕偏好以 `provider:<subtitleId>` 保存和恢复；补字幕恢复测试

## 8. 媒体源页面

- [x] 8.1 新增路由 `/media-sources`（当前来源放在 `?source=<id>`，保持侧栏高亮）以及侧栏项（`mingcute--server-line`，位于影视库和下载之间）；Web 端重定向到 `/player`
- [x] 8.2 实现 `SourcesOverview`：来源卡片、连接状态、空态、右键菜单（编辑、重新登录、移除确认）
- [x] 8.3 实现 `SourceFormDialog`：类型选择、字段校验、测试连接，保存中和失败两种状态，错误码映射为中文提示
- [x] 8.4 实现纯函数 `pickBrowseView` 并补单测；实现 `SourceBrowser`：面包屑、返回、刷新、网格与列表切换、错误重试、401 时显示重新登录入口
- [x] 8.5 实现 `BrowseGrid` 和 `BrowseList`（海报、横版卡、集号、时长、大小、自然排序展示；图片加载失败时显示占位图），点击容器进入下一层，点击视频调用 `loadFromProvider` 并跳转到播放器
- [x] 8.6 用 `bulkGet` 和 `useLiveQuery` 显示观看进度和已看完标记
- [x] 8.7 用 `atomWithStorage` 记住每个来源的浏览位置，路径不存在时逐级回退
- [x] 8.8 在播放器空态新增桌面端专属的「从媒体源打开」次要按钮

## 9. 遥测与文档

- [x] 9.1 在 `contracts.ts` 新增 `media_source_saved`、`media_source_browse_failed`、`media_source_open_result`，导入来源枚举新增 `media_source`；`media_source_open_result` 加入 `CRITICAL_TELEMETRY_EVENTS`
- [x] 9.2 在保存、浏览、打开、字幕读取等失败路径接入 `reportOperationalError`，用户取消不上报
- [x] 9.3 更新 `docs/observability-runbook.md`；更新 CLAUDE.md 的路由和架构说明

## 10. 验收

- [x] 10.1 跑通 `pnpm typecheck`、`pnpm lint`、`pnpm test:main`、`pnpm test:player-runtime`
- [x] 10.2 用真实的 WebDAV（alist 或 rclone）、Jellyfin 10.8 以上、Emby 4.7 以上各验证一遍：添加、浏览、播放、弹幕匹配、连播、字幕、续播、移除来源后的提示
- [x] 10.3 用 Chrome DevTools MCP 检查媒体源页面的网格、列表、空态和错误态，确认没有凭证出现在 renderer 的网络请求和日志中
- [x] 10.4 用打包后的应用（不是 dev）连接局域网 HTTP 的 Jellyfin，确认海报正常显示，且 renderer 没有直接请求服务器图片
