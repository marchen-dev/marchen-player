# HEVC 内存增长修复记录

状态：原始写入越界已定位并修复；2.2、2.6、2.7 整体尚未完成。日期 2026-09-06。

固定源码构建保留 24 MiB 初始内存。源码补丁在复制前检查 wasmMemory.buffer 的身份与长度，必要时调用 updateMemoryViews 刷新所有类型视图，覆盖包写入、视频帧读出和生成的复制辅助函数。没有增大初始分配，也没有手改生成文件。

原始失败发生在 ff_set_packet 的 Uint8Array.set。诊断观测：指针 47603960、包长度 41149、旧视图长度 25165824、真实内存长度 52297728，且 buffer 身份不同。写入范围在真实内存内，却超过旧视图；这是 JS 胶水层视图失效，未发现 HEVC 解码算法本身越界。上游版本、当前工具链和已有适配补丁的责任归属尚未逐项隔离。

Chrome 152、Apple M4、隔离页面专用 Worker，以授权的 1080p Main10 样片提取 180 包：普通版 1 线程及线程版 1/2/4 线程均解出 180 帧，逐帧完整像素 SHA-256 一致、输出 PTS 无倒序。该对比证明配置间一致性，不等价于独立参考解码器验证。

仓库回归：scripts/player-engine/tests/memory-growth.mjs；结果保存在忽略的 test-results/player-engine/memory-growth.json。测试页面没有 CSP，只配置 COOP/COEP；本地媒体压缩包只在内存提供，不入库。

仍需正式 Worker 入口、连续 seek/取消、线程栈与参考帧预算、退出回收、长时间播放和 Electron 打包/Web 部署验证。因此不勾选 2.7，不删除旧路径。回归 Worker 中的 __filename 仅为实验入口处理。

追加回归：四种配置均在同一 WASM 运行时完成三轮创建、180 帧解码、flush 和释放，共 2160 帧；各轮及各配置的逐帧像素一致。普通版观察刷新后的堆视图，线程版直接观察真实 WebAssembly.Memory；均断言从 24 MiB 实际扩容。各轮末堆大小见本机 JSON。WASM 堆不收缩，堆大小相同不单独证明没有泄漏。定向 ESLint、Prettier 和 git diff --check 通过。

## 2026-09-06 ESM 与正式适配追加核对

新增 ESM 构建，通过 import.meta.url 定位 pthread；测试已移除 __filename。四种配置三轮完成扩容与完整 Main10 平面像素对比。此前 video_packed 按每分量 1 字节复制，对 10-bit 只复制部分行；旧哈希不能证明完整像素。本轮改用 video 原始 stride，按每分量 2 字节、三平面有效行重新比较，2160 帧一致。

新增 src/renderer/src/services/media/hevc-decoder.ts 最小 CustomVideoDecoder，尚未注册到产品。单线程经过 VideoSample 的 180 帧完整像素一致。4 线程在关闭时失败：TypeError: Cannot read properties of undefined (reading 'terminate')。

libav frontend.in.js 的 terminate 遍历 unusedWorkers.concat(runningWorkers)，Emscripten 6.0.5 已没有 runningWorkers，提供 pthreads 和 terminateAllThreads。需修复版本适配并验证释放；尚未修改这个补丁。此前回归通过 Proxy 将 terminate 包装为 Promise 但未等待，成功消息又先于终止发出，存在假成功；现已改为等待后再报告成功。旧结果不作为退出回收证据。完整回归在此问题修复前应失败。

Node/Web typecheck 通过。任务 2.2/2.6/2.7 均保持未完成，整体 5/68，按 apply 暂停于线程退出阻塞。后续仍需 8-bit、Annex B、长期/连续取消和真实平台验证。

## 2026-09-06 线程退出补丁验证

状态更新：上述 runningWorkers 退出阻塞已修复。源码补丁改用固定 Emscripten 6.0.5 的 PThread.terminateAllThreads()；构建脚本重新生成普通/线程版 JS 与 ESM 入口，manifest 记录新补丁及产物 SHA。未改 FFmpeg 解码算法。

完整回归通过：普通 1 线程与线程版 1/2/4 线程各三轮、每轮 180 帧，实际扩容及完整 Main10 有效像素一致；每个实例两次 terminate 均成功。四组的未调用终止 Worker 数、运行线程登记数、空闲登记数全部为 0。MediaBunny 最小适配器 1/4 线程均输出 180 帧完整像素一致，close 两次成功。测试在关闭后才报告成功。

这证明原始退出异常已解决和清理调用/登记正确，不证明浏览器线程同步退出或 GC/RSS 立即回落。初始化/解码中取消、长时间播放和正式平台验收仍未完成，2.2/2.6/2.7 暂不整体勾选。定向 ESLint、Prettier、git diff --check 通过。

## 2026-09-06 最小适配关口推进

2.2、2.3、2.6 已完成，当前8/68。新增完整记录见 decoder-contract.md；8-bit、Main10及合成4K的短测汇总见 decoder-short-benchmark.json。连续重建/取消通过，但正式播放器 seek、宿主强制退出超时、长期 RSS、HDR色彩与跨平台部署仍未验收，2.4/2.5/2.7/2.8保持未完成。
