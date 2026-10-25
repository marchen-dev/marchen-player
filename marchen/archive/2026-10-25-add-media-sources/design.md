## 背景

桌面端已经有一条完整的 HTTP 远程播放链路：

```
remote-importer (renderer)
  └─ ipc player.createRemoteMediaLease(url, id)
       └─ main/lib/media-protocol.ts
            openRemoteRangeSource(url, signal, fetchRemoteMedia)   ← shared/media/remote.ts
              → trackRemoteTransfer → cacheRemotePrefix(16MB)
            → marchen://media/<id>   ← H5 / compat 内核统一读取
  └─ 16MB 前缀 MD5 → player-loading 匹配弹幕
  └─ HISTORY.source = { kind: 'remote-url', hash: 'remote:<uuid>', url, fingerprint }
```

现有约束：
- `validateRemoteUrl` 拒绝带账号密码的 URL，`fetchRemoteMedia` 不带任何请求头；
- 远程来源不做内嵌字幕提取（`supportsEmbeddedSubtitles`），只能手动导入外挂字幕；
- HISTORY 主键是字符串 `hash`。远程记录使用 `remote:` 前缀的随机 id，内容指纹单独放在 `fingerprint` 中；`assertPersistentMediaPath` 会校验持久化的来源；
- 播放列表 `PlaylistEntry` 只认本地路径和 Web File，下一集在播放结束时才解析；
- Web 端已经下线远程播放，影视库和下载只在 Electron 端提供。

## 目标与非目标

**目标：**
- 主进程统一管理媒体源配置、凭证和 provider 访问；renderer 只通过 `sourceId` 和条目引用工作。
- WebDAV、Jellyfin、Emby 复用现有的 range 读取、前缀缓存、媒体租约和匹配链路，不另建播放管线。
- 新增可续播的 `provider-item` 来源类型，播放记录、影视库和播放记录弹窗不需要感知 provider 细节。
- 统一的浏览节点模型，网格和列表由纯函数决定，可以单测。

**非目标：**
- SMB、Web 端、服务端转码或 HLS、向服务器回写观看进度、Quick Connect、局域网发现、跨来源搜索；
- 不信任自签名 HTTPS 证书（连接失败时给出明确提示）；
- 不升级 Dexie schema 版本，不改造影视库的数据模型。

## 决策

### D1 主进程 provider 层

新增 `src/main/services/media-sources/`：

```
media-sources/
├─ store.ts            配置与凭证：<userData>/media-sources.json，凭证直接保存
├─ registry.ts         sourceId → provider 实例，缓存登录态，处理 401 后的状态标记
├─ provider.ts         MediaSourceProvider 接口
├─ webdav.ts           PROPFIND Depth:1 + Basic Auth
├─ jellyfin-family.ts  Jellyfin / Emby 共用实现，差异放在 dialect 里
├─ image-proxy.ts      海报代理：marchen://source-image 路由的取图、校验与内存缓存
└─ errors.ts           稳定错误码
```

```ts
interface MediaSourceProvider {
  test(): Promise<void>                          // 失败时抛出带稳定错误码的异常
  list(ref: string | null): Promise<BrowseNode[]>
  resolvePlayback(itemRef: string): Promise<PlaybackTarget>  // { url, headers, name, size }
  siblings(itemRef: string): Promise<BrowseNode[]>           // 播放列表
  subtitles(itemRef: string): Promise<ProviderSubtitle[]>
  readSubtitle(itemRef: string, subtitleId: string): Promise<string>
}
```

**为什么放在主进程**：发起带鉴权的媒体请求的本来就是主进程（租约），凭证放在主进程才能做到 renderer 永远拿不到凭证，也能避开 renderer 的 CORS 和 COEP 限制。

**凭证存储**：凭证和其他配置一起直接写进 `media-sources.json`，不使用 `safeStorage` 或系统密钥环。这样所有平台行为一致，没有 Linux 无 keyring 的兼容问题，也不会因为系统钥匙串变化导致凭证解不开。文件中保存名称、类型、地址、用户名，WebDAV 的密码，Jellyfin/Emby 的 token、userId 和 serverId。

### D2 IPC 分组 `mediaSources`

