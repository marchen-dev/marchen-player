# 弹弹play API v2 全部接口

> 官方 OpenAPI：<https://api.dandanplay.net/swagger/v2/swagger.json>  
> 快照时间：2026-08-26T18:36:50+00:00；OpenAPI `3.0.0`；35 个路径，38 个操作。

按标签、HTTP 方法、完整路径、摘要或 `operationId` 搜索。模型名在 `schemas.md` 中展开。

## 接口总览

| 分组 | 方法 | 路径 | 摘要 |
|---|---|---|---|
| 番剧 | `GET` | `/api/v2/bangumi/shin` | 获取新番列表 |
| 番剧 | `GET` | `/api/v2/bangumi/season/anime/{year}/{month}` | 获取指定季度中上映的动画番剧 |
| 番剧 | `GET` | `/api/v2/bangumi/season/anime` | 获取动画类型番剧季度的列表 |
| 番剧 | `GET` | `/api/v2/bangumi/queue/intro` | 获取近期未看番剧的列表 |
| 番剧 | `GET` | `/api/v2/bangumi/queue/details` | 获取完整版未看番剧的列表 |
| 番剧 | `GET` | `/api/v2/bangumi/{bangumiId}` | 获取番剧详情 |
| 番剧 | `GET` | `/api/v2/bangumi/{bangumiId}/comments` | 获取指定番剧的短评论/吐槽列表 |
| 番剧 | `GET` | `/api/v2/bangumi/bgmtv/{bgmtvSubjectId}` | 使用Bangumi.tv的subjectId获取番剧详情 |
| 弹幕 | `GET` | `/api/v2/comment/{episodeId}` | 获取指定弹幕库的所有弹幕 |
| 弹幕 | `POST` | `/api/v2/comment/{episodeId}` | 向指定的弹幕库发送弹幕 |
| 弹幕 | `POST` | `/api/v2/comment/{episodeId}/app` | 向指定弹幕库发送弹幕（开放弹幕网络） |
| 弹幕 | `DELETE` | `/api/v2/comment/app/{episodeId}/{cid}` | 删除一条应用弹幕（开放弹幕网络） |
| 关注 | `GET` | `/api/v2/favorite` | 获取当前用户关注的所有动画作品 |
| 关注 | `POST` | `/api/v2/favorite` | 添加关注 |
| 关注 | `DELETE` | `/api/v2/favorite/{animeId}` | 取消关注 |
| 首页 | `GET` | `/api/v2/homepage` | 获取整合后的首页数据 |
| 首页 | `GET` | `/api/v2/homepage/banner` | 获取系统公告 |
| 登录 | `POST` | `/api/v2/login` | 使用用户名密码登录 |
| 登录 | `GET` | `/api/v2/login/renew` | 延长已有Token的有效时间 |
| 文件识别 | `POST` | `/api/v2/match` | 使用指定的文件名、Hash、文件长度信息寻找文件可能对应的节目信息。 |
| 文件识别 | `POST` | `/api/v2/match/batch` | 使用指定的文件信息批量匹配节目信息 |
| 播放历史 | `GET` | `/api/v2/playhistory` | 获取用户播放历史 |
| 播放历史 | `POST` | `/api/v2/playhistory` | 增加播放历史记录和评分 |
| 注册 | `POST` | `/api/v2/register` | 注册新的弹弹play用户 |
| 注册 | `POST` | `/api/v2/register/resetpassword` | 重置用户密码 |
| 注册 | `POST` | `/api/v2/register/findmyid` | 查找邮箱对应的用户名 |
| 搜索 | `GET` | `/api/v2/search/anime` | 根据关键词搜索作品 |
| 搜索 | `GET` | `/api/v2/search/tmdb` | 根据关键词搜索TMDB中的作品 |
| 搜索 | `GET` | `/api/v2/search/episodes` | 根据关键词搜索所有匹配的剧集信息 |
| 搜索 | `GET` | `/api/v2/search/tag` | 根据标签搜索最匹配的作品 |
| 搜索 | `GET` | `/api/v2/search/adv/config` | 获取高级搜索默认配置 |
| 搜索 | `GET` | `/api/v2/search/adv` | 高级搜索 |
| 排行榜 | `GET` | `/api/v2/trending/all/hot/{period}` | 获取全站热播榜 |
| 排行榜 | `GET` | `/api/v2/trending/all/rising/{period}` | 获取全站飙升榜 |
| 排行榜 | `GET` | `/api/v2/trending/new-anime/hot/{scope}` | 获取新番热播榜 |
| 用户 | `POST` | `/api/v2/user/password` | 为已登录用户修改密码 |
| 用户 | `POST` | `/api/v2/user/profile` | 修改用户资料（昵称、头像等） |
| 用户 | `POST` | `/api/v2/user/email` | 为已登录用户修改关联邮箱 |

## 番剧

### `GET /api/v2/bangumi/shin`

