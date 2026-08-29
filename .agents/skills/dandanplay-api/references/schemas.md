# 弹弹play API v2 数据模型

> 来源：<https://api.dandanplay.net/swagger/v2/swagger.json>；快照时间：2026-08-26T18:36:50+00:00；共 74 个 schema。

按模型名或字段名搜索。复杂组合关系需要精确生成类型时，以 `openapi.json` 为准。

## BangumiListResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `bangumiList` | 否 | `array<BangumiIntro>` | 番剧列表 |

## BangumiIntro

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `bangumiId` | 否 | `string | null` | 作品ID（新） |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `searchKeyword` | 否 | `string | null` | 搜索关键词 |
| `isOnAir` | 否 | `boolean` | 是否正在连载中 |
| `airDay` | 否 | `integer(int32)` | 周几上映，0代表周日，1-6代表周一至周六 |
| `isFavorited` | 否 | `boolean` | 当前用户是否已关注（无论是否为已弃番等附加状态） |
| `isRestricted` | 否 | `boolean` | 是否为限制级别的内容（例如属于R18分级） |
| `rating` | 否 | `number(decimal)` | 番剧综合评分（综合多个来源的评分求出的加权平均值，0-10分） |

## ResponseBase

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |

## BangumiSeasonListResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `seasons` | 否 | `array<BangumiSeason>` | 番剧季度列表 |

## BangumiSeason

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `year` | 否 | `integer(int32)` | 年份 |
| `month` | 否 | `integer(int32)` | 月份 |
| `seasonName` | 否 | `string | null` | 季度名称 |

## BangumiQueueIntroResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `hasMore` | 否 | `boolean` | 是否有更多数据可以展示（显示界面上的“更多”按钮） |
| `bangumiList` | 否 | `array<BangumiQueueIntroV2>` | 未看剧集列表 |

## BangumiQueueIntroV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `episodeTitle` | 否 | `string | null` | 最新一集的剧集标题 |
| `airDate` | 否 | `string(date-time) | null` | 剧集上映日期（无小时分钟，当地时间） |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `description` | 否 | `string | null` | 未看状态的说明，如“今天更新”，“昨天更新”，“有多集未看”等 |
| `isOnAir` | 否 | `boolean` | 番剧是否在连载中 |

## BangumiQueueDetailsResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `bangumiList` | 否 | `array<BangumiQueueDetailsV2>` | 未看番剧剧集列表 |
| `unwatchedBangumiList` | 否 | `array<BangumiQueueDetailsV2>` | 已关注但从未看过的番剧列表 |

## BangumiQueueDetailsV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `isOnAir` | 否 | `boolean` | 是否正在连载中 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `searchKeyword` | 否 | `string | null` | 搜索资源的关键词 |
| `lastWatched` | 否 | `string(date-time) | null` | 上次观看时间（null表示尚未看过） |
| `episodes` | 否 | `array<BangumiQueueEpisodeV2>` | 未看剧集的列表 |

## BangumiQueueEpisodeV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `episodeId` | 否 | `integer(int64)` | 剧集编号（弹幕库编号） |
| `episodeTitle` | 否 | `string | null` | 剧集标题 |
| `airDate` | 否 | `string(date-time) | null` | 上映日期（无小时分钟，当地时间），可能为null |

## BangumiDetailsResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `bangumi` | 否 | `oneOf<BangumiDetails>` | 番剧详情 |

## BangumiDetails

