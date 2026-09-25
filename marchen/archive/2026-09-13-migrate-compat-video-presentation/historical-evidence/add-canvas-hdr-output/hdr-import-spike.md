# HDR 导入初步验证

日期：2026-09-08。基线 feat/player-engine / 7cd29a1；未改 player.css 既有变更。任务 1.1 的完整性能基线未完成，不勾选；任务 1.2 遇到导入色彩问题，尚不进入正式渲染接入。

## 环境与输入

系统 GPU Apple M4，10 GPU 核；H27P3 在线主屏，5120×2880、逻辑 2560×1440、60Hz。用户提供系统截图显示 HDR 已启用。Chrome 152.0.0.0；真实窗口、viewport=null、移除 Playwright 默认 --force-color-profile=srgb 后，dynamic-range:high=true，video-dynamic-range:high=false。localhost 安全上下文可请求 WebGPU device，rgba16float / extended 配置成功。

不能把默认自动化 sRGB 配置的 false 误报为屏幕不支持 HDR。

Arcane 原外接卷路径当前不存在；本地替代《你的名字》视频经 ffprobe 确认为 HEVC Main10、3840×2160、24000/1001、yuv420p10le、limited range、BT.2020 NCL、PQ。不在证据中保存媒体内容或绝对私有路径。

## 已运行的验证

命令：`node scripts/player-engine/tests/hdr-output-spike.mjs`。构造已知亮度 I420P10 PQ 中性灰，通过 importExternalTexture(colorSpace=srgb) 直接采样输出至 FP16，再读取测试纹理。读回只属于测试，不进入播放链路。

| 输入 PQ 灰阶（nit） | 输出 RGB 各通道约值 |
| --- | --- |
| 100 | 0.73877 |
| 203 | 0.78564 |
| 400 | 0.82715 |
| 1000 | 0.87988 |

四档仍可区分，但全部低于 SDR 白 1.0。当前直接导入链路没有呈现预期的扩展高光，不能以 FP16/extended 创建成功宣称完成 HDR。须进一步核查浏览器导入 tone mapping、可用的 headroom 控制和正确色彩转换，不能简单放大结果冒充原始高光恢复。

命令加一个本地媒体路径参数可使用 MediaBunny 解封装前 32 个关键帧起始压缩包并请求 prefer-hardware WebCodecs。真实视频验证已成功获得 format=null 的 4K PQ VideoFrame 并导入 GPU；这仅说明不透明帧可导入，既不证明实际硬解，也不证明高光保留。真实帧四点没有已知 nit，禁止套用合成灰阶标签解释。

## 边界与下一步

还未做正式播放器性能基线、Electron 打包态、屏幕实际亮度对比和正式渲染接入，所有任务保留未完成。

相关上游问题： https://github.com/gpuweb/gpuweb/issues/5236 ，讨论为外部纹理导入增加 HDR headroom 控制。它提供排查方向，不等于已确认本机存在可用接口。

暂停在任务 1.2 的技术验证：建议修订规划，先核对导入 headroom/无损色彩路径；如果需要读回硬解 YUV，则先量化成本再决定，不擅自切换软解。

## 第二轮：编码、精度与 Electron 对照

本轮纠正初轮解释：低于 1 的结果不能直接断言为 tone mapping。已知 PQ 编码 100/203/400/1000 nit 对应约 0.50808/0.58069/0.65258/0.75183。直接对这些编码做 sRGB 编码得到约 0.74060/0.78641/0.82833/0.88201，与实际读回接近（绝对差小于 0.003）。这提示传递函数处理问题及中间量化，不证明已经定位全部颜色行为。

### 完成的数学/资源对照（任务 1.2）

- 合成布局：8×2 的 Y 平面 16 个 uint16，U/V 各 4 个 uint16，中性值 512；limited range Y=round(64+876×PQ)，对应 I420P10。
- PQ 使用 ST2084 常数；目标解释必须区分 PQ 编码、线性绝对亮度与 sRGB 编码。以 203 nit 为研究参考白时，理想线性亮度分别约 0.49261、1、1.97044、4.92611；这只是指定参考白的数学对照，不能当作 OS 当前实际白点或屏幕测量。
- `--direct` 忽略外部纹理直接写入 FP16 常数 4.0，读回 RGB 精确为 4.0：测试目标没有将值截为 1；不证明最终屏幕实际亮度。
- `--precision` 输入 Y10=512/513/514/515，输出 0.741699/0.741699/0.744141/0.744141。相邻输入本应有不同的线性亮度，实测存在精度合并；这是精度失败证据，不作为成功容差放宽。FP16 直写对照在 4.0 应精确，其余正式色彩容差仍须在选择正确路径后按量化推导。

### 导入参数和版本核查（任务 1.3）

命令使用同一脚本的 `--color=display-p3`、`--color=rec2100-pq`、`--experimental --color=rec2100-pq`，以及 `--electron`。