- 摘要：获取新番列表
- `operationId`：`Bangumi_GetShinBangumi`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取官方的新番列表 ### 所需权限 当未提供jwt token时，将认为是匿名用户，返回的番剧列表中`isFavorited`始终为`false`。 当提供jwt token时（登录状态），返回的番剧列表中将按照当前用户对番剧关注状态设定`isFavorited`值。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `filterAdultContent` | query | 否 | `boolean` | 是否过滤成人内容；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiListResponse` |

### `GET /api/v2/bangumi/season/anime/{year}/{month}`

- 摘要：获取指定季度中上映的动画番剧
- `operationId`：`Bangumi_GetSeasonBangumiOfAnime`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取指定季度中上映的动画番剧列表。 ## 参数说明 Url中的`year`与`month`参数需要先通过`/season/anime`接口获取。 例如2018年只有1、4、7、10四个季度，如果`month`的值不为此四个数字之一将无法获取到对应季度的番剧。 ### 所需权限 当未提供jwt token时，将认为是匿名用户，返回的番剧列表中`isFavorited`始终为`false`。 当提供jwt token时（登录状态），返回的番剧列表中将按照当前用户对番剧关注状态设定`isFavorited`值。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `year` | path | 是 | `integer(int32)` | 年份 |
| `month` | path | 是 | `integer(int32)` | 季度月份（一般指1、4、7、10） |
| `filterAdultContent` | query | 否 | `boolean` | 是否过滤成人内容；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiListResponse` |

### `GET /api/v2/bangumi/season/anime`

- 摘要：获取动画类型番剧季度的列表
- `operationId`：`Bangumi_GetSeasons`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

参数：无。

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiSeasonListResponse` |

### `GET /api/v2/bangumi/queue/intro`

- 摘要：获取近期未看番剧的列表
- `operationId`：`Bangumi_GetQueueIntro`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用户获取用户近期关注但未看/未看完的番剧的列表。 ### 权限需求 此接口需要登录状态才可调用。

参数：无。

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiQueueIntroResponseV2` |

### `GET /api/v2/bangumi/queue/details`

- 摘要：获取完整版未看番剧的列表
- `operationId`：`Bangumi_GetQueueDetails`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用户获取用户完整的未看完的番剧的列表。 ### 权限需求 此接口需要登录状态才可调用。

参数：无。

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiQueueDetailsResponseV2` |

### `GET /api/v2/bangumi/{bangumiId}`

- 摘要：获取番剧详情
- `operationId`：`Bangumi_GetBangumiDetails`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取指定编号的作品的详细数据，包括简介、评分、详细剧集等。 ### 参数说明 `bangumiId`：支持传入数字形式的 animeId（如 18319）或字符串形式的 bangumiId（如 "tmdb-movie-21832"）。 ### 所需权限 此接口无需登录状态即可调用。当提供了token时，返回的剧集列表中将包含当前用户的上次播放时间。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `bangumiId` | path | 是 | `string` | 作品编号 |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiDetailsResponse` |

### `GET /api/v2/bangumi/{bangumiId}/comments`

- 摘要：获取指定番剧的短评论/吐槽列表
- `operationId`：`Bangumi_GetBangumiComments`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取指定作品的用户短评论/吐槽列表。 ### 参数说明 `bangumiId`：支持传入数字形式的 animeId（如 18319）或字符串形式的 bangumiId（如 "tmdb-movie-21832"）。 `page`：页码，从0开始。每页固定返回最新20条评论，最多支持到第9页。 ### 所需权限 此接口无需登录状态即可调用。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `bangumiId` | path | 是 | `string` | 作品编号 |
| `page` | query | 否 | `integer(int32)` | 页码，从0开始，最大为9；默认 `0` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiCommentsResponse` |

### `GET /api/v2/bangumi/bgmtv/{bgmtvSubjectId}`

- 摘要：使用Bangumi.tv的subjectId获取番剧详情
- `operationId`：`Bangumi_GetBangumiDetailsByBgmtvSubjectId`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于通过Bangumi.tv的subjectId获取番剧详情。 弹弹play和Bangumi.tv番剧条目间的映射关系由人工维护，可能会出现错误、缺失、变动或延迟更新的情况，在使用时请注意。 ### 参数说明 `bgmtvSubjectId`：Bangumi.tv 的 subjectId，通常是一个整数。例如，网址 https://bangumi.tv/subject/975 中的 `975` 就是subjectId。 ### 返回值说明 此接口返回和接口 `/bangumi/{bangumiId}` 相同的结构，包含番剧的详细信息。 当没有找到对应的番剧时，会返回资源未找到错误，bangumi字段将为null。 ### 所需权限 此接口无需登录状态即可调用。当提供了token时，返回的剧集列表中将包含当前用户的上次播放时间。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `bgmtvSubjectId` | path | 是 | `integer(int32)` | Bangumi.tv的subjectId |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BangumiDetailsResponse` |

