# HEVC 最小适配关口

日期：2026-09-06。任务 2.2、2.3、2.6 已完成最小适配范围；尚未接入正式播放器，不代表 2.8 或最终平台验收。

- 输入：本机构造 1920×1080/24fps HEVC Main 8-bit、4 个 B 帧、MP4/hvcC；授权的 1080p Main10 MKV 影片。影片内容及 fixture 不提交。
- 四种底层配置各三轮：普通版 1 线程、线程版 1/2/4 线程。完整平面有效行像素一致，保留 24 MiB 初始内存并实际扩容。
- 最小 CustomVideoDecoder：1/4 线程、hvcC/length-prefixed、由 hvcC 参数集构造 Annex B、时间戳 +5000 秒和 -60 秒。各180帧的完整像素一致、显示顺序正确，输出时间与输入包排序逐项比对误差小于 2 微秒，帧时长非零。
- Worker 中连续三次关闭重建，交替时间线；取消后无迟到输出，子 Worker 均调用终止，重复 close 成功。单元测试另控制加载中、初始化中、解码中关闭的精确时序及错误后释放，共5项通过。
- 软解器不在模块加载时注册，shouldDecode 必须由调用方在原生能力探测后决定；不匹配原生支持配置的测试通过。后续正式引擎仍须接入探测和注册。
- 采用 ESM 和固定版本资源目录，不使用 __filename；线程参数在打开解码器前配置，退出调用当前固定工具链 terminateAllThreads。

验证命令：pnpm exec vitest run --config vitest.player-runtime.config.ts src/renderer/src/services/media/tests/hevc-decoder.test.ts；node scripts/player-engine/tests/memory-growth.mjs <样片> <起点秒数>。
本机结果：test-results/player-engine/main8-contract.json、main10-contract.json。Node/Web typecheck 已通过；以上是短片和适配器生命周期证据，不是完整播放 seek、HDR 色彩或长期 RSS 回收证明。
