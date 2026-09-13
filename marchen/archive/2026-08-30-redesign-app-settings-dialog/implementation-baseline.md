# 应用设置重构行为基线

## 入口

- 侧边栏齿轮与 `Cmd/Ctrl+,` 无目标打开设置时，默认进入“通用”。
- macOS“关于 Marchen”直接定位“关于”；设置已打开时复用同一个弹窗并切换分类。
- main → renderer 仅传递稳定分类 ID；缺省或未知值回退 `general`。

## 必须保留的业务行为

- 主题偏好仍为 `system | light | dark`，Electron 继续同步 `nativeTheme.themeSource`。
- AI Provider 保留新增、编辑、连接测试、激活、删除以及当前 Provider 持久化行为。
- 清除弹幕缓存与重置应用保留原有确认、成功和失败反馈；仅调整到“通用 / 数据”。
- Web 隐藏开机自启、播放记录海报等 Electron 专属操作，不渲染空分组；主题与数据操作仍可用。

## 相邻播放器边界

- 应用设置删除“播放器”分类和 `PlayerView` 入口。
- 统一播放器侧栏仍复用 `views/player/DanmakuSetting.tsx`、`views/player/list.ts`、旧 `Layout.tsx` 过渡组件以及播放器设置 atoms；这些不随 `PlayerView` 删除。
- SettingSwitch、SettingSelect、Dialog、ScrollArea、Switch 的播放器材质与容器扩展属于相邻变更，本变更只消费其公开能力。

## 视觉与交互验证矩阵

- Electron：`1400 × 900`、最小窗口 `800 × 650`。
- Web：桌面窗口；不扩展手机和平板布局。
- 主题：浅色、深色、系统跟随，以及弹窗打开期间的系统主题实时变化。
- 键盘：纵向分类方向键、Tab 顺序、Escape 分层关闭、关闭后焦点恢复。
- 嵌套浮层：Provider Dialog、Select、Combobox、删除确认、重置确认不被裁切。