## 弹幕

### `GET /api/v2/comment/{episodeId}`

- 摘要：获取指定弹幕库的所有弹幕
- `operationId`：`Comment_GetComment`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取服务器上指定弹幕库的弹幕。获取到的弹幕包括弹弹play官方弹幕、第三方网站关联弹幕和开放弹幕网络应用发送的弹幕。 ### withRelated 参数 当`withRelated`参数为`true`时，接口将会返回此弹幕库对应的所有第三方关联网址的弹幕。推荐使用此参数获取整合后的弹幕。 ### 接口跳转 在调用此接口时，将会跳转到弹幕加速服务上获取弹幕。返回的状态码为302，Location头部包含了跳转的地址。 ### 开放弹幕网络应用 当应用使用 `POST /comment/{episodeId}/app` 接口发送弹幕后，再使用此接口获取弹幕时，返回的弹幕中将包含本应用发送的弹幕。 不同应用发送的弹幕将分别存储在不同的私有弹幕库中，互不干扰。 ### 返回值 字段`p`的说明：格式为`出现时间,模式,颜色,用户ID`，各个值之间使用英文逗号分隔 * 弹幕出现时间：格式为 0.00，单位为秒，精确到小数点后两位，例如12.34、445.6、789.01 * 弹幕模式：1-普通弹幕，4-底部弹幕，5-顶部弹幕 * 颜色：32位整数表示的颜色，算法为 Rx256x256+Gx256+B，R/G/B的范围应是0-255 * 用户ID：字符串形式表示的用户ID，通常为数字，不会包含特殊字符

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `episodeId` | path | 是 | `integer(int64)` | 弹幕库编号 |
| `from` | query | 否 | `integer(int64)` | 起始弹幕编号，忽略此编号以前的弹幕。默认值为`0`。；默认 `0` |
| `withRelated` | query | 否 | `boolean` | 是否同时获取关联的第三方弹幕。默认值为`false`，推荐使用`true`。；默认 `false` |
| `chConvert` | query | 否 | `integer(int32)` | 中文简繁转换。`0`-不转换，`1`-转换为简体，`2`-转换为繁体。；默认 `0` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `302` | 跳转到弹幕加速服务获取弹幕 | `application/json` → `CommentResponseV2` |

### `POST /api/v2/comment/{episodeId}`

- 摘要：向指定的弹幕库发送弹幕
- `operationId`：`Comment_SendComment`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于弹弹play客户端向服务器的指定弹幕库发送弹幕。 第三方开发者请使用 `/comment/{episodeId}/app` 接口发送弹幕。 ### 权限需求 此接口需要用户登录后才可使用

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `episodeId` | path | 是 | `integer(int64)` | 弹幕库ID |

请求体（必填）：

- `application/json`：`SendCommentRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回发送弹幕的结果 | `application/json` → `SendCommentResponseV2` |
| `401` | 未登录 | 未声明 |

### `POST /api/v2/comment/{episodeId}/app`

- 摘要：向指定弹幕库发送弹幕（开放弹幕网络）
- `operationId`：`Comment_SendAppComment`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于开放弹幕网络第三方应用开发者向指定弹幕库发送弹幕。 调用方通过 AppId/AppSecret 鉴权，可自行设置用户名，弹幕将与官方弹幕分开存储。 应用使用此接口发送弹幕后，使用 `GET /comment/{episodeId}` 接口获取弹幕时，返回的弹幕中将包含本应用发送的弹幕。 不同应用发送的弹幕将分别存储在不同的私有弹幕库中，互不干扰。 ### 权限说明 当前只有`社区合作`和`商业授权`层级的应用有此接口完整额度。其他层级的应用也可以调用此接口，但额度仅限于测试使用。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `episodeId` | path | 是 | `integer(int64)` | 弹幕库ID |

请求体（可选）：

- `application/json`：`SendAppCommentRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SendCommentResponseV2` |
| `401` |  | 未声明 |

### `DELETE /api/v2/comment/app/{episodeId}/{cid}`

- 摘要：删除一条应用弹幕（开放弹幕网络）
- `operationId`：`Comment_DeleteAppComment`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于删除开放弹幕网络应用发送的弹幕。删除后弹幕将从弹幕库中移除，不再被客户端获取到。 弹幕所属应用由调用方的AppId决定，调用方只能删除**自己应用**发送的弹幕。 ### 鉴权方式 * 必须携带应用凭证：`X-AppId` + `X-Signature` + `X-Timestamp` 签名模式，或 `X-AppId` + `X-AppSecret` 客户端凭证模式 ### 返回说明 删除成功时`errorCode`为`0`。当弹幕不存在、已被删除或不属于当前应用时，返回`errorCode=7`（ResourceNotFound）。 删除操作是异步生效的，客户端弹幕缓存可能存在数秒的延迟。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `episodeId` | path | 是 | `integer(int64)` | 弹幕库编号 |
| `cid` | path | 是 | `integer(int64)` | 弹幕编号，即发送弹幕接口返回的`cid` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回删除结果 | `application/json` → `ResponseBase` |

## 关注

### `GET /api/v2/favorite`

- 摘要：获取当前用户关注的所有动画作品
- `operationId`：`Favorite_GetUserFavorite`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取用户当前关注的所有动画作品信息 ### 权限需求 此接口需要登录状态才能调用

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `onlyOnAir` | query | 否 | `boolean` | 只返回正在连载的作品；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回用户关注的作品列表 | `application/json` → `UserFavoriteResponse` |
| `401` | 未登录 | 未声明 |

### `POST /api/v2/favorite`

- 摘要：添加关注
- `operationId`：`Favorite_AddFavorite`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于为用户增加关注某一部作品。 ### 权限需求 此接口需要登录状态才能调用，同时应用应拥有添加关注的权限。

参数：无。

请求体（必填）：

- `application/json`：`UserAddFavoriteRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回添加关注的结果 | `application/json` → `UserAddFavoriteResponse` |
| `401` | 未登录 | 未声明 |