- 类型：`BangumiIntro & object`
- 组合：`BangumiIntro` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `bangumiId` | 否 | `string | null` | 作品ID（新） |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `searchKeyword` | 否 | `string | null` | 搜索关键词 |
| `isOnAir` | 否 | `boolean` | 是否正在连载中 |
| `airDay` | 否 | `integer(int32)` | 周几上映，0代表周日，1-6代表周一至周六 |
| `isFavorited` | 否 | `boolean` | 当前用户是否已关注（无论是否为已弃番等附加状态） |
| `isRestricted` | 否 | `boolean` | 是否为限制级别的内容（例如属于R18分级） |
| `rating` | 否 | `number(decimal)` | 番剧综合评分（综合多个来源的评分求出的加权平均值，0-10分） |
| `type` | 否 | `oneOf<AnimeType>` | 作品类型 |
| `typeDescription` | 否 | `string | null` | 类型描述 |
| `titles` | 否 | `array<BangumiTitle>` | 作品标题 |
| `seasons` | 否 | `array<BangumiEpisodeSeason>` | 作品季度列表。可能为空，仅对部分源（如TMDB源）有效 |
| `episodes` | 否 | `array<BangumiEpisode>` | 剧集列表 |
| `summary` | 否 | `string | null` | 番剧简介 |
| `intro` | 否 | `string | null` | 短简介（Staff简介或剧情简介） |
| `metadata` | 否 | `array<string>` | 番剧元数据（名称、制作人员、配音人员等） |
| `bangumiUrl` | 否 | `string | null` | Bangumi.tv页面地址 |
| `userRating` | 否 | `integer(int32)` | 用户个人评分（0-10） |
| `favoriteStatus` | 否 | `oneOf<FavoriteStatus>` | 关注状态 |
| `comment` | 否 | `string | null` | 用户对此番剧的备注/评论/标签 |
| `ratingDetails` | 否 | `object | null` | 各个站点的评分详情 |
| `relateds` | 否 | `array<BangumiIntro>` | 与此作品直接关联的其他作品（例如同一作品的不同季、剧场版、OVA等） |
| `similars` | 否 | `array<BangumiIntro>` | 与此作品相似的其他作品 |
| `tags` | 否 | `array<BangumiTag>` | 标签列表 |
| `onlineDatabases` | 否 | `array<BangumiOnlineDatabase>` | 此作品在其他在线数据库/网站的对应url |
| `trailers` | 否 | `array<BangumiTrailer>` | 预告片列表 |

## AnimeType

- 类型：`string`
- 枚举：`tvseries`, `tvspecial`, `ova`, `movie`, `musicvideo`, `web`, `other`, `jpmovie`, `jpdrama`, `unknown`, `tmdbtv`, `tmdbmovie`

## BangumiTitle

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `language` | 否 | `string | null` | 语言 |
| `title` | 否 | `string | null` | 标题 |

## BangumiEpisodeSeason

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `id` | 否 | `string | null` | 季度ID |
| `airDate` | 否 | `string(date-time) | null` | 上映日期 |
| `name` | 否 | `string | null` | 季度名称 |
| `episodeCount` | 否 | `integer(int32)` | 剧集数量 |
| `summary` | 否 | `string | null` | 季度简介 |

## BangumiEpisode

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `seasonId` | 否 | `string | null` | 季度ID（如果为空表示只有一个季度） |
| `episodeId` | 否 | `integer(int64)` | 剧集ID（弹幕库编号） |
| `episodeTitle` | 否 | `string | null` | 剧集完整标题 |
| `episodeNumber` | 否 | `string | null` | 剧集短标题（可以用来排序，非纯数字，可能包含字母） |
| `lastWatched` | 否 | `string(date-time) | null` | 上次观看时间（服务器时间，即北京时间） |
| `airDate` | 否 | `string(date-time) | null` | 本集上映时间（当地时间） |

## FavoriteStatus

- 类型：`string`
- 枚举：`favorited`, `finished`, `abandoned`

## BangumiTag

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `id` | 否 | `integer(int32)` | 标签编号 |
| `name` | 否 | `string | null` | 标签内容 |
| `count` | 否 | `integer(int32)` | 观众为此标签+1次数 |

## BangumiOnlineDatabase

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `name` | 否 | `string | null` | 网站名称 |
| `url` | 否 | `string | null` | 网址 |

