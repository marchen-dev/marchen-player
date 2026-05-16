## 动机

当前应用只有"播放记录"页面，以文件为粒度展示最近播放的 30 条记录。用户无法以"作品"为单位管理自己看过的动画——不知道一部作品总共多少集、看了哪些集、还差哪些没看。

影视库功能将播放记录从"文件列表"升级为"作品管理"，让用户能：
- 一眼看到自己看过哪些作品
- 进入作品详情查看完整集数列表和观看进度
- 从详情页直接点击某集续播

数据源完全依赖弹弹play 的 bangumi API（已有调用），不引入 TMDB 等第三方 API。

## 变更内容

- 新增 IndexedDB `library` 表，存储作品级别的元数据和集数信息
- 改造 `history-store.ts` 的 `updateBangumiData` 方法，在获取 bangumi 详情后同步写入 library 表
- 新增 `/library` 路由和影视库列表页（卡片网格，展示海报、标题、观看进度）
- 新增影视库详情 Sheet（侧滑面板，展示作品信息和完整集数列表）
- 移除 `/history` 路由和播放记录页面
- 播放结束时更新 library 表的观看状态

## 能力

### 新增能力

- `library-database`：library 表的 schema 定义、数据库迁移（v3 → v4）、读写操作
- `library-ingest`：播放时自动入库逻辑，从 bangumi API 响应中提取数据写入 library 表
- `library-page`：影视库列表页 UI（卡片网格、筛选、排序）
- `library-detail-sheet`：作品详情侧滑面板（作品信息、集数列表、播放入口）

### 修改能力

- `danmaku-data-model`：history 表保留但不再有独立展示页面，MatchDanmakuDialog 的路由判断从 HISTORY 改为 LIBRARY

## 影响范围

- 数据库：`database/db.ts`、`database/db.schema.ts`、`database/schemas/`、`database/constants.ts`
- 入库逻辑：`services/player-loading/adapters/history-store.ts`
- 路由：`router/name.ts`、`router/router.tsx`
- 布局：`components/layout/sidebar/index.tsx`
- 新页面：`page/library/`（新增目录）
- 播放器事件：`components/modules/player/initialize/Event.tsx`（播放结束时更新 library）
- 共享组件：`components/modules/shared/MatchDanmakuDialog.tsx`（路由判断修改）
- 删除：`page/history/index.tsx`