### `DELETE /api/v2/favorite/{animeId}`

- 摘要：取消关注
- `operationId`：`Favorite_DeleteFavorite`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于为用户取消关注某一部作品。 ### 权限需求 此接口需要登录状态才能调用，同时应用应拥有取消关注的权限。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `animeId` | path | 是 | `integer(int64)` | 作品编号 |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回取消关注的结果 | `application/json` → `UserDeleteFavoriteResponse` |
| `401` | 未登录 | 未声明 |

## 首页

### `GET /api/v2/homepage`

- 摘要：获取整合后的首页数据
- `operationId`：`Homepage_GetHomepage`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于一次性获取系统公告、未看剧集列表、当季新番列表、热门种子等接口的数据，并合并为同一个文档进行返回。 ### 权限需求 当未提供jwt token时，将认为是匿名用户，返回的番剧列表中`isFavorited`始终为`false`。 当提供jwt token时（登录状态），返回的番剧列表中将按照当前用户对番剧关注状态设定`isFavorited`值。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `filterAdultContent` | query | 否 | `boolean` | 是否过滤可能出现的成人内容；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `HomepageResponseV2` |

### `GET /api/v2/homepage/banner`

- 摘要：获取系统公告
- `operationId`：`Homepage_GetBanner`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

参数：无。

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BannerResponse` |

## 登录

### `POST /api/v2/login`

- 摘要：使用用户名密码登录
- `operationId`：`Login_Login`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 通过此接口可以使用用户名/密码获取到后续接口需要的JWT Token。 调用此接口需要有应用的AppId与AppSecret，您可以联系弹弹play开发方申请。 ### Hash计算方法 Hash属性的计算方法为，将登录请求中 `appId` `password` `unixTimestamp` `userName` 属性的值以及您应用的 `AppSecret` 密钥的值依次拼接起来， 计算出32位MD5（不区分大小写）。举例来说，`appId`为`dandanplay`，AppSecret为`FFFFF`，用户名为`test1`，密码为`test2`， 那么计算方法将会是 `hash=MD5(dandanplaytest2666666666test1FFFFF)`。 ### 错误代码 当调用接口发生错误时，例如参数不完整、验证错误、登录失败，`success`属性值将为`false`，`errorCode`代码将不为`0`， 同时`errorMessage`属性将包含错误的描述信息 。

参数：无。

请求体（必填）：

- `application/json`：`LoginRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `LoginResponse` |

### `GET /api/v2/login/renew`

- 摘要：延长已有Token的有效时间
- `operationId`：`Login_RenewToken`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 默认情况下Token的有效期为21天，此接口用于在此期间延长一个有效的JWT Token的有效时间。 ### 权限需求 此接口需要登录后才可使用（请求中包含Authorization头） ### 返回值说明 调用此接口后相当于重新使用当前用户的信息进行重新登录，将会返回最新的用户信息（包括已延长有效期的JWT Token）。 如果应用或用户的状态异常，将会返回相应的错误代码。

参数：无。

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回Token刷新后的用户信息 | `application/json` → `LoginResponse` |
| `401` | 未提供有效的Token | 未声明 |

## 文件识别

### `POST /api/v2/match`

- 摘要：使用指定的文件名、Hash、文件长度信息寻找文件可能对应的节目信息。
- `operationId`：`Match_Match`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于当用户打开某视频文件时，可以通过文件名称、Hash等信息查找此视频可能对应的节目信息。 此接口首先会使用Hash信息进行搜寻，如果有相应的记录，会返回“精确关联”的结果（即`isMatched`属性为`true`，此时列表中只包含一个搜索结果）。 如果Hash信息匹配失败，则会继续通过文件名进行模糊搜寻。 ### 返回值说明 一个包含节目信息的列表，节目在列表中排名越靠前，这个节目越有可能是视频文件的内容。 当列表中只有一个节目时（`isMatched`属性为`true`），视为“精确关联” —— 说明此视频已被人工关联了某一节目。客户端应自动选择这个唯一的结果，不必再让用户做出选择。

