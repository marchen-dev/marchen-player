# 实施验证记录

## 已完成

- `pnpm typecheck`：通过。
- `pnpm lint`：0 error；仓库既有 warning 保留。
- `pnpm build`：Electron main、preload、renderer 构建通过。
- `pnpm build:web`：Web 构建通过。
- 播放器相关 Vitest：6 个文件、21 条用例通过；随后新增材质静态回归，单文件 9 条用例通过。
- Web 桌面窗口：载入本地高对比视频后，统一侧栏显示播放、弹幕、字幕三个能力标签；Web 正确隐藏播放列表。
- Web 嵌套浮层：弹幕字号 Radix Select 位于 `PlayerPortalRoot`，计算样式为固定深色背景和白色文字。
- 静态约束：播放器 CSS 不含 `prefers-reduced-transparency`；保留 `@supports not (backdrop-filter)` 不透明深色降级；侧栏源码只有一层 `backdrop-blur`。
- Electron 顶部交互：侧栏、遮罩、标签栏和各标签均直接声明为 `no-drag-region`；面板打开时，窗口顶部 80px 拖拽层会截短到侧栏左边界，不再与侧栏发生命中重叠。
- 根据实际窗口截图将侧栏宽度从 `clamp(420px, 34vw, 520px)` 收窄为 `clamp(380px, 28vw, 440px)`。
- 播放列表对 ScrollArea 测量容器和 `ul/li/button/text` 全链路限制最小宽度，长文件名使用省略号并保留完整 `title`，不再产生横向溢出。

## 本轮不执行

- 用户正在使用电脑，因此停止所有 Electron、Chrome 与桌面窗口操作。
- Electron 窗口态的手工交互、三种视频背景对比和播放帧性能观察留待之后验收。
- Electron 原生全屏与 Web DOM 全屏按用户明确要求免验。