## BangumiTrailer

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `id` | 否 | `integer(int32)` | 视频编号 |
| `url` | 否 | `string | null` | 视频播放页地址 |
| `title` | 否 | `string | null` | 视频标题 |
| `imageUrl` | 否 | `string | null` | 视频封面 |
| `date` | 否 | `string(date-time)` | 发布时间 |

## BangumiCommentsResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `count` | 否 | `integer(int32)` | 当前页返回的评论数量 |
| `hasMore` | 否 | `boolean` | 是否还有更多评论可以获取 |
| `comments` | 否 | `array<BangumiComment>` | 评论列表 |

## BangumiComment

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `id` | 否 | `integer(int32)` | 评论编号 |
| `userId` | 否 | `integer(int32)` | 弹弹play 用户ID。为 0 表示非本平台用户 |
| `externalUserId` | 否 | `string | null` | 外部平台用户ID/主页标识 |
| `userName` | 否 | `string | null` | 用户名 |
| `imageUrl` | 否 | `string | null` | 用户头像地址 |
| `source` | 否 | `string | null` | 评论来源，例如 Bangumi |
| `text` | 否 | `string | null` | 评论内容 |
| `rating` | 否 | `integer(int32)` | 用户评分（0-10） |
| `updatedTime` | 否 | `string(date-time)` | 记录更新时间 |

## CommentResponseV2

- 类型：`object`
- 说明：弹幕列表

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `count` | 否 | `integer(int32)` | 弹幕数量 |
| `comments` | 否 | `array<CommentData>` | 弹幕列表 |

## CommentData

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `cid` | 否 | `integer(int64)` | 弹幕ID |
| `p` | 否 | `string | null` | 弹幕参数（出现时间,模式,颜色,用户ID） |
| `m` | 否 | `string | null` | 弹幕内容 |

## SendCommentResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `cid` | 否 | `integer(int64)` | 此弹幕库中的弹幕ID |

## SendCommentRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `time` | 否 | `number(double)` | 弹幕出现时间，单位为秒 |
| `mode` | 否 | `integer(int32)` | 弹幕模式：1-普通弹幕，4-顶部弹幕，5-底部弹幕 |
| `color` | 否 | `integer(int32)` | 弹幕颜色，计算方式为 Rx255x255+Gx255+B |
| `comment` | 否 | `string | null` | 弹幕内容，不能长于100个字符 |

## SendAppCommentRequest

- 类型：`SendCommentRequest & object`
- 组合：`SendCommentRequest` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `time` | 否 | `number(double)` | 弹幕出现时间，单位为秒 |
| `mode` | 否 | `integer(int32)` | 弹幕模式：1-普通弹幕，4-顶部弹幕，5-底部弹幕 |
| `color` | 否 | `integer(int32)` | 弹幕颜色，计算方式为 Rx255x255+Gx255+B |
| `comment` | 否 | `string | null` | 弹幕内容，不能长于100个字符 |
| `userName` | 否 | `string | null` | 弹幕发送者昵称，由调用方应用自行指定。 |

## UserFavoriteResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `favorites` | 否 | `array<UserFavoriteItem>` | 关注列表 |

## UserFavoriteItem

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `bangumiId` | 否 | `string | null` | 作品编号 |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `type` | 否 | `oneOf<AnimeType>` | 作品类型 |
| `lastFavoriteTime` | 否 | `string(date-time)` | 上次关注的时间 |
| `lastAirDate` | 否 | `string(date-time) | null` | 上次剧集更新的时间 |
| `lastWatchTime` | 否 | `string(date-time) | null` | 上次播放作品相关剧集的时间 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `episodeTotal` | 否 | `integer(int32)` | 此作品的总集数 |
| `episodeWatched` | 否 | `integer(int32)` | 当前已看的集数 |
| `startDate` | 否 | `string(date-time) | null` | 番剧首话上映日期 |
| `isOnAir` | 否 | `boolean` | 此作品是否正在连载中 |
| `favoriteStatus` | 否 | `oneOf<FavoriteStatus>` | 关注状态 |
| `userRating` | 否 | `integer(int32)` | 用户给此作品的评分（1-10分，0代表未评分） |
| `rating` | 否 | `number(decimal)` | 此番剧的综合评分（0-10分） |

## UserAddFavoriteResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |

## UserAddFavoriteRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 动画作品编号 |
| `favoriteStatus` | 否 | `oneOf<FavoriteStatus>` | 设定或刷新当前的关注状态。设置为null代表不修改当前状态。 |
| `rating` | 否 | `integer(int32)` | 给作品打分（1-10分），0代表不修改当前分数 |
| `comment` | 否 | `string | null` | 给作品添加评论，最长为500个字符。当值为null或空字符串时将不修改当前的值。 如果希望清空所有文字，请传入至少一个空格。 |

## UserDeleteFavoriteResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |

## HomepageResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `banners` | 否 | `array<BannerPageItem>` | 公告列表 |
| `bangumiQueueIntroList` | 否 | `array<BangumiQueueIntroV2>` | 未看剧集列表 |
| `shinBangumiList` | 否 | `array<BangumiIntro>` | 新番列表 |
| `bangumiSeasons` | 否 | `array<BangumiSeason>` | 动画番剧季度列表 |

## BannerPageItem

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `id` | 否 | `integer(int32)` | 公告ID |
| `title` | 否 | `string | null` | 标题 |
| `description` | 否 | `string | null` | 子标题、描述 |
| `url` | 否 | `string | null` | 落地页链接 |
| `imageUrl` | 否 | `string | null` | 图片地址 |

## BannerResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `banners` | 否 | `array<BannerPageItem>` | 公告列表 |

## LoginResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `registerRequired` | 否 | `boolean` | 该用户是否需要先注册弹弹play账号才可正常登录。当此值为true时表示用户使用了QQ微博等第三方登录但没有注册弹弹play账号。 |
| `userId` | 否 | `integer(int32)` | 用户编号 |
| `userName` | 否 | `string | null` | 弹弹play用户名。如果用户使用第三方账号登录（如QQ微博）且没有关联弹弹play账号，此属性将为null |
| `email` | 否 | `string | null` | 用户邮箱地址 |
| `legacyTokenNumber` | 否 | `integer(int32)` | 旧API中使用的数字形式的token，仅为兼容性设置，不要在新代码中使用此属性 |
| `token` | 否 | `string | null` | 字符串形式的JWT token。将来调用需要验证权限的接口时，需要在HTTP Authorization头中设置“Bearer token”。 |
| `tokenExpireTime` | 否 | `string(date-time)` | JWT token过期时间，默认为21天。如果是APP应用开发者账号使用自己的应用登录则为1年。 |
| `userType` | 否 | `string | null` | 用户注册来源类型 |
| `screenName` | 否 | `string | null` | 昵称 |
| `profileImage` | 否 | `string | null` | 头像图片的地址 |
| `appScope` | 否 | `string | null` | 当前登录会话内应用权限列表，可以由此判断能否调用哪些API |
| `payConfigs` | 否 | `array<PayConfig>` | 商品列表 |
| `privileges` | 否 | `oneOf<UserPrivileges>` | 用户权益过期时间（全部为北京时间） |
| `code` | 否 | `string | null` | 消息体验证码 |
| `ts` | 否 | `integer(int64)` | 当前时间戳 |
| `linkedAccounts` | 否 | `oneOf<LinkedAccounts>` | 已关联的第三方账号信息（如 bangumi.tv 账号） |

## PayConfig

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `providerId` | 否 | `string | null` | 支付渠道（wechat,alipay） |
| `providerName` | 否 | `string | null` | 支付渠道名称（微信支付，支付宝） |
| `items` | 否 | `array<PayConfigItem>` | 商品列表 |