`src/main/ipc/media-sources.ts`，汇总到 router：

| 方法 | 说明 |
|---|---|
| `list` | 返回来源摘要（不含凭证） |
| `add` / `update` | 先 `test()`，通过后保存；Jellyfin/Emby 在这一步登录，换取 token |
| `relogin` / `remove` | 移除时同时删除凭证；不删除 HISTORY |
| `browse(sourceId, ref)` | 返回 `BrowseNode[]` 和面包屑 |
| `siblings(sourceId, itemRef)` | 返回播放列表 |
| `subtitles` / `readSubtitle` | 获取字幕列表，读取字幕正文（有大小上限） |
| `createMediaLease(sourceId, itemRef, id)` | 见 D3 |

IPC 错误统一以 `{ code, message }` 的形式传回，renderer 根据 `code` 区分重新登录、重试、来源已移除等提示。

**重置应用**：`clearAllData`（[cleaner.ts](../../../src/main/lib/cleaner.ts)）目前只清理下载、session 存储、日志和遥测身份，不会删除 userData 下的普通文件。因此 `media-sources` 服务需要对外提供 `clearMediaSources()`，在 `clearAllData` 中、`win.reload()` 之前调用：

1. 撤销所有 provider 租约（abort 正在进行的读取）；
2. 清空 registry 中缓存的 provider 实例和登录状态；
3. 删除 `media-sources.json` 和可能残留的临时文件。

删除失败时抛出异常，让 `clearAllData` 整体失败并给出提示，不能做到一半就当作成功。renderer 侧的浏览位置存在 localStorage，已经被 `clearStorageData` 清掉；TanStack Query 的缓存会随窗口 reload 一起丢弃，都不需要额外处理。

### D3 租约复用：带鉴权的 fetcher

`openRemoteRangeSource` 已经支持注入 `fetcher`，所以不改它的签名：
- 新增 `createAuthorizedFetcher(headers, origin)`。它包装 `fetchRemoteMedia`：同源请求带上鉴权头；**只要重定向到不同 origin，就去掉鉴权头**，其余重定向校验沿用现有逻辑。
- `validateRemoteUrl` 继续拒绝 URL 中的账号密码，凭证只通过请求头传递。
- `media-protocol.ts` 新增 `createProviderMediaLease(target, id, owner)`，复用现有的 owner 校验、租约上限、`trackRemoteTransfer` 和 `cacheRemotePrefix`。返回的文件名使用 provider 给的 `name`：Jellyfin 的 URL 路径是 `/stream`，没法从 URL 推出文件名。

### D4 `provider-item` 来源类型与 HISTORY 主键

```ts
interface ProviderMediaSource extends DurableMediaIdentity {
  kind: 'provider-item'
  sourceId: string
  provider: 'webdav' | 'jellyfin' | 'emby'
  itemRef: string            // WebDAV：相对根地址的解码路径；Jellyfin/Emby：ItemId
  fingerprint?: { algorithm: 'md5-prefix-16m'; value: string }
}
```

- **主键用确定性的 `provider:<sourceId>:<encodeURIComponent(itemRef)>`，不加索引。** 探索阶段原本打算升级到 Dexie v2 并加 `providerKey` 索引。改用确定性主键后，浏览列表可以直接 `db.history.bulkGet(keys)` 批量查进度，不需要迁移数据库，也和 `remote:` 前缀的做法一致。
- `assertPersistentMediaPath` 扩展：`provider-item` 的 hash 必须带 `provider:` 前缀，`itemRef` 不能是 `http(s):`、`marchen:`、`blob:` 这类地址。
- 同一个条目再次打开时，比较 16MB 前缀指纹和文件大小：
  - 一致：沿用原记录（进度、弹幕选择、字幕偏好）；
  - 不一致：清空这条记录的进度、匹配和弹幕，toast 提示「视频内容已变化」，然后当作新视频重新匹配。
  - 和 `remote-url` 的区别：`remote-url` 遇到不一致会直接拒绝，因为它的地址本身可能已经指向别的东西；`provider-item` 的身份由来源和路径决定，内容被替换是正常情况。
