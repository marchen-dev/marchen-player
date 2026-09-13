# HDR 色彩候选与当前阻塞

状态：任务2.5未完成，整体8/68。候选未注册到正式播放器，2026-09-06。

已核对授权 Main10 影片：MediaBunny 的 getColorSpace 与 getDecoderConfig.colorSpace 均为 bt2020 / pq / bt2020-ncl / limited；当前自定义解码器将 config.colorSpace 传入 VideoSample。此前仅证明像素传输，不证明最终呈现。

新增候选 render/hdr-sdr.ts 与 hdr-sdr.frag：WebGL2 R8UI/R16UI 三平面纹理保留位深；限定明确的 BT.2020 NCL PQ/HLG 输入；PQ以100 nit为线性单位，HLG以1000 nit峰值及1.2 system gamma；BT.2020→BT.709线性矩阵、Hable（固定1000 nit源峰值）与sRGB编码。它是有待验证的候选，不代表完整HDR输出、动态峰值/元数据、所有色域映射或生产质量验收。

独立对照脚本 color-contract.mjs 使用11组灰阶/色块，计划比较 FFmpeg zscale+tonemap=hable:desat=0:peak=10，固定容差3个8-bit码值。测试环境本机 ffmpeg、ffmpeg@8、ffmpeg@9 均不含 zscale，因此尚未产生对照结果，也未运行到 GPU 数值比较，不能报告通过。

下一步：补齐含zscale/tonemap的本机参考工具，可通过 MARCHEN_REFERENCE_FFMPEG 指定；重跑后分析PQ/HLG差异，再补源峰值、full range、crop、真实WASM帧和视觉检查。测试工具只用于离线参考，不加入应用播放链；不恢复旧播放转码。

数学来源：ITU-R BT.2100（PQ/HLG），FFmpeg libavfilter/vf_tonemap.c（Hable）。候选结果仍需独立数值/视觉证据，不能以公式存在或类型检查通过替代。

## 2026-09-06 参考工具补齐与关口结果

ffmpeg-full 已安装（独立 keg，不改变默认命令），支持 zscale/tonemap。原始参考链的输出色域/矩阵必须显式指定，避免未标记 rawvideo 导致 no path between colorspaces。

首次对比：PQ误差<=1，HLG灰阶接近但彩色色块差26。核对 zimg release-3.0.6 gamma.cpp，arib_b67_eotf 注释明确采用逐通道修正；该近似与候选的 BT.2100 亮度相关 OOTF不同。未修改候选去迎合近似，也未放宽容差。新增 Colour 0.4.7 的 eotf_BT2100_HLG + RGB_to_RGB 作为独立HLG标准参考，线性结果交给FFmpeg Hable/sRGB阶段。

最终8组：PQ/HLG × 8/10-bit × limited/full，full组同时测试非零横向裁剪；每组9或11个中心灰阶/色块，预设容差3，最大误差全部为1。GPU实际画布与独立参考PNG已本机保存并检查，灰阶、蓝红色块一致。额外以授权Main10真实WASM帧经VideoSample复制保持YUV10上传GPU，绘制和像素读回错误检查通过；该项只证明真实帧通路，不冒充整幅电影画面的独立像素对照。

任务2.5按候选验证范围完成，当前9/68。正式渲染接入、动态源峰值/元数据、复杂色域映射、完整画面参考、性能和跨平台/HDR显示器仍属于后续任务。

本机结果：test-results/player-engine/color/result.json 及 pq/hlg-8/10-limited/full.png；真实WASM GPU通路结果为test-results/player-engine/memory-growth.json的render配置。私有影片内容未提交。

参考来源：
- https://github.com/sekrit-twc/zimg/blob/release-3.0.6/src/zimg/colorspace/gamma.cpp
- https://github.com/colour-science/colour/blob/v0.4.7/colour/models/rgb/transfer_functions/itur_bt_2100.py
- ITU-R BT.2100与FFmpeg vf_tonemap.c
