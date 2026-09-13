# 第 1 轮验收报告

本轮以真实 Electron 开发窗口与 Web 本地页面取证，清单只包含维护者可直接观察的产品结果。自动测试、类型检查、Lint 和构建结果未放入验收清单，完整工程验证记录见变更根目录的 `verification.md`。

## 取证说明

- Electron 使用生成的 AV1/H.264 MP4、内嵌 ASS MKV 和 1200 条高密度弹幕样本。
- Web 使用本地 AV1 MP4 和 ASS/SSA 样本，覆盖桌面、375×812 和 812×375。
- 高密度弹幕 5 秒采样峰值 32 个 DOM 节点、Long Task 0；截图展示主观画面与控制器层级。
- Electron 实机额外确认了播放列表、手动/自动下一集、5.31 秒进度恢复和 JPEG 缩略图写入；这些数据状态没有伪装成截图清单项。

## 实现中修正的设计细节

- Web 开发环境的弹弹play代理改为同源 `/api/v2`，避免浏览器 CORS；生产 Web 仍需同源反向代理。
- Web 视频 Blob 使用“导入租约 + Runtime 独立租约”，避免 React Strict Effects 提前撤销仍在使用的 URL。
- Electron 内嵌字幕不能让 libass Worker 直接 XHR `marchen://`；改为主进程受限读取 ASS/SSA 文本，Renderer 创建可释放 Blob URL。
- ffprobe 的全文件流索引不能直接传给 `0:s:N`，字幕目录现使用字幕流相对索引。
- 本地 B 站弹幕颜色兼容十进制与 `#RRGGBB` 两种输入。

## 非阻塞项

- 当前主机 Node 22 低于项目声明的 Node 24；本轮使用仓库现有依赖完成全部验证。
- 构建仍提示数据库模块无法拆分、Web 主 chunk 超过 500 kB；不影响本轮功能，可后续单独治理。
- `marchen/ideas/rewrite-player-runtime.md` 与 changelog 中仍保留 xgplayer/danmu.js 字样，它们属于历史决策记录，不进入运行时或构建。
