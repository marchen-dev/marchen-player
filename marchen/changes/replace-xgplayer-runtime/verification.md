# 实现验证记录

验证日期：2026-08-29

## 自动验证

- `player-loading`：3 个测试文件、20 条用例通过。
- `playback-core`：1 个测试文件、10 条用例通过。
- `danmaku-engine`：3 个测试文件、9 条用例通过。
- Renderer player-runtime：10 个测试文件、26 条用例通过。
- Node/Web TypeScript 检查通过；变更 TypeScript 文件 ESLint 无 error，保留 27 条既有架构类 warning。
- Electron 与 Web production build 均通过；libass WASM worker、legacy worker、字体和播放器 workspace 包均成功产出。

## Electron 运行时

- 原生 AV1/AAC 与 H.264/AAC 样本均能进入播放态，窗口全屏状态与按钮状态同步。
- 浮动控制器从 `(260, 564.32)` 拖到 `(350, 519.32)`，位置约束和持久化生效。
- 1200 条高密度弹幕样本在 5 秒采样中峰值为 32 个 DOM 节点，低于默认 80 上限；Long Task 为 0，滚动、顶部、底部及 `#66CCFF` 本地颜色均正确。
- 内嵌 ASS 使用字幕流相对索引提取，经主进程读取后转换为可释放 Blob URL；libass canvas 有 27420 个非透明像素，字幕可见。
- 同目录播放列表包含两项；手动下一集与启用自动下一集后的 ended 切换都统一回到 player-loading 匹配流程。
- 5.31 秒进度写入后重新打开恢复至约 6.52 秒；历史记录已写入 JPEG data URL 缩略图。

## Web 与响应式

- 桌面 Web 完成文件导入、同源 API 代理匹配、原生播放、DOM Fullscreen/Escape、播放器内 Portal 和 ASS/SSA 外挂字幕。
- Web Blob 播放源使用独立租约，Strict Effects、换片和退出路径均有撤销测试；H.264 不可用时显示可恢复错误公告，AV1 样本可正常播放。
- 375×812 使用底部 Dock、安全区和不小于 44px 的触控按钮；812×375 横屏回到浮动控制器，字幕与弹幕 surface 位于控制器下层。
- Space、方向键、M、Escape、可聚焦拖动 handle 的方向键替代操作和控件可访问名称均已核对；`prefers-reduced-motion` 分支禁用非必要过渡。

## 残留扫描

- `package.json`、lockfile、`src/`、`packages/` 和当前说明文档均无活跃 `@suemor/xgplayer` / `danmu.js` 引用。
- 剩余命中仅位于 changelog、archive、当前变更说明及已晋升 Idea，均为历史决策记录，不参与运行时或构建。

## 非阻塞提示

- 当前主机 Node 22 与项目声明的 Node 24 不一致；本轮使用仓库已安装依赖完成验证。
- 构建仍报告数据库模块无法拆分和 Web 主 chunk 大于 500 kB，这两项不影响本变更功能，后续可独立做加载性能治理。
