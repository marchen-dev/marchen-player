## 动机

不少用户把番剧放在 NAS 上，通过 Jellyfin、Emby 管理，或者用 WebDAV（alist、rclone、NAS 自带服务）共享。现在桌面端只能播放本地文件和粘贴的 HTTP 直链：用户得先挂载或复制文件，或者自己拼出带签名的直链，没有办法直接浏览服务器上的目录。

仓库里已经有一套桌面端远程播放的底座（`RemoteRangeSource` 按需范围读取、主进程受控媒体租约、16MB 识别前缀缓存、远程来源写入 HISTORY），三种 HTTP 类来源复用这套底座即可，接入成本可控。所以本次新增「媒体源」tab，让用户能在应用内连接服务器、浏览目录并直接播放，同时保留弹幕匹配、续播和影视库的现有体验。

## 变更内容

- 新增 Electron 专属的「媒体源」侧栏 tab（图标 `mingcute--server-line`），与「影视库」分开：媒体源负责「从哪里找文件」，影视库仍按作品聚合 HISTORY。
- 支持三种来源：WebDAV（Basic Auth）、Jellyfin、Emby（用户名密码登录换取 token，只保存 token）。
- 来源管理：添加（选择类型、填写信息、测试连接后才能保存）、编辑、重新登录、移除（需确认）、连接状态展示与空态。
- 统一浏览组件：面包屑导航，按子节点类型自动切换海报网格或列表（可以手动切换），手动刷新，记住每个来源上次浏览的位置。容器节点点击进入，视频点击直接播放；不做独立详情页。Jellyfin/Emby 只有一季时直接进入单集列表。
- 播放：主进程使用来源凭证创建媒体租约，只读取原文件，不请求服务端转码。同一目录或同一季的视频组成播放列表，支持上一集、下一集和播完自动下一集。
- 字幕：WebDAV 自动发现同目录、文件名前缀匹配的外挂字幕；Jellyfin/Emby 使用服务端下发的外挂字幕和内嵌字幕轨。
- 观看状态：浏览列表显示本地 HISTORY 中的进度和「已看完」。从影视库、播放记录续播时，按来源和条目引用重新解析播放地址，来源离线或登录失效时明确提示。
- 播放器空态新增次要入口「从媒体源打开」，点击后跳转到媒体源 tab。
- 遥测：新增媒体源相关产品事件与稳定错误码。
- 不包括：SMB、Web 端、向服务器回写观看进度、服务端转码或 HLS、Quick Connect、局域网自动发现、跨来源全局搜索。

## 能力

### 新增能力

- `media-source-management`：来源的增删改、连接测试、凭证存储与登录失效处理。
- `media-source-browsing`：统一节点模型、各来源的层级映射、网格与列表视图规则、导航与刷新、观看状态展示。
- `media-source-playback`：来源条目的租约播放、HISTORY 持久化与续播、同目录或同季播放列表、字幕来源、错误降级与遥测。

### 修改能力

无规范级修改。现有本地文件、HTTP 直链、影视库和播放记录的行为保持不变，只是新增一种可续播的来源类型。

## 影响范围

- 主进程：新增来源配置存储（userData 下的 JSON，凭证直接保存）、provider 适配器（WebDAV PROPFIND、Jellyfin/Emby REST）、新的 IPC 分组；媒体租约支持带鉴权的来源；远程读取支持鉴权 header，跳转到其他域名时去掉凭证。
- 共享包：`@marchen/shared/media` 新增 `provider-item` 来源类型，`PersistentMediaSource` 和 HISTORY 校验随之扩展。
- Renderer：新增 `page/media-sources`、路由和侧栏项；扩展 player-loading 的导入适配器、HISTORY 续播、播放列表 Port、字幕来源策略；播放器空态新增入口。
- 遥测：`contracts.ts` 新增事件，同步更新 `docs/observability-runbook.md`。
- 数据库：HISTORY 只扩展 `source` 联合类型，不升级 Dexie schema 版本。
- 依赖：WebDAV 的 XML 解析优先使用无原生依赖的轻量库或自行解析，不新增原生模块。
