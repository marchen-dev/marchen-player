# 软解原始平面 HDR 小样

2026-09-08，基线 feat/player-engine / 7cd29a1；本轮仅测试代码，保留 player.css 既有修改。Chrome 152 / H27P3，真实窗口且移除自动化强制 sRGB 参数，未开启实验功能。

## 数据链路

HEVC 无损夹具 → MediaBunny 压缩包 → Worker 中实际 createHevcDecoder / @suemor/libav-hevc@0.1.1（本小样单线程）→ 原始 VideoSample.copyTo → 独立 ArrayBuffer 转移 → WebGPU storage buffer 的 uint16 数据 → WGSL PQ/BT.2020→扩展 sRGB → rgba16float extended canvas。

没有调用 VideoSample.toVideoFrame、importExternalTexture 或 texImage2D(VideoFrame) 作为新输出输入。数据从 libav 的实际输出复制到测试独立缓冲，未转移 WASM 内存。32 帧解码后只传递首帧，Worker 随后关闭；这是颜色小样，不是正式调度或多线程性能验收。

## 可复现验证

```sh
node scripts/player-engine/tests/hdr-precision-fixture.mjs
node scripts/player-engine/tests/hdr-planar-spike.mjs test-results/hdr/precision.mp4 --gray
node scripts/player-engine/tests/hdr-precision-fixture.mjs --luminance
node scripts/player-engine/tests/hdr-planar-spike.mjs test-results/hdr/luminance.mp4 --gray
node scripts/player-engine/tests/hdr-precision-fixture.mjs --colors
node scripts/player-engine/tests/hdr-planar-spike.mjs test-results/hdr/colors.mp4 --reference
```

无损夹具显式设置输入、输出及 HEVC VUI 色彩；解码后逐字节比较原始平面。初次色块夹具只设置输出色彩导致 FFmpeg 转换，断言发现后已修正，未把该次作为无损证据。

### 相邻灰阶

| 原始 Y10 | GPU 扩展 sRGB R | CPU 参考 |
| --- | --- | --- |
| 512 | 0.741211 | 0.741415 |
| 513 | 0.745117 | 0.745188 |
| 514 | 0.748535 | 0.748977 |
| 515 | 0.752441 | 0.752780 |

四档分别保留，R/G/B 中性一致，区别于旧 VideoFrame 导入出现的两两合并。该区间实测最大误差低于 0.0005。

### 高光

以 203 nit 为小样参考白、BT.2020/PQ limited 编码，先对原始 Y10 量化再计算 CPU 参考；输出值是扩展 sRGB 编码，不能直接当 nit。

| 标称输入 nit | 实际 Y10 | GPU 输出 | CPU 参考 |
| --- | --- | --- | --- |
| 100 | 509 | 0.729980 | 0.730184 |
| 203 | 573 | 1.000977 | 1.001521 |
| 400 | 636 | 1.345703 | 1.346666 |
| 1000 | 723 | 1.998047 | 1.998774 |

高光大于 SDR 白，参考误差低于 0.001；203 nit 档不精确等于 1 是输入 10bit 量化造成。断言容差 max(0.0015,参考绝对值×0.5%)，包含 FP16 输出量化及 GPU pow 的偏差预算，同时额外断言四个不同原始灰阶没有合并。

### 色块

四组 YUV 分别为 (512,512,512)、(513,600,460)、(514,420,620)、(515,560,430)。实际软解输出与夹具相同；以原始平面值、BT.2020 NCL 系数、PQ 及色域矩阵独立计算 CPU 数值，全部在 max(0.002,参考绝对值×0.5%) 范围内。

某些 BT.2020 色块超出 sRGB 色域，出现负通道是数学转换结果，不等于显示器能表现这些颜色。小样没有完成最终 gamut mapping；正式阶段须明确映射并验证色彩观感，不能用此结果宣称专业色准已通过。

## 实机观察待反馈

`--view` 会显示上方 extended、下方 standard 的相同四档输出，保留窗口供用户观察，关闭窗口释放测试资源。下方仅是输出范围对照，不是已 tone-map 的 SDR 视频。已请求用户在 H27P3 HDR 开启时确认右侧两块是否上排更亮。

这些数值证明精度与扩展范围进入输出纹理，不独立证明屏幕实际高光；无测光设备，不声称测得实际 nit。任务 1.4 数值小样完成；1.5 等待实际显示反馈及进一步参考对照。完整 1.1 性能基线、HLG、全范围、裁剪旋转、正式 Worker 调度、Electron 打包态、生命周期和产品回归均未完成，不提前勾选。

