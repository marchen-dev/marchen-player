# 改造前验证基线

记录时间：2026-08-29（Asia/Taipei）

## 环境门禁

- 当前 shell：Node `v22.22.3`、pnpm `11.24.0`。
- 项目声明：Node `24.x`、pnpm `11.x`。
- 直接执行 `pnpm typecheck`、workspace test、Electron build、Web build 时，pnpm 在目标脚本开始前进行依赖状态检查并失败：
  - `Unsupported engine`：Node 22 不满足 Node 24。
  - `ERR_PNPM_IGNORED_BUILDS`：Linux ffmpeg/ffprobe installer 的 build script 未获准。
  - `simple-git-hooks` 尝试 chmod `.git/hooks/pre-commit` 时出现 EPERM，但 prepare 自身继续完成。
- 上述属于当前执行环境/依赖安装门禁，不是播放器代码编译失败。最终验收应在 Node 24 环境重新使用项目的 `pnpm` scripts 验证。

## 绕过 pnpm 前置门禁后的代码基线

为确认当前代码本身的状态，使用现有 `node_modules/.bin` 直接执行目标工具：

| 检查 | 命令 | 基线结果 |
| --- | --- | --- |
| Node TypeScript | `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false` | 通过 |
| Web TypeScript | `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false` | 通过 |
| player-core tests | 在 `packages/player-core` 执行 `../../node_modules/.bin/vitest run` | 3 files / 16 tests 通过 |
| Electron build | `./node_modules/.bin/electron-vite build` | 通过；main、preload、renderer 均产出 |
| Web build | `./node_modules/.bin/vite build` | 通过 |

## 已有非阻塞警告

- Electron/Web 构建均报告 `database/db.ts` 同时被静态与动态导入，动态导入不会拆成独立 chunk。
- Web build 报告主 chunk 超过 500 kB。
- Web build 直接调用 Vite 时提示 `out/web` 不在 Vite root 内且不会自动清空；项目脚本原本会先删除该目录。

以上警告在播放器重构前已存在。后续只把新增错误或警告归因于本变更。