- 从影视库或播放记录续播：在 `load-history.ts` 增加 `provider-item` 分支，调用 `service.loadFromProvider(sourceId, itemRef, hash)`。来源已移除、离线或登录失效时，把 IPC 的 `code` 映射成对应提示。

### D5 Renderer 导入适配器

- 把 `remote-importer.ts` 中「开租约 → 读前缀 → 算指纹 → 移交租约 → 上报」的主体抽成一个共用函数。`importRemoteVideo` 和新增的 `importProviderVideo` 只在「怎么开租约」和「怎么构造 source」上不同。
- `PlayerLoadingService` 新增 `loadFromProvider`。在 `packages/player-loading` 里，`VideoImporter` 的输入联合类型新增 provider 描述；`load.ts` 中针对 `remote-url` 的分支要同时覆盖 `provider-item`（都按「远程来源」处理），状态机本身不变。
- `media-resource.ts`、`electron.ts`、`use-native-player-runtime.ts` 等目前判断 `kind === 'remote-url'` 的地方，统一改为 `isRemoteKind(source)`，避免漏改。

### D6 播放列表

- `PlaylistEntry` 新增可选字段 `provider?: { sourceId; itemRef }`。Electron 的 `PlaylistPort.play` 遇到 provider 条目时，调用 `loadFromProvider`。
- 打开时调用 `siblings(sourceId, itemRef)` 得到播放列表；播完时沿用现有的「结束时才解析下一集」逻辑，重新调用一次 `siblings`，这样服务器上新增的集也能被播到。
- `samePlaylistSource` 增加对 `provider-item` 的比较（`sourceId` 和 `itemRef` 都相同才算同一条）。
- 列表顺序由 provider 决定，与浏览界面一致：WebDAV 按 `Intl.Collator` 的 numeric 规则自然排序；Jellyfin/Emby 的单集按 `ParentIndexNumber`、`IndexNumber` 排序，文件夹按 `SortName` 排序。

### D7 字幕

- `supportsEmbeddedSubtitles` 对 `provider-item` 返回 false，不在本地提取内嵌字幕，避免触发已经被否掉的远程分散读取。
- Electron 的 `SubtitleCatalogPort.list` 新增 `provider-item` 分支，通过 IPC 拿到 provider 字幕列表，以 `origin: 'external'` 展示，id 是 `provider:<subtitleId>`。选中后调用 `readSubtitle` 取正文，复用现有的外挂字幕加载流程（包括字号缩放、时间偏移）。
  - **WebDAV**：在同一次 PROPFIND 结果里，按文件名前缀匹配 `.ass`、`.ssa`、`.srt`、`.vtt`，规则与本地 `matchSubtitleFile` 一致。
  - **Jellyfin/Emby**：从 `MediaStreams` 中取 `Type=Subtitle` 的轨。文本字幕（ass、ssa、subrip、webvtt）通过 `/Videos/{id}/{mediaSourceId}/Subtitles/{index}/Stream.{ass|srt|vtt}` 获取，服务端会负责抽取内嵌字幕；PGS、VobSub 这类图形字幕不列出。
- HISTORY 中的字幕偏好记 `provider:<subtitleId>`；续播时重新列出字幕，按这个 id 恢复选择。手动导入外挂字幕的功能保持不变。

### D8 浏览节点模型与 UI

共享类型放在 `@marchen/shared/media-sources`：

```ts
type BrowseNode =
  | { type: 'collection' | 'series' | 'season' | 'folder'; ref: string; title: string; image?: string; year?: number }
  | { type: 'video'; ref: string; title: string; image?: string; duration?: number; size?: number; index?: number }
```

