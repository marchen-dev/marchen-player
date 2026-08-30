# 实施验证记录

## 自动验证

- `pnpm exec vitest run --config vitest.player-runtime.config.ts`：12 files / 42 tests 通过。
- `pnpm typecheck`：node 与 web 类型检查通过。
- `pnpm build:web`：通过。
- `pnpm exec electron-vite build`：main、preload、renderer 构建通过。
- 设置变更文件定向 ESLint：0 errors；保留 ProviderDialog 与 ModalStack 原有 hook warnings。
- `pnpm lint` 已执行；全仓仍因并行中的弹幕碰撞与播放器首页变更存在 7 个排序/测试标题错误，本变更文件没有 lint error，未越界修改这些相邻文件。

## Web 桌面验证

- 1400 × 900 与 800 × 650：双栏尺寸、单一内容滚动和三分类正常。
- 系统主题实时从 dark 切换到 light：当前 AI 分类和未提交名称“未保存测试”均保留。
- AI Provider Dialog、重置确认框：层级、Escape 分层关闭与触发按钮焦点恢复正常。
- 纵向分类 Tabs：ArrowDown 从通用切换到 AI 服务。

## Electron 验证

- 侧边栏齿轮与 `Cmd+,` 默认打开通用。
- macOS“关于 Marchen Play”在关闭状态直接打开关于；设置已在通用时复用同一弹窗并切换关于。
- Electron 专属开机自启、播放记录海报与检查更新仅在 Electron 显示。
- 窗口缩小到项目最小尺寸后，分类栏、页面头、内容和关闭按钮仍完整可用。

## 视觉证据

- `evidence/web-light-general.png`
- `evidence/web-dark-ai.png`
- `evidence/web-system-about.png`
