## 1. 主进程

- [x] 1.1 `windows/setting.ts` 抽出不含确认的 `performClearData()`（保留失败错误对话框）；`clearData()` 保留原生确认并复用它，应用菜单行为不变
- [x] 1.2 `ipc/app.ts` 的 `windowAction('reset')` 改为调用 `performClearData()`，去掉设置页重置的第二次确认
- [x] 1.3 `ipc/app.ts` 新增 `getNetworkCacheSize` 与 `clearNetworkCache`，使用调用方 webContents 的 session

## 2. 存储统计与清理 service

- [x] 2.1 新建 `services/storage/`：`estimateLocalUsage()` 用 `db.history.each()` 单次遍历累计 auto 弹幕与缩略图的估算字节及条目数；总量取 `navigator.storage.estimate()`，不可用返回 undefined
- [x] 2.2 新增清理函数：`clearAutoDanmakuCache()`（`modify` 只删 auto，全空置 undefined）与 `clearThumbnails()`（`modify` 删 thumbnail）
- [x] 2.3 新增 `useStorageUsage()` hook：discriminated union 表达 loading / ready / error，合并 Electron 网络缓存大小，提供 `refresh()`；统计失败以 recovered 方式上报
- [x] 2.4 将下载页的字节格式化逻辑提升为共享 `formatBytes`（`lib/` 下），下载页改为复用

## 3. 设置页 UI

- [x] 3.1 数据区显示总占用（不可用时隐藏），弹幕缓存行改用新清理函数、更新文案说明保留本地导入与外链弹幕，并显示「约 X · N 集」/「计算中…」
- [x] 3.2 新增「播放缩略图」行与「网络缓存」行（仅 Electron），显示大小、无数据时置灰、执行中禁用按钮
- [x] 3.3 各清除操作成功 toast + `captureFeatureUsed('settings', 'clear_*')`，失败 toast + `reportOperationalError`，完成后 `refresh()`

## 4. 验证

- [x] 4.1 为 `clearAutoDanmakuCache` / 统计估算补充单元测试（混合 auto/local/link、全 auto、无弹幕）
- [x] 4.2 运行 typecheck、lint 与相关测试
- [x] 4.3 修复 Electron 总占用显示 0 KB（主进程统计 userData）
- [x] 4.4 按产品调整移除总占用及其 IPC，数据区精简为名称 + 大小 + 清除按钮
