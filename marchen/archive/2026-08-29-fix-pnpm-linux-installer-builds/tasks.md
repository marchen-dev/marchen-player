## 背景

升级到 pnpm 11 后，Linux x64 CI 因 FFmpeg 和 FFprobe 平台包的构建脚本未经批准而在依赖安装阶段失败。在保留严格依赖构建审核的前提下，只批准 CI 已确认需要的两个 Linux x64 installer 包，并运行与 CI 一致的校验。

## 1. 修复依赖构建白名单

- [x] 1.1 在 pnpm `allowBuilds` 中批准 FFmpeg 和 FFprobe 的 Linux x64 installer

## 2. 验证 CI 命令

- [x] 2.1 用冻结锁文件安装依赖
- [x] 2.2 运行 typecheck、lint 和 Web build
