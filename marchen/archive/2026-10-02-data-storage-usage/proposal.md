## 动机

设置 › 数据区目前只有「清除弹幕缓存」与「重置应用」两个按钮，存在三类问题：

1. **用户看不到占用**：不知道本地数据占了多少空间，也无法判断清除能释放多少，清除行为缺乏决策依据。
2. **清除弹幕缓存会误删用户数据**：现实现把 `history.danmaku` 整体置空，用户手动导入的 `local` 弹幕与外链 `link` 弹幕一并丢失；`local` 无法恢复，与文案「下次播放时会重新获取」不符。
3. **Electron 重置应用双重确认**：renderer 已弹确认框（Electron 下为原生对话框），主进程 `clearData()` 再弹一次。

此外缩略图（base64 关键帧）与 Electron HTTP 缓存同样占用空间但没有独立清理入口；清除失败只 `console.error`，未经 telemetry 边界。

## 变更内容

- 数据区显示弹幕缓存、播放缩略图、网络缓存（仅 Electron）各项的可释放大小，文案精简。
- 「清除弹幕缓存」只清除可重新获取的 `auto` 弹幕，保留 `local` 与 `link`；同步更新文案。
- 新增「清除播放缩略图」：清空 history 中的 `thumbnail`，不影响播放进度。
- 新增「清除网络缓存」（仅 Electron）：清理 session HTTP 缓存。
- 设置页触发的重置应用只确认一次；macOS 应用菜单「清除数据」入口保留其原生确认。
- 清除动作补充 `feature_used` 埋点，失败经 `reportOperationalError` 上报并 toast 提示。

## 能力

### 新增能力

- `storage-usage`：本地数据占用统计（总量与分项估算、加载与刷新时机、平台差异）。
- `data-cleanup`：分项清理语义（哪些数据属于可清除缓存、保留规则、确认策略、重置应用确认流程、错误与埋点）。

### 修改能力

无（仓库尚无相关主 spec）。

## 影响范围

- Renderer：`components/modules/settings/views/general/General.tsx`（数据区 UI），新增存储统计 / 清理 service（`services/` 或 `database/lib/` 下）。
- Main：`src/main/ipc/app.ts` 新增网络缓存大小查询与清理 IPC；`windows/setting.ts` 的 `clearData` 与 `ipc/app.ts` 的 `reset` 分支调整确认流程；`initialize/menu.ts` 菜单入口行为保持。
- 数据：只修改 `history` 表已有字段（`danmaku`、`thumbnail`），不改 schema、不升级 Dexie 版本。
- Telemetry：复用 `captureFeatureUsed` / `reportOperationalError`，不新增事件契约。
- Web 端：隐藏网络缓存行，其余行为一致。
