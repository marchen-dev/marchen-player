## 背景

AppHeader 已收窄到 40px。把页面标题从左对齐改为水平居中（macOS 原生窗口标题风格）：
- library：去掉计数 N，显示"影视库"
- player：新注入"视频播放"标题
- AppHeader CSS：title 绝对定位居中

顺手清死代码：`page/latest-anime/` 与 `RouterLayout.tsx` 已无任何路由引用，`RouteName.LATEST_ANIME` 也只剩定义无引用，一并删除。

## 1. AppHeader 居中

- [x] 1.1 改 `src/renderer/src/styles/app-header.css`：`.app-header-title` 改为 `position: absolute; left:50%; top:50%; transform: translate(-50%, -50%)`；`.app-header` 加 `position: relative`
- [x] 1.2 字号调整：`.app-header-title` 字号 14 → 13、color 改 `var(--sidebar-fg-2)` 与 macOS 原生对齐

## 2. 注入 / 调整标题

- [x] 2.1 改 `src/renderer/src/page/library/index.tsx`：`headerState.title` 改为字符串 `'影视库'`，去掉 `<span>{shows.length}</span>`
- [x] 2.2 改 `src/renderer/src/page/player/index.tsx`：调用 `usePageHeader({ title: '视频播放', actions: null })`

## 3. 清理死代码

- [x] 3.1 删除目录 `src/renderer/src/page/latest-anime/`
- [x] 3.2 删除文件 `src/renderer/src/components/layout/root/RouterLayout.tsx`
- [x] 3.3 删除 `src/renderer/src/router/name.ts` 中的 `LATEST_ANIME` 枚举值
- [x] 3.4 grep 验证无残留引用

## 4. 验证

- [x] 4.1 `pnpm typecheck` 通过
- [x] 4.2 chrome MCP 截图核对：library 标题居中显示"影视库"、player 标题居中显示"视频播放"
