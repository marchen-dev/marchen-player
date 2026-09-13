# 实施验收记录

## 自动化

- `pnpm --filter @marchen/danmaku-engine test`：5 个文件、22 个用例通过。
- `pnpm exec vitest run --config vitest.player-runtime.config.ts`：12 个文件、44 个用例通过。
- `pnpm typecheck`：Node 与 Web 类型检查通过。
- `pnpm build`：Electron main、preload、renderer 生产构建通过。
- `pnpm build:web`：Web 生产构建通过；仅保留项目已有的大 chunk 提示。
- 运行环境为 Node 22.22.3，低于项目声明的 Node 24.x；pnpm 11.24.0 符合当前项目声明。

## Web 窗口态真实 DOM 验收

样本由 `scripts/generate-player-acceptance-fixtures.mjs` 生成，隔离验收页位于已忽略的
`test-results/danmaku-collision/`，直接挂载产品的 `DomDanmakuRenderer`，不修改产品路由或数据。

| 场景 | 结果 |
| --- | --- |
| 1x 高密度混排 | 413 次可见 DOM 矩形采样，0 次非法相交 |
| hover 暂停/恢复 | 暂停运动进度增量 0.000s，恢复后 0.400s |
| 2x + 控制器移至顶部 + resize | 960px 切换至 720px，持续 0 次非法相交 |
| 容量与性能 | 可见/核心峰值 8，安全丢弃 1192，Long Task 0 |

旧验收记录中的高密度节点峰值为 32；新统一占用模型峰值为 8。下降来自跨模式避让、真实高度
多轨占用和无安全轨道时确定性丢弃。这是明确的正确性优先取舍，没有通过重叠换取密度。实际测量
没有记录到 Long Task，因此本轮无需放宽碰撞保证或进一步缩减测量范围。

## 平台边界

- 用户已说明电脑正在使用，且全屏无需验证。本轮没有启动或操作 Electron 窗口；任务 7.4 的
  “在用户允许操作电脑时”条件未满足，按条件豁免，不作为归档门槛。
- Web DOM 全屏与 Electron 原生全屏均按设计不作为本变更验收门槛。

## 依赖与工作区边界

- `package.json`、`pnpm-lock.yaml`、`packages/`、`src/` 中未找到 `xgplayer` 或 `danmu.js` 运行时依赖。
- 本实现没有直接改编 `danmu.js` 源码；其只作为 proposal/design 中的算法行为参考。
- 当前工作区原有播放器设置侧栏与其他规划改动保持不变；本变更实现仅覆盖弹幕引擎、DOM
  Renderer、相关测试和验收样本生成脚本。