- **视图规则** `pickBrowseView(nodes)`：子节点中 collection、series、season 加上带海报的 video（电影）占多数时用 `grid`，否则用 `list`。用户手动切换的结果存在 jotai 中，键是 `sourceId + ref`，只在内存里保留，不持久化。
- **Jellyfin/Emby 层级**：根层级是用户可见的媒体库（横版卡）；`tvshows` 媒体库列出 Series；Series 下如果只有一季，`browse` 直接返回这季的单集，面包屑里也不出现季；`movies` 媒体库列出 Movie，类型是 `video`，带海报；其他类型的媒体库按文件夹浏览。
- **页面**：`src/renderer/src/page/media-sources/`
  ```
  index.tsx              路由入口：查询参数带 source 时显示浏览页，否则显示总览
  SourcesOverview.tsx    来源卡片网格、空态、右键菜单
  SourceBrowser.tsx      面包屑、刷新、视图切换、错误与重试
  BrowseGrid.tsx / BrowseList.tsx
  SourceFormDialog.tsx   通过 ModalStack 打开，表单与连接测试
  ```
  路由：只有 `/media-sources` 一条，当前来源放在查询参数 `?source=<id>`，浏览层级由 `media-source-locations` 记录。侧栏高亮按路径精确匹配，使用子路由 `/media-sources/:sourceId` 会让进入来源后侧栏失去高亮，所以不用子路由。Web 端重定向到 `/player`，与影视库的处理方式一致。
- **数据**：TanStack Query，key 是 `['media-sources', sourceId, ref]`，沿用全局的 `staleTime`；刷新按钮让当前 key 失效后重新拉取。
- **观看状态**：对当前列表中的 video 节点，拼出确定性的 hash，用 `useLiveQuery` + `bulkGet` 查出进度，显示进度条或已看完标记。
- **浏览位置**：`atomWithStorage('media-source-locations')` 记录每个来源最后打开的 ref（ref 不敏感）。读取失败且错误码是 `not_found` 时，逐级往上回退。
- **海报：统一走主进程代理**，renderer 不直接请求服务器上的图片。
  - **原因**：页面运行在 `marchen://app`，这个 scheme 注册为 `secure: true`。局域网里常见的 `http://192.168.x.x:8096` 图片属于混合内容，Chromium 会把请求自动升级成 HTTPS，而局域网服务器通常没有 HTTPS，结果加载失败。开发态页面是 `http://localhost`，不受这个限制，所以这个问题只在打包后出现。走代理还能顺带解决服务器要求图片鉴权的情况。
  - **路由**：`marchen://source-image/<sourceId>/<itemId>/<kind>?w=<width>&tag=<imageTag>`，挂在 `createApplicationProtocol` 中，与 `media` 并列。主进程在 `browse` 返回节点时直接生成这个地址，作为 `BrowseNode.image`。
    - `kind` 只允许 `Primary`、`Thumb`、`Backdrop`；
    - `w` 按 160、320、480、640 分档向上取整，限制缓存的变体数量；
    - `tag` 使用 Jellyfin/Emby 返回的 `ImageTags`，图片更新后地址随之变化，旧的缓存自然失效。
  - **校验**：沿用 `media` 路由的做法：`request.destination` 必须是 `image`，Origin 必须是应用自身；`sourceId` 必须存在，`itemId` 必须符合服务端 id 的格式。上游地址只用来源配置里的 baseURL 拼接，不接受任意 URL，避免被当成 SSRF 跳板。
  - **取图**：使用 D3 的鉴权 fetcher。上游响应必须是 `image/*`，大小上限 5 MB，超时 10 秒；每个来源最多 6 个并发请求，超出的排队。
  - **缓存**：主进程内存 LRU，总量 48 MB，键是 `sourceId + itemId + kind + 宽度档 + tag`。移除来源、重新登录、`clearMediaSources()` 时清掉对应来源的缓存。响应头 `Cache-Control: private, max-age=600`，统一的 `Cross-Origin-Resource-Policy: cross-origin` 头保证 COEP 下可以加载。
  - **失败处理**：上游 404、超时、非图片、来源离线时，路由返回 404，renderer 的 `<img>` 在 `onError` 中切换为占位图。海报失败属于降级，不单独上报遥测，以免浏览一页产生大量错误事件。
  - WebDAV 第一版不显示海报，不会用到这个路由。
- **风格**：使用应用通用的 shadcn 组件和 token，不复用影视库的 cinematic 红橙 scope；海报卡的比例和信息密度参考影视库的 `PosterCard`。
- **播放器空态**：桌面端新增次要按钮「从媒体源打开」，点击后 `navigate('/media-sources')`。

### D9 WebDAV 细节