参数：无。

请求体（必填）：

- `application/json`：`MatchRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `MatchResponseV2` |

### `POST /api/v2/match/batch`

- 摘要：使用指定的文件信息批量匹配节目信息
- `operationId`：`Match_BatchMatch`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于批量匹配（参考`/match`接口），可以通过Hash、文件名称等信息查找多个视频对应的节目信息。 每次批量匹配提供的文件信息不能多于`32`个，文件信息中不能有重复项。 此接口只会返回“精确关联”的结果，如果文件未能成功匹配上一个弹幕库，对应匹配结果的`success`将为`false`。 ### 返回值说明 一个包含匹配结果的列表，将与请求中的文件信息一一对应。例如请求中包含了20个文件信息，返回结果的列表中也将包含20个匹配结果。 如果某个文件匹配成功，对应结果的`success`属性将为`true`。如果某文件未匹配成功，或是某个请求未通过验证，对应结果的`success`属性将为`false`。

参数：无。

请求体（必填）：

- `application/json`：`BatchMatchRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `BatchMatchResponse` |

## 播放历史

### `GET /api/v2/playhistory`

- 摘要：获取用户播放历史
- `operationId`：`PlayHistory_GetUserPlayHistory`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于获取用户的播放历史（作品+剧集）。只能获取到用户已关注作品的播放历史。 ### 权限需求 此接口需要登录状态才可以调用。 ### 开始结束日期参数说明 开始日期不能晚于结束日期； 开始日期与结束日期不能相差大于一年（最多查询一年的数据）； 当没有提供`toDate`参数时，默认将使用当前日期； 当没有提供`fromDate`参数时，默认将使用`toDate`减去三个月的日期。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `fromDate` | query | 否 | `string(date-time) | null` | 开始日期 |
| `toDate` | query | 否 | `string(date-time) | null` | 结束日期 |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回用户播放历史 | `application/json` → `UserPlayHistoryResponse` |
| `401` | 未登录 | 未声明 |

### `POST /api/v2/playhistory`

- 摘要：增加播放历史记录和评分
- `operationId`：`PlayHistory_AddPlayHistory`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于提交用户的播放历史数据，同时可以更新用户对某剧集的评分。 ### 权限需求 此接口需要登录权限才可以调用。 ### 参数限制说明 接口支持单个或批量增加历史数据。 提交的请求中，如果`episodeIdList`数组只包含一条数据，则`addToFavorite`参数（关注此作品）和`rating`参数（更新评分）可以生效。 如果`episodeIdList`数组包含不止一条数据，则会忽略`addToFavorite`和`rating`参数。 在批量添加历史记录时，`episodeIdList`数组最多只能包含100条数据，而且其中的episodeId必须全部属于同一部作品。

参数：无。

请求体（必填）：

