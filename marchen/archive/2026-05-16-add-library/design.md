## 背景

当前应用使用单一的 `history` 表（主键 `hash`）存储文件级播放状态，包括播放进度、弹幕缓存、字幕配置、缩略图等。`history-store.ts` 在首次播放时已经调用 `apiClient.bangumi.getBangumiDetailById(animeId)` 获取作品详情，但只提取了 `imageUrl` 和 `newBangumi` 两个字段。

history 表被 15+ 个文件直接引用，承担弹幕缓存、字幕配置、播放进度等核心职责，不能删除。

## 目标与非目标

**目标：**

- 新增 library 表实现作品级别的影视库管理
- 复用现有的 bangumi API 调用，最小化入库逻辑的改动
- 用影视库页面替代播放记录页面
- 从详情面板直接播放某集（复用现有的 `useLoadingHistoricalAnime` 导航机制）

**非目标：**

- 不引入 TMDB 或其他第三方 API
- 不实现目录扫描批量入库（第一版只支持播放时自动入库）
- 不实现跨季合并（每季作为独立条目，和弹弹play 的数据结构一致）
- 不展示 mediainfo 标签（4K、杜比等）
- 不实现背景大图（详情页走简洁风格）
- 不改动 player-core 包

## 决策

### 1. library 表独立于 history 表

新增独立的 `library` 表而非扩展 history 表。理由：
- history 表以文件 hash 为主键（一个文件一条记录），library 以 animeId 为主键（一部作品一条记录）
- 两者粒度不同，强行合并会导致数据冗余和查询复杂度上升
- history 表的消费者（弹幕缓存、字幕、进度）不需要感知 library 的存在

两表通过 `fileHash` 关联：library.episodes[].fileHash → history.hash。

### 2. 入库逻辑嵌入 history-store.ts 的 updateBangumiData

现有代码已经在 `updateBangumiData` 中调用 bangumi API 并获取完整响应。改造方式：
- 在获取 bangumi 详情后，额外调用 library 写入逻辑
- 写入逻辑幂等：先检查 library 表是否已有该 animeId，有则更新观看状态，无则创建
- 保持 fire-and-forget 模式，不阻塞播放

### 3. 评分取值策略

使用 bangumi 响应顶层的 `rating` 字段（弹弹play 已计算的综合评分）。不从 `ratingDetails` 中选取，避免复杂的条件判断。

### 4. 集标题解析

从 `episodeTitle`（如 "第1话 第十三亲王诺亚·亚拉拉特"）中去掉前缀，只保留纯标题部分。解析规则：匹配 `第X话 ` 前缀并移除。如果不匹配则保留原文。

### 5. 详情面板使用现有 Sheet 组件

复用项目中已有的 Radix UI Sheet 组件（`components/ui/sheet/`），从右侧滑出。覆盖默认的 `sm:max-w-sm` 为更宽的值（~480px），以容纳集数列表。

### 6. 从详情面板播放复用现有导航机制

点击某集播放时：`navigate(RouteName.PLAYER, { state: { hash: episode.fileHash } })`。这会触发现有的 `useLoadingHistoricalAnime` hook，从 history 表读取 path 并调用 `service.loadFromPath()`。无需新增导航逻辑。

### 7. 播放完成标记观看状态

在 `Event.tsx` 的 `Events.ENDED` 处理中，增加 library 表更新逻辑。通过 `videoAtom.hash` 找到对应的 history 记录，再通过 `history.episodeId` 更新 library 表。

### 8. MatchDanmakuDialog 迁移

将 `MatchDanmakuDialog` 的路由判断从 `RouteName.HISTORY` 改为 `RouteName.LIBRARY`。功能放在影视库详情面板的集数列表右键菜单中。

### 9. 数据库迁移策略

v4 迁移从现有 history 记录中提取基础信息（title、imageUrl）创建 library 记录。这些记录信息不完整（缺少 episodes 列表、summary 等），下次播放时会触发 bangumi API 调用并补全。迁移不调用网络请求。

### 10. useLiveQuery 实时响应

影视库列表页使用 Dexie 的 `useLiveQuery` 监听 library 表变化，和现有 history 页面的模式一致。当后台入库完成时，列表自动更新。

## 风险与权衡

### 风险 1: 迁移后 library 记录信息不完整

迁移只能从 history 中提取 title 和 imageUrl，缺少 episodes、summary、tags 等。用户看到的卡片可能只有标题和海报，没有集数进度。

**缓解**：下次播放该作品任何一集时自动补全。或者提供一个"刷新信息"的手动操作。

### 风险 2: bangumi API 的 imageUrl CDN 可用性

海报图片来自 `assets.anixplayer.net`，如果该 CDN 不可用，所有海报都会加载失败。

**缓解**：卡片组件已有图片加载失败的 fallback UI（显示占位图标），和现有 history 页面一致。

### 风险 3: 同一文件重新匹配到不同作品

用户可能对同一文件多次重新匹配，导致 library 中的 fileHash 关联需要更新。

**缓解**：重新匹配时，从旧作品的 episodes 中清除该 fileHash，在新作品中添加。如果旧作品没有任何 fileHash 关联了，可以保留（用户手动删除）或自动清理。第一版选择保留，不自动删除 library 记录。

### 风险 4: history 页面删除后的功能回归

history 页面的右键菜单提供了"重新匹配弹幕"和"清除弹幕缓存"功能。删除页面后这些功能需要在影视库中有对应入口。

**缓解**：在详情面板的集数列表中，对有文件的集提供右键菜单（重新匹配弹幕、清除弹幕缓存、删除文件关联）。