- Chrome 152 默认 sRGB 与 Display P3 的中性灰结果一致。
- 默认 Chrome 拒绝 rec2100-pq 枚举；启用实验 Web Platform 参数后接受，读回约 0.50586/0.58008/0.65088/0.74854，接近原始 PQ 编码且仍可见量化。这里小于 1 本身是 PQ 编码正常性质，不可解释为 SDR。实验配置未经生产及精度验收，不进入播放器。
- Electron 44.0.0 / Chrome 152.0.7977.54 的默认 sRGB 和实验 rec2100-pq 结果与 Chrome 对照一致。此为隔离 Electron 测试窗口，不是 Marchen 打包应用验收。
- hdrHeadroom getter 未被调用，默认/实验两类调用均不读取该候选字段；上游 GPUExternalTextureDescriptor IDL 也只有 source 和 colorSpace。不能认为参数已生效。
- 本轮读取的 Chromium main external_texture_helper.cc：零拷贝条件包含 NV12；非零拷贝分支选择 N32，只有 RGBAF16 源使用 F16，并有高位深格式尚未使用 F16 的注释。主线源码是解释线索，不冒充对已安装二进制逐提交归因。

源码链接：
- https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webgpu/gpu_external_texture_descriptor.idl
- https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webgpu/external_texture_helper.cc

### 真实硬解帧与替代读取（任务 1.4/1.5 部分证据）

同一本地 4K PQ 视频在 Electron 中通过 CDP Media 域记录 kVideoDecoderName=VideoToolboxVideoDecoder、kIsPlatformVideoDecoder=true；帧格式为 null。这比 prefer-hardware 提示提供了更明确的平台解码器证据，但不声称测得硬件引擎占用。

Chrome 和 Electron 对真实帧申请 I420P10、I420、RGBA 的 allocationSize 均抛出 format=null 不支持；RGBAF16 不是有效 VideoPixelFormat。读取路线在分配前被拒绝，没有可用数据可做性能测量，不能写成“读回成本低”。

### 当前阻塞及未完成项

已测的默认外部纹理、实验色彩参数及标准 copyTo 路径未满足高精度硬解 HDR 要求。不能任意提亮、强制软解或把实验开关隐含交给用户。尚未验证 WebGL 等其他 GPU 导入桥接，不能宣称所有浏览器路径都不可能。

任务 1.2/1.3 完成核查；1.1 性能基线、1.4 完整色块和真实 HDR 正确性、1.5 可用替代路径、1.6 实机交付证据均未完成。继续扩大到 WebGL 桥接/原生呈现或浏览器补丁需要调整当前实现方案；正式播放器未改，SDR 路径不受影响。

## 第三轮：WebGL 高精度桥接候选

用户授权继续该候选验证；只扩展测试脚本，没有接入播放器。

- WebGL2 开启 EXT_color_buffer_float，texImage2D 从 VideoFrame 导入到 RGBA16F/HALF_FLOAT，分别设置 UNPACK_COLORSPACE_CONVERSION_WEBGL=NONE 与 BROWSER_DEFAULT_WEBGL；FBO 完整且上传/读回 GL 错误均为 0。
- 合成 I420P10 输入 Y=512/513/514/515，NONE 读回约 0.509766/0.509766/0.513672/0.513672，相邻值合并；默认转换也合并。提高目标纹理精度不足以避免输入阶段的损失。
- 使用 `hdr-precision-fixture.mjs` 生成 256×64、32 帧的 HEVC lossless 夹具，显式写入容器及码流 VUI 的 BT.2020/PQ/limited range；FFmpeg 解码首帧与原始 YUV 逐字节一致，排除源编码丢失。首个未显式写入 VUI 的尝试输出 bt709，已弃用，不用于结论。
- Electron 44 验证该夹具时帧 colorSpace 为 BT.2020 NCL/PQ，CDP 记录 VideoToolboxVideoDecoder。WebGL NONE 与默认转换的四档 RGB 分别为约 (0.509766,0.509766,0.509766)、(0.509766,0.513672,0.509766)、(0.513672,0.513672,0.513672)、(0.513672,0.513672,0.513672)，存在两档合并及中性灰偏色，不能认为正确保留 10bit。
- 本地真实 4K PQ 视频也能导入 WebGL，但四个空间采样不是已知亮度，不能证明其色准。读回时间包含首次驱动初始化、同步与验证读取，不当作播放渲染耗时或性能承诺。

复现：

```sh
node scripts/player-engine/tests/hdr-precision-fixture.mjs
node scripts/player-engine/tests/hdr-output-spike.mjs --precision
node scripts/player-engine/tests/hdr-output-spike.mjs --electron test-results/hdr/precision.mp4
```

结论：本轮 WebGL RGBA16F 导入候选未解决精度问题，不继续实现 GPU 桥接后半段，以免把低精度结果标为合格 HDR。已验证范围包括默认 WebGPU、WebGL 直接导入、标准 copyTo；不推广为浏览器所有可能路线均不可行。当前仍无法在既定范围内交付已验证的高精度硬解 HDR，任务 1.5 保持未完成。后续需要明确是否改变呈现架构或交付范围，不能擅自用强制软解替代。
