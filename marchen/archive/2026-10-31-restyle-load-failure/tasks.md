## 背景

加载阶段失败（导入或识别出错，`step: 'error'`）时，页面卸载加载界面，改为渲染播放器专用的 `PlaybackFailure`：黑色遮罩加深色卡片、大图标、原生 `<details>`、手写按钮。此时还没有视频画面，深色浮层与浅色应用及刚改版的加载进度界面割裂；文案笼统（「无法播放此视频」「退出当前播放」），媒体源的具体原因只藏在错误详情里。

方案（只改加载阶段失败；播放中失败仍用 `PlaybackFailure`）：

- 失败时加载界面不卸载，原地切换为失败形态：进度条停在出错位置并变为错误色，与匹配失败同一布局；不加遮罩、卡片与大图标，背景跟随应用主题，立即显示
- 按来源区分文案与操作：本地文件「无法打开视频文件」+ 重新选择视频；远程链接（桌面端）「无法打开视频链接」+ 重试 / 更换链接；媒体源按错误码给出原因（副文案用 `MEDIA_SOURCE_ERROR_MESSAGES`），可恢复错误重试，登录或权限、来源移除、内容不存在引导「前往媒体源」，不可恢复错误不提供重试；Web 端只显示返回
- 「退出当前播放」改为「返回」；错误详情改为文字按钮展开的等宽文本块；「反馈问题」保留预填与操作关联
- `player-loading` 的 `ErrorState` 增加可选 `code`：错误对象带字符串 code 时保留（`MediaSourceError` 在渲染进程内创建，code 可直接透传）
- 不改遥测与远程链接弹窗内的错误显示

## 1. player-loading

- [x] 1.1 `ErrorState` 与 `error` 事件增加可选 `code`，service 生成错误事件时从错误对象读取字符串 code，并补测试

## 2. 加载失败界面

- [x] 2.1 `PlayerProvider` 在 `error` 状态继续渲染 `LoadingProgress`，并透传 `onReselect`
- [x] 2.2 `LoadingProgress` 增加失败形态：按来源与错误码决定主副文案和操作，错误详情展开，反馈入口
- [x] 2.3 `page/player/index.tsx` 删除加载失败的 `PlaybackFailure` 分支，把 `manualImport` 传给 `VideoProvider`

## 3. 校验

- [x] 3.1 运行 player-loading 包测试、`pnpm test:player-runtime`、`pnpm typecheck` 与改动文件 lint
- [x] 3.2 在网页版用浏览器实际查看本地文件失败形态
