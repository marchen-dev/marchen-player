# HEVC 发布包资源

活动入口为 `pnpm media:prepare`，开发和构建命令自动执行。依赖精确锁定为
`@suemor/libav-hevc@0.1.1`，完整性由 pnpm-lock.yaml 固定；复制前逐个校验包内
manifest 的文件体积及 SHA-256。保留原始文件名，资源、许可证及 sources 一起复制到
`public/wasm/libav/0.1.1`，无需运行时 CDN 或本仓库编译 FFmpeg。

0.1.1 提供 direct/threads 模式的同步内存诊断，固定 5 个 pthread Worker（含调度线程），
初始线性内存 24 MiB，上限 768 MiB，均按实例计算。播放器仍保留接口缺失时返回 null 的兼容处理。
配置 4 个解码线程不等于只创建 4 个 Worker，线性内存不代表进程 RSS。
必要库修复应在独立 libav.js 仓库发布后更新依赖。

接包快速检查（一个代表样片，普通版与 4 线程各一次、重复关闭）：

```sh
node scripts/player-engine/tests/package-regression.mjs "$MARCHEN_HEVC_SAMPLE" 60 60
```

输出 `test-results/player-engine/package-smoke.json`。不等同于正式播放器长期播放、
Electron 打包或线上跨源隔离验收。发布包升级不自动重跑完整矩阵。

## 扩展接入与生命周期检查

仅在适配器、生命周期或渲染链路改变时运行：

```sh
node scripts/player-engine/tests/package-regression.mjs "$MARCHEN_HEVC_SAMPLE" 60 180 --extended
```

所有模式只读取当前安装的发布包资源。扩展模式覆盖 hvcC/Annex B、时间戳、真实 Worker 重建/取消及呈现短测，输出 package-regression.json；不重复库侧内存扩容、固定池和上限测试。库侧验证由独立 libav.js 仓库负责。

精确取消时序的单元测试：

```sh
pnpm exec vitest run --config vitest.player-runtime.config.ts src/renderer/src/services/media/tests/hevc-decoder.test.ts
```

旧自建构建器、配置与补丁已移除。历史验证结论保留在变更的 evidence 记录中，其旧路径仅用于说明当时的验证过程。

## HDR 色彩参考

参考环境独立于应用依赖，安装在本机缓存中：

```sh
brew install ffmpeg-full
python3 -m venv .cache/player-color-reference
.cache/player-color-reference/bin/pip install -r scripts/player-engine/tests/color-reference-requirements.txt
MARCHEN_REFERENCE_FFMPEG="$(brew --prefix ffmpeg-full)/bin/ffmpeg" node scripts/player-engine/tests/color-contract.mjs
```

可通过 MARCHEN_REFERENCE_PYTHON 指定参考 Python。PQ使用FFmpeg zscale；HLG使用Colour的BT.2100亮度相关EOTF后接FFmpeg tone-map，避免把zimg逐通道近似作为精确HLG参考。8组范围/位深对比固定容差3，不因失败放宽。输出包含实际GPU画布和独立参考图，均是合成色块。候选固定1000nit源峰值，完整播放器动态元数据及HDR输出另行验收。
