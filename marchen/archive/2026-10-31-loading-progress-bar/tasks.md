## 背景

播放器加载界面是五个等长圆圈的 stepper，只有当前步骤的小圆点在闪，显得呆板。PostHog 数据显示本地 / Web / 媒体源的导入与识别通常 <0.5s，等待集中在匹配与获取弹幕两次网络请求（自动匹配完整加载 p50 约 3.8s、p90 约 21s）；远程 URL 的导入 p50 约 7.7s。等长 stepper 让用户看到「前两步瞬间打勾，然后卡住」。

方案：用一条总进度条替代 stepper，传达「正在快速加载」。

- 结构：去掉圆圈 stepper 与步骤标签；保留主状态文案（正在读取视频 / 识别视频 / 匹配番剧 / 获取弹幕…）、4px 细进度条（已填充部分带 shimmer，不显示百分比）、副标题（文件名，匹配后淡入「作品名 · 集名」）
- 分段按来源：本地 / Web / 媒体源约 8 / 7 / 40 / 45；远程（有字节读取进度）约 40 / 5 / 25 / 30。远程导入段使用真实字节进度，`RemoteReadProgress` 并入总进度条
- 段内渐近爬升，最多到段长 90%，τ 取该步骤典型耗时；步骤完成时快速补满，单调不回退
- 加载开始 300ms 内不显示加载界面；ready 直接切播放器不额外停留
- 「先播放，弹幕稍后加载」进入匹配约 1.5s 后淡入；match_failed 立即显示原三个按钮
- waiting_user 进度停住、shimmer 停止；match_failed 停住并变为错误色
- 遵循 `prefers-reduced-motion`：不做 shimmer 与爬升，只按步骤跳格
- 纯 renderer 改动，不改 player-loading 包，不新增遥测

## 1. 进度模型

- [x] 1.1 新增 `services/player-loading/loading-progress.ts` 纯函数：按来源分段、段内渐近爬升、步骤完成补满、远程导入使用真实比例、单调不回退
- [x] 1.2 新增单元测试覆盖分段、爬升上限、真实比例、单调性与暂停状态

## 2. 加载界面

- [x] 2.1 新增 `LoadingProgress` 组件替换 `Timeline`：主状态文案、细进度条与 shimmer、副标题切换、按钮延迟淡入、失败与等待选择状态、减少动态效果
- [x] 2.2 `PlayerProvider` 改用新组件并按加载会话重新挂载（300ms 延迟显示在组件内完成）；删除 `Timeline.tsx`（`RemoteReadProgress` 仍被远程链接弹窗使用，保留）

## 3. 校验

- [x] 3.1 运行 `pnpm test:player-runtime`、`pnpm typecheck`、`pnpm lint`
- [x] 3.2 用 `pnpm dev` 与 Chrome DevTools MCP 查看加载界面实际效果
