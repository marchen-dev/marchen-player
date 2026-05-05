## 动机

弹幕加载流程存在三个问题需要一并解决：

1. **dandanplay API 变更**：2026年4月起 `/api/v2/related` 和 `/api/v2/extcomment` 已下线，需迁移至 `/api/v2/comment/{episodeId}?withRelated=true`。
2. **react-query 滥用导致缓存地狱**：加载流程用 useQuery/useQueries 模拟命令式 pipeline，动态 queryKey + gcTime:0 导致 key 频繁变化、异常刷新。
3. **Loading UI 异常**：daisyui 移除后 stepper 样式失效，需要用纯 Tailwind 重写。

三个问题高度耦合——API 合并后不再需要两阶段请求，react-query 的复杂编排也就没有存在的必要了。

## 变更内容

- 迁移弹幕 API：删除 related/extcomment 调用，统一使用 `withRelated=true` 一次请求获取所有弹幕
- 重写加载流程：移除 react-query，改为 async pipeline + jotai atom 管理状态
- 简化弹幕数据模型：不再区分第三方弹幕源，统一为 `auto` | `local` 两种类型
- 重写 Loading UI：水平 stepper 用纯 Tailwind 实现
- 调整 query-client 全局配置：为保留 react-query 的场景设置合理的 gcTime/staleTime
- 删除客户端繁简转换：统一由服务端 chConvert 参数处理
- 删除第三方 URL 手动导入功能（API 已下线），保留本地弹幕文件导入

## 能力

### 新增能力

- `danmaku-pipeline`：async 加载 pipeline，替代原有的 react-query 编排
- `loading-stepper-ui`：纯 Tailwind 水平 stepper 组件

### 修改能力

- `danmaku-data-model`：DB_Danmaku schema 简化 + 数据库迁移
- `danmaku-settings`：播放中弹幕设置面板适配新数据结构

## 影响范围

- API 层：`request/api/comment.ts`、`request/api/related.ts`（删除）、`request/index.ts`
- 加载流程：`loading/hooks.ts`、`loading/PlayerProvider.tsx`、`loading/Timeline.tsx`
- 播放器初始化：`initialize/hooks.tsx`
- 状态管理：`atoms/player.ts`
- 数据库：`database/schemas/history.ts`、`database/db.ts`
- 工具函数：`lib/danmaku.ts`、`lib/cht-to-chs.ts`（删除）
- 设置面板：`setting/damaku/AddDanmaku.tsx`、`setting/damaku/DanmakuSource.tsx`
- 配置：`lib/query-client.ts`