## PayConfigItem

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `id` | 否 | `string | null` | 商品ID |
| `name` | 否 | `string | null` | 商品名称（如：1个月会员） |
| `price` | 否 | `integer(int32)` | 商品价格（单位：分） |
| `currency` | 否 | `string | null` | 货币单位（CNY） |

## UserPrivileges

- 类型：`object`
- 说明：用户各类权益到期时间

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `member` | 否 | `string(date-time) | null` | 会员权益过期时间（北京时间） |
| `resmonitor` | 否 | `string(date-time) | null` | 弹弹play资源监视器权益过期时间（北京时间） |

## LinkedAccounts

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `bangumi` | 否 | `oneOf<LinkedAccountInfo>` | bangumi.tv 用户 |

## LinkedAccountInfo

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `userId` | 否 | `string | null` | bangumi.tv 用户ID |
| `userName` | 否 | `string | null` | bangumi.tv 用户名 |
| `display` | 否 | `string | null` | 显示名称（昵称） |
| `avatar` | 否 | `string | null` | 用户头像URL |
| `expires` | 否 | `string(date-time)` | 当前授权过期时间（北京时间） |

## LoginRequest

- 类型：`object`
- 说明：请求用户登录

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `userName` | 是 | `string` | 弹弹play用户名；最短 `0`；最长 `50` |
| `password` | 是 | `string` | 用户密码；最短 `0`；最长 `50` |
| `appId` | 是 | `string` | 客户端ID；最短 `0`；最长 `20` |
| `unixTimestamp` | 否 | `integer(int64)` | Unix时间戳：从协调世界时1970年1月1日0时0分0秒起至现在的总秒数，不考虑闰秒。；最小 `1.0`；最大 `9.22337203685478e+18` |
| `hash` | 是 | `string` | 通过参数计算得到的32位MD5值，不区分大小写。计算方法请参考接口说明。；最短 `1`；正则 `^[0-9a-fA-F]{32}$` |

## MatchResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `isMatched` | 否 | `boolean` | 是否已精确关联到某个弹幕库 |
| `matches` | 否 | `array<MatchResultV2>` | 搜索匹配的结果 |

## MatchResultV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `episodeId` | 否 | `integer(int64)` | 弹幕库ID |
| `animeId` | 否 | `integer(int64)` | 作品ID |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `episodeTitle` | 否 | `string | null` | 剧集标题 |
| `type` | 否 | `oneOf<AnimeType>` | 作品类别 |
| `typeDescription` | 否 | `string | null` | 类型描述 |
| `shift` | 否 | `number(double)` | 弹幕偏移时间（弹幕应延迟多少秒出现）。此数字为负数时表示弹幕应提前多少秒出现。 |
| `imageUrl` | 否 | `string | null` | 此作品的海报图片地址 |

## MatchRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `fileName` | 否 | `string | null` | 视频文件名，不包含文件夹名称和扩展名，特殊字符需进行转义。 |
| `fileHash` | 否 | `string | null` | 文件前16MB (16x1024x1024 Byte) 数据的32位MD5结果，不区分大小写。 |
| `fileSize` | 否 | `integer(int64)` | 文件总长度，单位为Byte。 |
| `videoDuration` | 否 | `integer(int32)` | [可选]32位整数的视频时长，单位为秒。默认为0。 |
| `matchMode` | 否 | `oneOf<MatchMode>` | [可选]匹配模式。 |

## MatchMode

- 类型：`string`
- 枚举：`hashAndFileName`, `fileNameOnly`, `hashOnly`

## BatchMatchResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `results` | 否 | `array<BatchMatchResponseItem>` | 批量匹配的结果。将针对每个请求生成对应的结果。 |

## BatchMatchResponseItem

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `success` | 否 | `boolean` |  |
| `fileHash` | 否 | `string | null` |  |
| `matchResult` | 否 | `oneOf<MatchResultV2>` |  |

