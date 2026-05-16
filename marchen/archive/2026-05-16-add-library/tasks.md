## 1. 数据库层

- [x] 1.1 定义 `DB_Library` 和 `DB_LibraryEpisode` TypeScript 接口（`database/schemas/library.ts`）
- [x] 1.2 在 `database/constants.ts` 中添加 `TABLES.LIBRARY = 'library'`
- [x] 1.3 在 `database/db.schema.ts` 中添加 v4 schema（library 表索引定义）
- [x] 1.4 在 `database/db.ts` 中添加 `version(4)` 迁移逻辑（从 history 提取 library 记录）和 `library` 表声明

## 2. 入库逻辑

- [x] 2.1 创建 `database/lib/library-writer.ts`：封装 library 表的写入逻辑（创建/更新/幂等处理）
- [x] 2.2 改造 `services/player-loading/adapters/history-store.ts` 的 `updateBangumiData` 方法：在获取 bangumi 详情后调用 library-writer 写入
- [x] 2.3 在 `components/modules/player/initialize/Event.tsx` 的 `Events.ENDED` 处理中添加 library 观看状态更新（progress/duration > 0.9 时标记已观看）

## 3. 路由和导航

- [x] 3.1 在 `router/name.ts` 中添加 `RouteName.LIBRARY = '/library'`，移除 `RouteName.HISTORY`
- [x] 3.2 在 `router/router.tsx` 中替换 history 路由为 library 路由（更新 siderbarRoutes）
- [x] 3.3 更新 `components/modules/shared/MatchDanmakuDialog.tsx` 中的路由判断（HISTORY → LIBRARY）

## 4. 影视库列表页

- [x] 4.1 创建 `page/library/index.tsx`：页面骨架（RouterLayout + ScrollArea + 空状态）
- [x] 4.2 实现 LibraryCard 组件：海报卡片（图片、标题、进度条、连载中标签）
- [x] 4.3 实现卡片网格布局（响应式 grid）和 useLiveQuery 数据获取
- [x] 4.4 实现筛选功能（全部/连载中/已完结）和排序功能（最近观看/评分/入库时间）
- [x] 4.5 实现右键菜单（查看详情、从库中移除）

## 5. 影视库详情面板

- [x] 5.1 创建 `page/library/DetailSheet.tsx`：Sheet 面板骨架（打开/关闭状态管理）
- [x] 5.2 实现作品信息区域（海报 + 标题 + 元信息 + 标签 + 可展开简介 + 制作信息）
- [x] 5.3 实现集数列表组件（状态指示器、集号、标题、日期、点击播放）
- [x] 5.4 实现集数列表的右键菜单（重新匹配弹幕、清除弹幕缓存）
- [x] 5.5 实现从集数列表点击播放的导航逻辑（navigate with hash state）

## 6. 清理

- [x] 6.1 删除 `page/history/index.tsx`
- [x] 6.2 清理 history 页面相关的导入和引用（确保无死代码）