- `application/json`：`UserAddPlayHistoryRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回播放历史添加结果 | `application/json` → `UserAddPlayHistoryResponse` |
| `401` | 未登录 | 未声明 |

## 注册

### `POST /api/v2/register`

- 摘要：注册新的弹弹play用户
- `operationId`：`Register_RegisterMainUser`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 通过此接口可以注册新的弹弹play用户，注册成功后将返回登录结果。 调用此接口需要有应用的AppId与AppSecret，您可以联系弹弹play开发方申请。 ### Hash计算方法 Hash属性的计算方法为，将登录请求中 `appId` `email` `password` `screenName` `unixTimestamp` `userName` 属性的值加上您应用的 `AppSecret` 密钥的值按顺序拼接起来， 计算出32位MD5（不区分大小写）。举例来说，`appId`为`dandanplay`，AppSecret为`FFFFF`，用户名为`test1`，密码为`test2`，邮箱为`test3@example.com`，昵称为`弹弹` 那么计算方法将会是 `hash=MD5(dandanplaytest3@example.comtest2弹弹666666666test1FFFFF)`。 ### 错误代码 当调用接口发生错误时，例如参数不完整、验证错误、登录失败，`success`属性值将为`false`，`errorCode`代码将不为`0`， 同时`errorMessage`属性将包含错误的描述信息 。

参数：无。

请求体（必填）：

- `application/json`：`RegisterRequestV2`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `LoginResponse` |

### `POST /api/v2/register/resetpassword`

- 摘要：重置用户密码
- `operationId`：`Register_ResetPassword`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 通过此接口可以重置一个用户的密码至随机密码，重置成功后新的随机密码将会发送到对应的邮箱中。 调用此接口需要有应用的AppId与AppSecret，您可以联系弹弹play开发方申请。 ### 请求说明 请求参数中`userName`和`email`必须和注册时的信息完全一致，方能成功重置。 重置密码的请求每2分钟只能发送一次，否则会返回错误信息。 ### Hash计算方法 Hash属性的计算方法为，将登录请求中 `appId` `email` `unixTimestamp` `userName` 属性的值加上您应用的 `AppSecret` 密钥的值按顺序拼接起来， 计算出32位MD5（不区分大小写）。举例来说，`appId`为`dandanplay`，AppSecret为`FFFFF`，用户名为`test1`，邮箱为`test3@example.com`， 那么计算方法将会是 `hash=MD5(dandanplaytest3@example.com666666666test1FFFFF)`。 ### 错误代码 当调用接口发生错误时，例如参数不完整、验证错误、登录失败，`success`属性值将为`false`，`errorCode`代码将不为`0`， 同时`errorMessage`属性将包含错误的描述信息 。

参数：无。

请求体（必填）：

- `application/json`：`ResetPasswordRequestV2`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `ResetPasswordResponseV2` |

### `POST /api/v2/register/findmyid`

- 摘要：查找邮箱对应的用户名
- `operationId`：`Register_FindMyId`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 通过此接口可以查找一个指定邮箱对应的用户名，查找结果将会发送到对应的邮箱中。 调用此接口需要有应用的AppId与AppSecret，您可以联系弹弹play开发方申请。 ### 请求说明 请求参数中`email`必须和注册时的信息完全一致，方能查找成功。 查找用户名的请求每`10`分钟只能发送一次，否则会返回错误信息。 ### Hash计算方法 Hash属性的计算方法为，将登录请求中 `appId` `email` `unixTimestamp` 属性的值加上您应用的 `AppSecret` 密钥的值按顺序拼接起来， 计算出32位MD5（不区分大小写）。举例来说，`appId`为`dandanplay`，AppSecret为`FFFFF`，邮箱为`test3@example.com`， 那么计算方法将会是 `hash=MD5(dandanplaytest3@example.com666666666FFFFF)`。 ### 错误代码 当调用接口发生错误时，例如参数不完整、验证错误、登录失败，`success`属性值将为`false`，`errorCode`代码将不为`0`， 同时`errorMessage`属性将包含错误的描述信息 。

参数：无。

请求体（必填）：

- `application/json`：`FindMyIdRequestV2`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `FindMyIdResponse` |

## 搜索

### `GET /api/v2/search/anime`

- 摘要：根据关键词搜索作品
- `operationId`：`Search_SearchAnime`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 根据用户提供的关键词，在弹弹play数据库中搜索对应的作品信息，搜索结果中不包含剧集信息。 ### 权限需求 不需要登录状态即可使用 ### 关键词说明 * 关键词长度至少为`2`。 * 关键词中的空格将被认定为 AND 条件，其他字符将被作为原始字符去搜索。 * 可以通过中文、日文、罗马音、英文等条件对作品的别名进行搜索，繁体中文关键词将被统一为简体中文。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `keyword` | query | 否 | `string` | 作品标题关键词。 |
| `type` | query | 否 | `oneOf<oneOf<AnimeType>>` | 可选的作品类型。 |
| `v2` | query | 否 | `boolean` | 提供 true 时使用新版搜索引擎。默认为`false`。；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SearchAnimeResponse` |

### `GET /api/v2/search/tmdb`

- 摘要：根据关键词搜索TMDB中的作品
- `operationId`：`Search_SearchTmdb`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 根据用户提供的关键词，在TMDB数据库中搜索作品，搜索结果中不包含剧集信息。 ### 权限需求 不需要登录状态即可使用 ### 关键词说明 * 关键词长度至少为`2`。 * 可以通过中文、日文、罗马音、英文等条件对作品的别名进行搜索。 ### 返回结果 返回结果中将包含TMDB电视剧和电影的搜索结果。电视剧结果排列在前，电影将排列在后。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `keyword` | query | 否 | `string` |  |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SearchAnimeResponse` |

### `GET /api/v2/search/episodes`