- 使用 `fast-xml-parser`（纯 JS，没有原生依赖）解析 PROPFIND 的 multistatus。处理 `DAV:` 命名空间前缀的差异，按 href 去掉列表中的自身条目，对 href 做解码后再和根路径比较。
- 只保留文件夹和 `isVideoFile` 能识别的视频；大小取 `getcontentlength`。服务器是否支持 range，交给播放时的现有校验判断。
- 测试连接：对根路径发一次 PROPFIND Depth:0，401 映射成 `auth_failed`，网络错误或超时映射成 `unreachable`。

### D10 Jellyfin / Emby 细节

- 登录：`POST /Users/AuthenticateByName`，保存 `AccessToken`、`User.Id` 和 `ServerId`。设备 id 每次安装固定生成一个，设备名是 `Marchen Player`。
- dialect 的差异：
  - Jellyfin 的请求头是 `Authorization: MediaBrowser Client="Marchen Player", Device=..., DeviceId=..., Version=..., Token="..."`；
  - Emby 使用 `X-Emby-Authorization`（同样格式）加 `X-Emby-Token`；
  - 都使用 `/Users/{userId}/Views` 和 `/Users/{userId}/Items?ParentId=...`，这两个接口在两端都可用。
- 播放：`/Videos/{id}/stream?static=true&MediaSourceId=...`。文件名取 `MediaSources[0].Path` 的 basename，用于弹幕匹配；大小取 `MediaSources[0].Size`。有多个 MediaSource 时取第一个。
- 最低支持版本：Jellyfin 10.8、Emby 4.7。测试连接时读取 `/System/Info/Public`，版本过低时提示 `unsupported_version`。

### D11 遥测

在 `contracts.ts` 中新增以下事件：

| 事件 | 属性 | 关键事件 |
|---|---|---|
| `media_source_saved` | `provider`、`action: add\|update\|relogin`、`result`、`error_code?` | 否 |
| `media_source_browse_failed` | `provider`、`error_code` | 否 |
| `media_source_open_result` | `provider`、`result`、`duration_ms`、`fingerprint`、`restoring`、`error_code?` | 是，加入 `CRITICAL_TELEMETRY_EVENTS` |

- 现有导入来源枚举新增 `media_source`；`media_source_removed` 和视图切换走 `captureFeatureUsed`。
- 错误码：`auth_failed`、`unreachable`、`unsupported_version`、`range_unsupported`、`not_found`、`content_changed`、`source_removed`、`invalid_response`。外部失败经 `reportOperationalError` 上报，fingerprint 只用错误码，地址等明细放进 context，不做脱敏。
- 同步更新 `docs/observability-runbook.md`。

## 风险与权衡

- **凭证不加密**：能读取用户 userData 目录的程序都能拿到 WebDAV 密码和 Jellyfin/Emby token。这是产品的选择：换来跨平台行为一致、实现简单。Jellyfin/Emby 至少只保存 token，用户可以在服务端注销设备来让它失效。
- **自签名证书**：NAS 常用自签名 HTTPS，Node fetch 会拒绝连接。第一版只提示「证书不受信任」，不提供跳过证书校验的选项。
- **WebDAV 文件改名**：改名后 itemRef 变了，原来的进度对不上，这和本地文件改名的行为一致。
- **前缀缓存预算**：所有来源共用 64MB。用户在浏览界面快速连点多集时可能会超出预算，超出后会降级为直接读取，不影响正确性。
- **Emby 接口漂移**：Emby 的 API 与 Jellyfin 会继续分化。dialect 只隔离请求头和少量字段，并设定最低版本；Jellyfin 和 Emby 的测试各自使用对应服务端的真实响应夹具。
- **海报代理的开销**：每张海报都要多经过一次主进程转发。一页通常有 30～60 张，经过分档宽度、内存 LRU 和 600 秒缓存头后，重复浏览基本都能命中缓存。首次进入大型媒体库时，海报会按每个来源 6 个并发逐步出现，这是可以接受的。
- **并发**：每个租约沿用 2 路并发。Jellyfin 服务端如果开启了带宽限制，可能让 compat 内核的预读变慢；这个限制与 HTTP 直链相同，不单独处理。
