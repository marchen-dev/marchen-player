## 背景

控制器与设置面板已改用通透毛玻璃材质（半透明中性灰 + 48px 模糊 + 180% 饱和），但播放器内的提示气泡、下拉、弹出层、匹配提示、关闭按钮、失败卡片仍是各自写死的 `rgb(38 38 44 / 96%)` 等深色实底，观感不统一，且颜色字面量散落在多个文件。

方案：在 `player.css` 集中定义两档材质：

- 颜色注册为 Tailwind 主题色 `bg-player-surface`（50%，控制器、设置面板等直接覆盖视频的大面）与 `bg-player-popover`（72%，叠在其他层之上的下拉、气泡、提示）。主题色定义在全局，portal 到 `[data-player-root]` 之外也有值；`cn` 能正确覆盖 shadcn 原件默认的 `bg-popover`
- 工具类 `player-glass` 只负责 `backdrop-filter: blur(48px) saturate(1.8)`；不支持 `backdrop-filter` 时的实心兜底集中写在 `player.css`

只改播放器内的 className，不动 `components/ui/*` 全局原件；`SettingSelect` 仍只在 `playerMaterial` 为真时使用播放器材质。

例外：弹幕悬停工具条位于高频弹幕层，不加背景模糊，只把底色换成 popover 档颜色；`PlaybackFailure` 下方是黑底或深色遮罩，模糊无意义，卡片只换底色。跟随应用主题的通用 Dialog 不在本次范围。

## 1. 材质封装

- [x] 1.1 `player.css` 注册 `player-surface` / `player-popover` 主题色与 `player-glass` 工具类，原 `--player-surface` 改为引用主题色，不支持 `backdrop-filter` 的兜底改为覆盖 `player-glass`
- [x] 1.2 控制器与设置面板改用 `bg-player-surface player-glass`，同步更新回归测试中对模糊类名的断言

## 2. 浮层替换

- [x] 2.1 `PlayerIconButton`、`DanmakuSource`、`LinkDanmaku`、`Subtitle`、`PlayList`、`SettingSelect` 中的 `rgb(38 38 44 / …)` 改为 `bg-player-popover player-glass`
- [x] 2.2 `MatchResultToast` 与 `PlayerWindowChrome` 关闭按钮改用 `bg-player-popover player-glass`
- [x] 2.3 `PlaybackFailure` 卡片与弹幕悬停工具条只换底色为 popover 档颜色，不加模糊

## 3. 验证

- [x] 3.1 `pnpm typecheck`、`pnpm lint` 与 `pnpm test:player-runtime` 通过，确认无遗留 `rgb(38_38_44` 字面量