- 摘要：根据关键词搜索所有匹配的剧集信息
- `operationId`：`Search_SearchEpisodes`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于根据关键词搜索所有匹配的剧集信息。 当自动匹配失败或结果不理想时可以调用此接口，让用户手动通过关键词搜索到作品。 ### 参数说明 - anime：作品标题。支持通过中文、日语（含罗马音）、英语搜索，至少为2个字符。 - tmdbId：使用 TMDB 电视剧 ID 搜索作品，如果指定此参数，将仅返回此 TMDB TV ID 的关联作品（可能有多个）。 - tmdbIdType: 指定 tmdbId 的类型，0或不提供表示tmdbId为电视剧ID，1表示tmdbId为电影ID。 - episode：剧集编号，默认为空。支持正整数或 C1/S1/O1 格式，将仅保留指定集数的结果；其他值将被忽略。 - v2：提供 true 时使用新版搜索引擎。 必须提供`anime`和`tmdbId`中至少一个参数。 当同时提供`anime`和`tmdbId`参数时，会先尝试使用`anime`参数进行搜索，之后在搜索结果中匹配`tmdbId`的剧集。 ### 参数注意事项 * 参数可以包含空格，但空格将作为查询字符串的一部分而不是传统的“OR”查询。 * 未提供`episode`参数的情况下，如果`anime`参数中包含空格，且空格后为数字（如“EVA 10”），此数字将被认定为是`episode`参数。 * 如果参数中包含特殊字符，需要经过Url编码后才能传递。 ### 返回值说明 接口将返回包含节目信息的列表，当结果集过大时，`hasMore`属性为`true`，这时客户端应该提示用户填写更详细的信息以缩小搜索范围。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `anime` | query | 否 | `string | null` | 作品标题。支持通过中文、日语（含罗马音）、英语搜索，至少为2个字符。 |
| `tmdbId` | query | 否 | `integer(int32) | null` | TMDB ID，如果指定此参数，将仅返回此 TMDB ID 的关联作品（可能有多个）。 |
| `tmdbIdType` | query | 否 | `integer(int32)` | 指定 tmdbId 的类型，0或不提供表示tmdbId为电视剧ID，1表示tmdbId为电影ID。；默认 `0` |
| `episode` | query | 否 | `string | null` | 剧集编号，默认为空。支持正整数或 C1/S1/O1 格式，将仅保留指定集数的结果。 其他值将被忽略。 |
| `v2` | query | 否 | `boolean` | 提供 true 时使用新版搜索引擎。默认为`false`。；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SearchEpisodesResponse` |
| `401` |  | 未声明 |

### `GET /api/v2/search/tag`

- 摘要：根据标签搜索最匹配的作品
- `operationId`：`Search_SearchAnimeByTag`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 根据用户提供的标签列表搜索到对应的作品信息，搜索结果中不包含剧集信息。 ### 权限需求 不需要登录状态即可使用。返回中的`isFavorited`属性目前都为`false`。 ### 返回值 将返回根据提供的标签列表最匹配的作品列表。 ### 标签说明 支持查询多个标签，标签之间用英文逗号分隔。每个标签的长度不超过50个字符。标签数量不超过10个。 标签将区分大小写，且不支持模糊查询。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `tags` | query | 否 | `string` | 标签列表。 |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SearchBangumiResponse` |

### `GET /api/v2/search/adv/config`

- 摘要：获取高级搜索默认配置
- `operationId`：`Search_GetSearchAdvConfig`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 获取高级搜索功能所需的配置项，用于初始化客户端搜索界面。例如类别、标签等。 ### 权限需求 不需要登录状态即可使用。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `source` | query | 否 | `string | null` | 默认 `"anidb"` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SearchAdvancedConfigResponse` |

### `GET /api/v2/search/adv`

- 摘要：高级搜索
- `operationId`：`Search_SearchAdvanced`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `source` | query | 否 | `string | null` | 数据源。anidb\|tmdb。默认为anidb；默认 `"anidb"` |
| `keyword` | query | 否 | `string | null` | 作品标题关键词 |
| `type` | query | 否 | `integer(int32) | null` | 作品类型 |
| `tags` | query | 否 | `string | null` | 标签，一个或多个数字。若填写多个数字请用英文逗号隔开，例如 12,34,56 。设定多个数字时将搜索同时包含这些标签的作品。 |
| `year` | query | 否 | `integer(int32) | null` | 限定作品上映的年份 |
| `month` | query | 否 | `integer(int32) | null` | 限定年份前提下继续限定作品月份 |
| `minRate` | query | 否 | `integer(int32)` | 限定最低评分（包含）；默认 `0` |
| `maxRate` | query | 否 | `integer(int32)` | 限定最高评分（包含）；默认 `10` |
| `restricted` | query | 否 | `boolean | null` | 只显示限制级别的内容。不提供此参数则不过滤结果，提供true或false都将过滤结果。 |
| `sort` | query | 否 | `integer(int32)` | 设定排序规则；默认 `0` |
| `v2` | query | 否 | `boolean` | 提供 true 且数据源为 anidb 时使用新版搜索引擎。默认为`false`。；默认 `false` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `SearchBangumiResponse` |

## 排行榜

### `GET /api/v2/trending/all/hot/{period}`

- 摘要：获取全站热播榜
- `operationId`：`Trending_GetHotBangumi`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 返回最近一个可用统计周期内的全站热播榜数据。 ### 数据口径 榜单的热度值来自弹幕库访问计数的按日汇总结果。 ### 所需权限 当未提供 jwt token 时，将认为是匿名用户，返回的番剧列表中 `isFavorited` 始终为 `false`。 当提供 jwt token 时（登录状态），返回的番剧列表中将按照当前用户对番剧关注状态设定 `isFavorited` 值。 ### 数据出处说明 使用此榜单数据时，请注明数据来源为`弹弹play开放弹幕网络`。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `period` | path | 是 | `string` | 统计周期。可选值：week、month、quarter |
| `filterAdultContent` | query | 否 | `boolean` | 是否过滤成人内容；默认 `false` |
| `limit` | query | 否 | `integer(int32)` | 返回条目数量，默认20，最大50；默认 `20` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `TrendingBangumiResponse` |

