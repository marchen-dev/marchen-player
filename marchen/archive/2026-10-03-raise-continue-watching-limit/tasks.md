## 背景

影视库「继续观看」横滚 Rail 当前最多展示 10 部（simplify-library 设定），追番 + 搁置未看完的作品稍多就会被截断。缩略图与进度查询本就对全库执行，上限只影响渲染层卡片数量，且图片已 `loading="lazy"`，调高成本很低。本次将 `MAX_CONTINUE` 从 10 调到 30；「所有作品」的 50 上限与「查看全部」入口不在本次范围。

## 1. 调高继续观看上限

- [x] 1.1 `src/renderer/src/page/library/index.tsx` 的 `MAX_CONTINUE` 由 10 改为 30
- [x] 1.2 运行 `pnpm typecheck` 与 `pnpm lint` 验证