## BatchMatchRequest

- 类型：`object`
- 说明：批量匹配的请求

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `requests` | 否 | `array<MatchRequest>` | 匹配请求，列表中最多包括32个请求 |

## UserPlayHistoryResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `playHistoryAnimes` | 否 | `array<UserPlayHistoryAnime>` |  |

## UserPlayHistoryAnime

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` |  |
| `animeTitle` | 否 | `string | null` |  |
| `type` | 否 | `oneOf<AnimeType>` | 作品类别 |
| `typeDescription` | 否 | `string | null` | 类型描述 |
| `imageUrl` | 否 | `string | null` |  |
| `isOnAir` | 否 | `boolean` |  |
| `episodes` | 否 | `array<BangumiEpisode>` |  |

## UserAddPlayHistoryResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |

## UserAddPlayHistoryRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `episodeIdList` | 否 | `array<integer(int64)>` | 弹幕库编号列表（最多100项，必须都属于同一作品） |
| `addToFavorite` | 否 | `boolean` | 关注此作品（弹幕库编号列表中必须只有一项） |
| `rating` | 否 | `integer(int32)` | 给此剧集打分（弹幕库编号列表中必须只有一项）。范围为1-10分，0代表不修改当前评分。 |

## RegisterRequestV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `appId` | 是 | `string` | 客户端ID；最短 `1` |
| `userName` | 是 | `string` | 用户名。只能包含英文或数字，长度为5-20位，首位不能为数字。；最短 `1` |
| `password` | 是 | `string` | 密码。长度为5到20位之间。；最短 `1` |
| `email` | 是 | `string` | 备用邮箱（找回密码用）。长度不能超过50个字符。；最短 `1` |
| `screenName` | 是 | `string` | 昵称。长度不能超过50个字符。；最短 `1` |
| `unixTimestamp` | 否 | `integer(int64)` | Unix时间戳：从协调世界时1970年1月1日0时0分0秒起至现在的总秒数，不考虑闰秒。；最小 `1.0`；最大 `9.22337203685478e+18` |
| `hash` | 是 | `string` | 通过参数计算得到的32位MD5值，不区分大小写。计算方法请参考接口说明。；最短 `1`；正则 `^[0-9a-fA-F]{32}$` |

## ResetPasswordResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |

## ResetPasswordRequestV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `appId` | 是 | `string` | 应用ID；最短 `1` |
| `userName` | 是 | `string` | 用户名；最短 `5`；最长 `20` |
| `email` | 是 | `string` | 注册此用户时填写的备用邮箱；最短 `1` |
| `unixTimestamp` | 否 | `integer(int64)` | Unix时间戳：从协调世界时1970年1月1日0时0分0秒起至现在的总秒数，不考虑闰秒。；最小 `1.0`；最大 `9.22337203685478e+18` |
| `hash` | 是 | `string` | 通过参数计算得到的32位MD5值，不区分大小写。计算方法请参考接口说明。；最短 `1`；正则 `^[0-9a-fA-F]{32}$` |

## FindMyIdResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |

## FindMyIdRequestV2

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `appId` | 是 | `string` | 应用ID；最短 `1`；最长 `20` |
| `email` | 是 | `string` | 注册此用户时填写的备用邮箱；最短 `1`；最长 `50` |
| `unixTimestamp` | 否 | `integer(int64)` | Unix时间戳：从协调世界时1970年1月1日0时0分0秒起至现在的总秒数，不考虑闰秒。；最小 `1.0`；最大 `9.22337203685478e+18` |
| `hash` | 是 | `string` | 通过参数计算得到的32位MD5值，不区分大小写。计算方法请参考接口说明。；最短 `1`；正则 `^[0-9a-fA-F]{32}$` |

## SearchAnimeResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `animes` | 否 | `array<SearchAnimeDetails>` | 作品列表 |

## SearchAnimeDetails

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品ID |
| `bangumiId` | 否 | `string | null` | 作品ID（新） |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `type` | 否 | `oneOf<AnimeType>` | 作品类型 |
| `typeDescription` | 否 | `string | null` | 类型描述 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `startDate` | 否 | `string(date-time) | null` | 上映日期 |
| `episodeCount` | 否 | `integer(int32)` | 剧集总数 |
| `rating` | 否 | `number(decimal)` | 此作品的综合评分（0-10） |
| `isFavorited` | 否 | `boolean` | 当前用户是否已关注此作品 |

## SearchEpisodesResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `hasMore` | 否 | `boolean` | 是否有更多未显示的搜索结果。当返回的搜索结果过多时此值为`true` |
| `animes` | 否 | `array<SearchEpisodesAnime>` | 搜索结果（作品信息）列表 |

## SearchEpisodesAnime

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `type` | 否 | `oneOf<AnimeType>` | 作品类型 |
| `typeDescription` | 否 | `string | null` | 类型描述 |
| `episodes` | 否 | `array<SearchEpisodeDetails>` | 此作品的剧集列表 |

## SearchEpisodeDetails

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `episodeId` | 否 | `integer(int64)` | 剧集ID（弹幕库编号） |
| `episodeTitle` | 否 | `string | null` | 剧集标题 |

## SearchBangumiResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `bangumis` | 否 | `array<SearchBangumiDetails>` | 搜索结果 |

## SearchBangumiDetails

- 类型：`SearchAnimeDetails & object`
- 组合：`SearchAnimeDetails` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品ID |
| `bangumiId` | 否 | `string | null` | 作品ID（新） |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `type` | 否 | `oneOf<AnimeType>` | 作品类型 |
| `typeDescription` | 否 | `string | null` | 类型描述 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `startDate` | 否 | `string(date-time) | null` | 上映日期 |
| `episodeCount` | 否 | `integer(int32)` | 剧集总数 |
| `rating` | 否 | `number(decimal)` | 此作品的综合评分（0-10） |
| `isFavorited` | 否 | `boolean` | 当前用户是否已关注此作品 |
| `rank` | 否 | `integer(int32)` | 搜索结果中的排名，用于界面中排序展示，从1开始递增 |
| `searchKeyword` | 否 | `string | null` | 搜索关键词 |
| `isOnAir` | 否 | `boolean` | 是否正在连载中 |
| `isRestricted` | 否 | `boolean` | 是否为限制级别的内容（例如属于R18分级） |
| `intro` | 否 | `string | null` | 短简介（剧情简介或Staff简介） |

## SearchAdvancedConfigResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `types` | 否 | `array<ConfigKey>` | 类型列表 |
| `tags` | 否 | `array<ConfigKey>` | 可用标签列表 |
| `sorts` | 否 | `array<ConfigKey>` | 排序依据 |
| `minYear` | 否 | `integer(int32)` | 搜索允许的最早年份 |
| `maxYear` | 否 | `integer(int32)` | 搜索允许的最晚年份 |

## ConfigKey

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `key` | 否 | `integer(int32)` | 搜索中使用的值 |
| `value` | 否 | `string | null` | 用户界面上显示的文字 |

## TrendingBangumiResponse

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `summary` | 否 | `oneOf<TrendingSummary>` | 榜单元数据 |
| `bangumiList` | 否 | `array<TrendingBangumiItem>` | 榜单条目 |

## TrendingSummary

- 类型：`object`
- 说明：排行榜元数据

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `title` | 否 | `string | null` | 榜单标题 |
| `rankingType` | 否 | `string | null` | 榜单类型。hot=热播榜，rising=飙升榜，new-anime-hot=新番热播榜 |
| `period` | 否 | `string | null` | 统计周期。week=周，month=月，quarter=季度，season=季度新番，year=年度新番 |
| `scope` | 否 | `string | null` | 榜单范围。all=全站，current-season=本季新番，previous-season=上一季度新番，current-year=今年新番 |
| `dateFrom` | 否 | `string | null` | 当前统计开始日期（服务器时区） |
| `dateTo` | 否 | `string | null` | 当前统计结束日期（服务器时区） |
| `compareDateFrom` | 否 | `string | null` | 对比统计开始日期（仅飙升榜有效） |
| `compareDateTo` | 否 | `string | null` | 对比统计结束日期（仅飙升榜有效） |
| `latestDataDate` | 否 | `string | null` | 当前可用的最新完整数据日期 |

## TrendingBangumiItem

- 类型：`BangumiIntro & object`
- 组合：`BangumiIntro` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `animeId` | 否 | `integer(int64)` | 作品编号 |
| `bangumiId` | 否 | `string | null` | 作品ID（新） |
| `animeTitle` | 否 | `string | null` | 作品标题 |
| `imageUrl` | 否 | `string | null` | 海报图片地址 |
| `searchKeyword` | 否 | `string | null` | 搜索关键词 |
| `isOnAir` | 否 | `boolean` | 是否正在连载中 |
| `airDay` | 否 | `integer(int32)` | 周几上映，0代表周日，1-6代表周一至周六 |
| `isFavorited` | 否 | `boolean` | 当前用户是否已关注（无论是否为已弃番等附加状态） |
| `isRestricted` | 否 | `boolean` | 是否为限制级别的内容（例如属于R18分级） |
| `rating` | 否 | `number(decimal)` | 番剧综合评分（综合多个来源的评分求出的加权平均值，0-10分） |
| `rank` | 否 | `integer(int32)` | 当前排名 |
| `heat` | 否 | `string | null` | 当前统计周期内的脱敏热度值 |
| `activeDays` | 否 | `integer(int32)` | 当前周期内有热度的天数 |
| `previousHeat` | 否 | `string | null` | 对比周期脱敏热度值（仅飙升榜有效） |
| `heatDelta` | 否 | `string | null` | 当前周期与对比周期的脱敏热度差值（仅飙升榜有效） |
| `heatGrowthRate` | 否 | `string | null` | 热度增长率文本（仅飙升榜有效） |

## UserUpdateProfileResponseV2

- 类型：`ResponseBase & object`
- 组合：`ResponseBase` & `object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `errorCode` | 否 | `integer(int32)` | 错误代码，0表示没有发生错误，非0表示有错误，详细信息会包含在errorMessage属性中 |
| `success` | 否 | `boolean` | 接口是否调用成功 |
| `errorMessage` | 否 | `string | null` | 当发生错误时，说明错误具体原因 |
| `errorDetail` | 否 | `string | null` | 当参数校验失败时，提供可供调用方定位问题字段的补充信息。 |
| `updateScreenName` | 否 | `string | null` |  |
| `updateProfileImage` | 否 | `string | null` |  |

## UserUpdatePasswordRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `oldPassword` | 是 | `string` | 旧密码（5-20位）；最短 `5`；最长 `20` |
| `newPassword` | 是 | `string` | 新密码（5-20位）；最短 `5`；最长 `20` |

## UserUpdateProfileRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `screenName` | 否 | `string | null` | 用户新的昵称（留空将不修改昵称）；最短 `0`；最长 `50` |
| `profileImageBase64` | 否 | `string | null` | 用户头像图片使用Base64编码后的数据（jpg格式，长度不能超过1MB）。留空将不修改头像图片 |

## UserUpdateEmailRequest

- 类型：`object`

| 字段 | 必填 | 类型 | 说明与约束 |
|---|---:|---|---|
| `oldEmail` | 是 | `string` | 当前的关联邮箱地址；最短 `1` |
| `newEmail` | 是 | `string` | 新的关联邮箱地址；最短 `1` |
