## 背景

- 设置 › 通用 › 数据区（`General.tsx`）只有「清除弹幕缓存」「重置应用」。
- 弹幕存于 `history.danmaku: DanmakuEntry[]`，`type` 为 `auto`（弹弹play 自动匹配）、`local`（用户导入文件内容）、`link`（外链抓取）。现清除逻辑逐条 `toArray` + `update` 把整个字段置空。
- 加载流程 `packages/player-loading/src/pipelines/load.ts` 仅在缓存含 `auto` 且非 stale 时复用缓存；否则重新拉取弹弹play，并与已有非 `auto` 条目合并。因此“只删 auto”与现有加载语义天然兼容。
- 缩略图为 `history.thumbnail`（base64 JPEG），由播放快照在退出时写入；影视库继续观看卡缺失时回退 `imageUrl`。
- Electron 重置链路：renderer `useConfirmationDialog`（Electron 下即原生对话框）→ `app.windowAction('reset')` → `windows/setting.ts#clearData()` 再弹原生确认 → `lib/cleaner.ts#clearAllData()`。`clearData` 同时被 macOS 应用菜单「清除数据」直接调用，那里它是唯一确认。

## 目标与非目标

**目标：**
- 数据区显示总占用与弹幕 / 缩略图 / 网络缓存三项可释放大小与条目数。
- 清除弹幕缓存只删 `auto`；新增缩略图与网络缓存清除。
- 设置页重置只确认一次，菜单入口仍确认一次。
- 清除动作埋点与失败上报。

**非目标：**
- 不做精确到字节的磁盘占用；不统计下载目录 / 视频文件。
- 不改 Dexie schema、不升级版本。
- 不提供按作品 / 按集的细粒度清理。
- 不做后台定期自动清理或容量上限。

## 决策

### 1. 统计放在 renderer 的独立 service

新建 `services/storage/`（纯函数 + 小 hook），而不是写在 `General.tsx`：
- `estimateLocalUsage()`：遍历 history 一次，同时累计 `auto` 弹幕估算字节 / 集数、缩略图估算字节 / 张数。
- `useStorageUsage()`：设置页挂载时触发，暴露 `{ status: 'loading' | 'ready' | 'error', total?, danmaku?, thumbnail?, network? }` 与 `refresh()`。
- 用 discriminated union 表达加载态，UI 依状态渲染「计算中…」/ 数值 / 隐藏。

### 2. 大小估算口径

- **分项**：弹幕取 `auto` 条目 `JSON.stringify(entry).length`；缩略图取 base64 字符串长度。UTF-16 / 结构化克隆开销不计，UI 统一加「约」。选它而非精确测量，是因为 IndexedDB 没有按字段的占用 API，估算足够支撑“清了能省多少”的决策。
- **总量**：`navigator.storage.estimate().usage`（Web / Electron 均可用），不可用时隐藏。总量与分项之和不要求相等，UI 不展示“其他”差值，避免出现负数。
- **遍历**：用 `db.history.each()` 流式读取，避免一次性 `toArray` 把全部弹幕载入数组；统计期间不持有大对象引用。统计在设置页每次打开时执行，不做持久化缓存。

### 3. 清除弹幕缓存：Collection.modify 只删 auto

```
db.history.toCollection().modify((rec) => {
  if (!rec.danmaku?.some(e => e.type === 'auto')) return
  const rest = rec.danmaku.filter(e => e.type !== 'auto')
  rec.danmaku = rest.length ? rest : undefined
})
```

- 单事务批量写，替代逐条 `update`。
- 只剩非 auto 时保留数组；全空时置 `undefined`，与“无缓存”语义一致。
- 代价：auto 条目的 `selected` 开关丢失，重新获取时回到默认开启。可接受，文案不另说明。
- `newBangumi` 不动（只是 stale 标记）。
- 正在播放的视频内存中的弹幕不受影响，下次加载才生效；不额外通知播放器。

### 4. 清除缩略图

同样 `modify` 删除 `thumbnail` 字段；`cover` 为海报 URL，体积小且被历史展示使用，不清。

### 5. 网络缓存 IPC（仅 Electron）

在 `ipc/app.ts` 新增：
- `getNetworkCacheSize` → `session.getCacheSize()`
- `clearNetworkCache` → `session.clearCache()`

取调用方 `context.sender.session`，与 `clearAllData` 使用的主窗口 session 一致。Web 下 `ipcClient` 为 null，hook 返回 `network: undefined`，UI 隐藏该行。

### 6. 重置确认拆分

`windows/setting.ts`：
- `clearData()` 保留原生确认，供应用菜单使用（行为不变）。
- IPC `windowAction('reset')` 改为直接调用 `clearAllData()`（失败时沿用错误对话框），因为 renderer 已确认。抽出 `performClearData()`（不含确认、含错误对话框）供两处复用。

### 7. 埋点与错误

- 成功：`captureFeatureUsed('settings', 'clear_danmaku_cache' | 'clear_thumbnails' | 'clear_network_cache')`。
- 失败：`reportOperationalError('ipc' | 'player', 'settings.clear_*', error)`。IndexedDB 失败归入现有 `OperationalArea`（只有 `ipc` / `player`）——选 `player`，因 history 属于播放数据域；不为此扩展 area 枚举。
- 统计失败只记 breadcrumb 级别（`recovered = true`），不打扰用户。

### 8. UI

沿用 `SettingsActionRow`，description 下方或 label 旁显示「约 X · N 集」；总占用放在 `SettingsSection` 的 description 区域（若组件不支持右侧附加内容，则拼入描述文本）。大小格式化抽为 `formatBytes`（若仓库已有同类工具则复用）。按钮在执行中 disabled，防重复点击。

## 风险与权衡

- **大库统计耗时**：数百集、每集上万条弹幕时 `JSON.stringify` 遍历可能耗时数百毫秒到秒级。异步 + 「计算中…」兜底；若实测过慢，可改为只累计 `content.comments.length` 粗估或放进 idle 回调。
- **估算偏差**：总量来自浏览器估算、分项来自字符串长度，两者口径不同，用户可能看到分项之和大于 / 小于总量。以「约」字与不展示差值缓解。
- **清除后 storage.estimate 不立即下降**：IndexedDB 空间回收由浏览器延后执行，刷新后总量可能变化不大。分项会立即归零，用户仍能感知效果；不做额外压缩。
- **modify 大事务**：一次 rw 事务改写全部 history；期间播放器写入会排队。清除是低频手动操作，可接受。
- **selected 偏好丢失**：见决策 3。

## 实现后调整（2026-10-02）

- **去掉总占用**：Electron 下 `navigator.storage.estimate()` 对应用源返回 0；改用主进程统计 userData 后，开发态数值被 Vite 模块缓存与遗留目录放大，参考价值低。按产品决定数据区不再显示总占用与标题下说明，相关 IPC 一并移除。
- **精简文案**：各行保留名称、一句简短描述、约略大小与「清除」按钮，不显示条目数。统计仍保留条目数用于内部判断，不展示。
- **统计状态**：hook 以 loading / ready 两态表达，ready 内各项独立降级为 undefined，未单设 error 态。
