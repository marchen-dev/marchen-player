# 变更日志
- 2026-04-20: [remove-daisyui](./archive/2026-04-20-remove-daisyui/) — 移除 daisyUI 依赖，将颜色类名迁移到 shadcn CSS 变量体系，主题从 cmyk/dark 切换到 light/dark，用 flex 重写 Timeline 组件
- 2026-04-20: [migrate-to-monorepo](./archive/2026-04-20-migrate-to-monorepo/) — 将@egoist/tipc替换为自建@marchen/electron-ipc包，引入pnpm workspace monorepo，抽取共享代码到@marchen/shared
- 2026-05-03: [eliminate-cross-process-imports](./archive/2026-05-03-eliminate-cross-process-imports/) — 消除renderer对main进程的跨进程类型引用，在shared包定义IpcRouter接口契约，清理tsconfig，重命名tipc为ipc