### `GET /api/v2/trending/all/rising/{period}`

- 摘要：获取全站飙升榜
- `operationId`：`Trending_GetRisingBangumi`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 返回最近一个可用统计周期内，相比上一对应周期热度增长最快的番剧列表。 ### 数据口径 飙升榜会综合当前周期热度值与相对上一周期的热度增量计算得分，用于识别最近快速升温的作品。 ### 所需权限 当未提供 jwt token 时，将认为是匿名用户，返回的番剧列表中 `isFavorited` 始终为 `false`。 当提供 jwt token 时（登录状态），返回的番剧列表中将按照当前用户对番剧关注状态设定 `isFavorited` 值。 ### 数据出处说明 使用此榜单数据时，请注明数据来源为`弹弹play开放弹幕网络`。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `period` | path | 是 | `string` | 统计周期。可选值：week、month、quarter |
| `filterAdultContent` | query | 否 | `boolean` | 是否过滤成人内容；默认 `false` |
| `limit` | query | 否 | `integer(int32)` | 返回条目数量，默认20，最大50；默认 `20` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `TrendingBangumiResponse` |

### `GET /api/v2/trending/new-anime/hot/{scope}`

- 摘要：获取新番热播榜
- `operationId`：`Trending_GetNewAnimeHotBangumi`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 返回指定范围内的新番热播榜数据，支持本季新番、上一季度新番两种榜单。 ### 数据口径 榜单会先按作品首播时间筛选出对应范围内的新番，再根据对应统计周期内的站内热度进行排序。 ### 所需权限 当未提供 jwt token 时，将认为是匿名用户，返回的番剧列表中 `isFavorited` 始终为 `false`。 当提供 jwt token 时（登录状态），返回的番剧列表中将按照当前用户对番剧关注状态设定 `isFavorited` 值。 ### 数据出处说明 使用此榜单数据时，请注明数据来源为`弹弹play开放弹幕网络`。

参数：

| 名称 | 位置 | 必填 | 类型 | 说明与约束 |
|---|---|---:|---|---|
| `scope` | path | 是 | `string` | 榜单范围。可选值：current-season、previous-season |
| `filterAdultContent` | query | 否 | `boolean` | 是否过滤成人内容；默认 `false` |
| `limit` | query | 否 | `integer(int32)` | 返回条目数量，默认20，最大50；默认 `20` |

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` |  | `application/json` → `TrendingBangumiResponse` |

## 用户

### `POST /api/v2/user/password`

- 摘要：为已登录用户修改密码
- `operationId`：`User_UpdatePassword`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于为已经登录的用户修改当前的登录密码。 ### 权限需求 此接口需要登录后才可使用（请求中包含Authorization头）

参数：无。

请求体（必填）：

- `application/json`：`UserUpdatePasswordRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 修改密码结果 | `application/json` → `UserUpdateProfileResponseV2` |
| `401` | 未登录 | 未声明 |

### `POST /api/v2/user/profile`

- 摘要：修改用户资料（昵称、头像等）
- `operationId`：`User_UpdateProfile`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于为已经登录的用户修改当前的基本资料（如昵称、头像）。 当提供`screenName`时才更新昵称，提供`profileImageBase64`时才更新头像图片，否则不会产生变化。 ### 更新头像图片 头像图片需要转换成base64编码后放入`profileImageBase64`字段中。此字段长度不能超过1MB。 上传的图片将保留长宽比，转换为边长最长600px的长方形，并存储为jpg格式。 ### 权限需求 此接口需要登录后才可使用（请求中包含Authorization头）

参数：无。

请求体（必填）：

- `application/json`：`UserUpdateProfileRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 返回修改结果 | `application/json` → `UserUpdateProfileResponseV2` |
| `401` | 未登录 | 未声明 |

### `POST /api/v2/user/email`

- 摘要：为已登录用户修改关联邮箱
- `operationId`：`User_UpdateUserEmail`
- OpenAPI 安全声明：AppId, AppSecret, Bearer

### 接口说明 此接口用于为已经登录的用户修改当前账号关联的邮箱地址。 ### 权限需求 此接口需要登录后才可使用（请求中包含Authorization头）

参数：无。

请求体（必填）：

- `application/json`：`UserUpdateEmailRequest`

响应：

| 状态 | 说明 | 内容类型与模型 |
|---|---|---|
| `200` | 修改邮箱结果 | `application/json` → `UserUpdateProfileResponseV2` |
| `401` | 未登录 | 未声明 |
