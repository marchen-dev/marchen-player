## 背景

当前弹幕加载流程使用 react-query 的 useQuery/useQueries 编排三阶段请求：先请求 `/related` 获取第三方 URL 列表，再对每个 URL 请求 `/extcomment`，最后请求 `/comment`。这导致动态 queryKey、复杂的 combine 逻辑和不可预测的缓存行为。

dandanplay 已于 2026年4月下线 `/api/v2/related` 和 `/api/v2/extcomment`，统一为 `/api/v2/comment/{episodeId}?withRelated=true` 一次返回所有弹幕（含第三方源，服务端已处理时间偏移和繁简转换）。

## 目标与非目标

**目标：**

- 迁移到新 API，恢复弹幕加载功能
- 用 async pipeline + jotai atom 替代 react-query 编排，消除缓存地狱
- 重写 Loading UI 为纯 Tailwind 水平 stepper
- 简化 DB_Danmaku 数据模型
- 保留 react-query 在合理场景的使用（搜索、设置面板读 IndexedDB）

**非目标：**

- 不重写 MatchAnimeDialog 对话框 UI
- 不改动字幕相关功能
- 不改动播放器核心（xgplayer）
- 不重新实现第三方 URL 手动导入（API 已下线，功能移除）

## 决策

### 1. async pipeline + jotai atom（而非 class 或 RxJS）

加载流程是 5 步线性 pipeline + 1 个对话框中断点。选择纯 async 函数 + jotai atom：
- 零新依赖，和项目现有模式一致
- AbortController 处理取消
- jotaiStore.set() 直接更新 UI 状态
- 不需要 class 的封装开销（pipeline 足够简单）
- 不需要 RxJS 的编排能力（没有复杂并发）

数据流：
```
startLoading(video) → jotaiStore.set(loadingStateAtom, ...)
                    → 各步骤顺序执行
                    → 完成后 set(danmakuDataAtom, result)
                    → initialize/hooks.tsx 从 atom 读取弹幕数据
```

### 2. pipeline 暂停/恢复机制

当匹配失败需要用户选择时，pipeline 分为两段：
- `startLoading()`: 导入 → hash → match → 如果未匹配则 return（暂停）
- `continuePipeline(episodeId)`: 获取弹幕 → 保存 → 播放

对话框 onSelected 回调直接调用 `continuePipeline()`。

### 3. 弹幕数据存储简化

```
旧: type = 'dandanplay' | 'third-party-auto' | 'third-party-manual' | 'local'
新: type = 'auto' | 'local'
```

- `auto`: withRelated=true 返回的所有弹幕合并存储为一条记录
- `local`: 用户通过本地文件导入的弹幕

不再按第三方源拆分存储，因为新 API 返回的是合并后的 comments 数组。

### 4. 播放器初始化消费弹幕数据

当前 `initialize/hooks.tsx` 通过 `useDanmakuData()` hook 获取弹幕。改为从 `danmakuDataAtom` 读取：
- pipeline 完成后写入 atom
- useXgPlayer 通过 useAtomValue 消费
- 不再有 hook 调用链的耦合

### 5. react-query 保留范围

| 场景 | 保留/移除 | 理由 |
|------|-----------|------|
| 加载流程（match/danmaku） | 移除 | 改为 pipeline |
| 搜索动漫（dialog/hooks.ts） | 保留 | debounce + 缓存合理 |
| 设置面板读 IndexedDB（Sheet.tsx） | 保留 | 简单数据获取 |
| 字幕信息（subtitle/hooks.ts） | 保留 | 不涉及本次改动 |
| 检查更新（About.tsx） | 保留 | 简单 mutation |

全局配置调整：gcTime: 10min, staleTime: 5min（当前 gcTime:0 导致缓存立即回收）。

### 6. 繁简转换策略

服务端 `chConvert` 参数在 `withRelated=true` 时对所有弹幕（含第三方）生效。删除客户端 `lib/cht-to-chs.ts`，统一由 API 参数控制。

### 7. 数据库迁移策略

version(3) 迁移：遍历所有 history 记录，保留 `type === 'local'` 的弹幕，清空其余弹幕缓存。下次播放时会自动重新请求。

## 风险与权衡

### 风险 1: chConvert 对第三方弹幕的覆盖范围

假设服务端 chConvert 覆盖所有弹幕源（基于 changelog 描述"相当于同时调用了两个接口"）。如果实际不覆盖，需要回退为客户端全量转换。

**缓解**：实现后测试验证，如果不生效则对所有弹幕做客户端转换（不再区分源，全量转换即可）。

### 风险 2: 302 重定向

API 文档提到返回 302 跳转到弹幕加速服务。需确认 ofetch 是否自动跟随重定向。

**缓解**：ofetch 默认跟随重定向，应该无需额外处理。

### 风险 3: 数据库迁移丢失本地弹幕

迁移时需要精确保留 `type === 'local'` 的条目，不能误删。

**缓解**：迁移逻辑只清空非 local 类型，保留 local 条目不变。

### 风险 4: useVideo hook 的消费者兼容

useVideo() 被 5 个组件使用。改动后 useVideo 内部触发 pipeline 而非 setProgress，需确保所有消费者行为不变。

**缓解**：useVideo() 的公开 API（importAnimeViaDragging, importAnimeViaIPC, video）保持不变，只是内部实现从"设置 atom 触发 query"变为"调用 pipeline 函数"。