## 用户显示反馈及系统诊断

用户反馈：在 H27P3 及 MacBook 上，HDR/SDR 两排看起来亮度差不多。此反馈不通过任务 1.5；之前数值成功仅证明纹理内计算，不能升级为屏幕 HDR 交付成功。

再次检查小样 resize/draw 后 getConfiguration：rgba16float、srgb、toneMapping.mode=extended，dynamic-range:high=true，配置没有因 canvas 尺寸调整丢失。

本次 system_profiler 显示当前连接已变为内置 Liquid Retina XDR（3024×1964、自动亮度开启），不是前轮 H27P3。通过 AppKit NSScreen 只读查询得到：maximumExtendedDynamicRangeColorComponentValue≈1.2，maximumPotentialExtendedDynamicRangeColorComponentValue=16，maximumReferenceExtendedDynamicRangeColorComponentValue=0。当前可用扩展范围偏小可能降低肉眼差异，但不能断言是唯一根因或显示器不支持，也不能推广为前轮 H27P3 的值。

Apple 文档说明 current 值随显示条件及 EDR 请求动态变化，potential 值仅表示潜在能力。参考：
- https://developer.apple.com/documentation/appkit/nsscreen/maximumextendeddynamicrangecolorcomponentvalue
- https://developer.apple.com/documentation/appkit/nsscreen/maximumpotentialextendeddynamicrangecolorcomponentvalue

已请求用户临时降低屏幕亮度、保持对照页在前台再观察；没有擅自修改系统亮度、自动亮度或显示配置。任务 1.5 继续待验证。本轮仅给测试输出增加实际画布配置诊断，正式播放器未改。

## 对照页可用性修复

用户截图显示旧页面只有乱码标题、没有色块。根因为 HTML 未声明 UTF-8，且解码/绘制通过启动脚本的一次性 evaluate 注入，刷新或手动打开地址不会初始化。这使此前“看起来一样”的反馈无法用于判断该次页面的 HDR 差异；先前 EDR=1.2 仅保留为环境诊断，不作为页面无差异的根因。

现已改为页面自启动模块，localhost fixture JSON 按需加载，添加 UTF-8、加载/错误状态。自动化验证首次加载和刷新后均 ready 且存在两个 canvas，保存可见页面截图（仅证明页面结构，不证明 HDR 亮度）。新测试实例端口 55498；端口随重启变化。正式播放器未修改。

## 正常页面上的相同亮度反馈与对照加强

用户确认正常两排最右侧看起来同样亮。该次反馈有效，1.5 不通过。随后 AppKit 当前 EDR≈7.65057（potential=16），已不能沿用此前 1.2 的值解释现象。

为避免完全依赖浏览器 standard 模式的显示端限制，给下排增加显式 shader clamp[0,1]：读回右侧为 1，上排约 1.998，且 getConfiguration 分别为 standard/extended。添加独立纯色三块：CSS 白、standard 清屏值2、extended 清屏值2，排除视频解码和 shader 数学。原数值参考测试仍通过，未调整 HDR shader 的亮度倍数迎合观感。

此修订是增强对照，不意味着已证明浏览器 standard 模式有 bug，也不意味着已修复最终呈现。可刷新同一个自启动页面加载修改。新增对照的肉眼结果仍待反馈，正式播放链路未改。

## 同尺寸显示链路检修

用户已确认独立纯色对照的 extended 块比 CSS 白更亮：证明当前 Chrome 到屏幕可呈现扩展亮度，但不单独证明解码色块通过。

本轮将数值读回从独立离屏纹理改为实际画布 getCurrentTexture（增加 COPY_SRC 使用），并避免每次无条件重置 canvas 尺寸。实际呈现纹理高光仍为约 1.998047，明确 SDR 对照为 1；没有发现提交前高光被压平。

新增同尺寸 64×64 比较：CSS 白、从实际 libav 解码帧右侧裁取的原始 10bit 平面、与该视频块实际数值相同的纯色清屏。视频块没有使用构造像素替换，读回四点均为 1.998047，与原高光一致；数值与灰阶参考断言通过。旧大条带缩小为其逻辑尺寸以减少尺寸/缩放差异。此举控制面积和缩放变量，不宣称已证实局部调光或缩放是根因。

本轮未改正式播放器。任务 1.5 仍需同尺寸视频块的实机反馈；只记录纯色测试通过，不把它冒充视频 HDR 验收通过。
