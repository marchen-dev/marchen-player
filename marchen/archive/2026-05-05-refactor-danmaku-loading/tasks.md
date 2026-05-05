## 1. 数据模型与数据库迁移

- [x] 1.1 修改 `database/schemas/history.ts`：DB_Danmaku.type 改为 `'auto' | 'local'`
- [x] 1.2 修改 `database/db.ts`：添加 version(3) 迁移，保留 local 弹幕，清空其余缓存

## 2. API 层迁移

- [x] 2.1 修改 `request/api/comment.ts`：删除 getExtcomment，getDanmu 添加 withRelated 参数支持
- [x] 2.2 删除 `request/api/related.ts` 和 `request/models/related.ts`
- [x] 2.3 修改 `request/index.ts`：移除 related 导出

## 3. 状态管理

- [x] 3.1 修改 `atoms/player.ts`：新增 danmakuDataAtom 存储弹幕加载结果，供播放器初始化消费

## 4. 加载 Pipeline 核心

- [x] 4.1 重写 `loading/hooks.ts`：实现 startLoading/continuePipeline async 函数，保留 useVideo hook 公开 API 不变
- [x] 4.2 重写 `loading/PlayerProvider.tsx`：调用 pipeline 函数，处理对话框交互和状态渲染

## 5. Loading UI

- [x] 5.1 重写 `loading/Timeline.tsx`：纯 Tailwind 水平 stepper，三种状态（完成/进行中/未开始）
- [x] 5.2 删除 `icons/CompleteIcon.tsx`（新 stepper 使用 iconify 图标）

## 6. 播放器初始化适配

- [x] 6.1 修改 `initialize/hooks.tsx`：从 danmakuDataAtom 读取弹幕数据，移除 useDanmakuData 导入

## 7. 工具函数清理

- [x] 7.1 修改 `lib/danmaku.ts`：简化 danmakuPlatformMap（只处理 auto/local），删除 thirdpartyDanmakuMap
- [x] 7.2 删除 `lib/cht-to-chs.ts`

## 8. 设置面板适配

- [x] 8.1 修改 `setting/damaku/AddDanmaku.tsx`：删除第三方 URL 导入 UI 和 useMutation，保留本地文件导入
- [x] 8.2 修改 `setting/damaku/DanmakuSource.tsx`：移除 third-party-manual badge，适配新 type 值

## 9. 全局配置

- [x] 9.1 修改 `lib/query-client.ts`：gcTime 改为 10min，staleTime 改为 5min
