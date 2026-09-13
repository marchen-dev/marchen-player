# 发布包接入记录

- 发布包：@suemor/libav-hevc@0.1.0；commit `b1256cdc09c35815afe9c0b98e9cdd8f7b20fc8d`。
- npm integrity 已固定在 pnpm-lock.yaml，prepare-libav.mjs 校验包内每个 dist 文件的 SHA-256 和体积。
- dev、dev:web、Electron/Web 构建复制同版本资源、许可证与 sources，旧自建脚本作为非活动文本存于 scripts/player-engine/history。
- Chrome 152.0.7977.77，用户授权的本地 1080p Main10 样片，60 个压缩包；未保存影片路径或内容。
- 普通版 configuredThreads=1，实际 mode=direct；线程版 configuredThreads=4，实际 mode=threads。
- 两次均输出 60 帧，完整像素散列一致，时间戳与包时间对应、时长为正，flush 后重复 close 成功。
- 包无 libavjsMemoryStats，诊断返回 null，pendingTimestamps=0。不声称固定线程池/768 MiB 上限或 RSS 回收已验证。
- 适配器 5 项单元测试通过，Web TypeScript 检查通过。
- 本次未重跑完整矩阵、4K、HDR 对比、20 分钟播放和打包态。正式引擎接入/平台验收仍未完成。

复现：先 pnpm media:prepare，再按 scripts/player-engine/README.md 的 --package-smoke 命令运行。
