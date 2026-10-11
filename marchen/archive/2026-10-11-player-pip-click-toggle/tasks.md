## 背景

播放器新增两个功能：

1. **画中画**：入口在设置面板「播放」页「画面旋转」下方的「画中画」分组，按钮在「进入画中画 / 退出画中画」间切换。采用 `video.requestPictureInPicture()`，只有画面、不带弹幕与字幕，不跟随画面旋转。仅原生 H5 内核可用；兼容内核（MediaStream 输出、音频走 Web Audio，画中画暂停无法同步）或浏览器不支持（`document.pictureInPictureEnabled` 为假）时按钮置灰并说明原因。必须在按钮点击中同步调用以满足用户手势要求，进入后关闭设置面板；切换内核、会话结束或 video 元素被替换时主动退出画中画。不加快捷键。
2. **点击画面暂停/播放**：新增全局偏好 `playerSettingAtom.enableClickToTogglePlay`，默认关闭。在 `InteractionSurface` 处理：单击延迟约 250ms，期间无第二次点击才切换播放；双击取消待执行单击并保持全屏切换。点在弹幕文字上沿用现有行为不触发。

同时把设置面板「连续播放」分组更名为「播放偏好」，新开关放在该组。

## 1. 点击画面暂停

- [x] 1.1 `atoms/settings/player.ts` 新增 `enableClickToTogglePlay: false` 默认值
- [x] 1.2 `NativePlayer.tsx` 中为 `InteractionSurface` 增加单击延迟切换播放、双击取消单击后全屏的逻辑，仅在会话就绪且开关开启时生效，卸载时清理定时器
- [x] 1.3 设置面板「连续播放」更名为「播放偏好」，新增「点击画面暂停/播放」开关并上报 `feature_used`

## 2. 画中画

- [x] 2.1 在设置面板「播放」页「画面旋转」下新增「画中画」分组：按当前内核与浏览器能力决定可用性，按钮文字随画中画状态切换，不可用时置灰并显示原因
- [x] 2.2 实现进入/退出：点击时同步调用 `requestPictureInPicture()` / `document.exitPictureInPicture()`，进入后关闭设置面板，失败经 telemetry 边界上报（用户取消不上报）
- [x] 2.3 切换内核、会话结束或原生 video 元素被替换时自动退出画中画

## 3. 验证

- [x] 3.1 `pnpm typecheck`、`pnpm lint` 与 `pnpm test:player-runtime` 通过
