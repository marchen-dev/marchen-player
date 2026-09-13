# 正式入口验证记录

变更：migrate-compat-video-presentation。工作区为 feat/player-engine，未提交 WIP。
保留原有 player.css 修改。旧真实文件实验页面改为直接使用正式适配器，不再替换 Canvas renderer。

## 实际运行范围

- Web：桌面 Chrome，正式 `/#/player` 入口，开发服务 localhost:1107。
- Electron：本地未签名 arm64 应用包，`app.isPackaged=true`，实际 `marchen://app` 协议及媒体租约。
- 两者仅在验收进程替代文件选择对话框及弹幕匹配网络响应；源文件读取、Worker、WASM、音频与播放 UI 均走正式代码。
- Electron 44 / Chromium 152，H27P3 显示器；系统报告每分量 10 bit，浏览器报告 dynamic-range:high。
  这些环境属性不等于最终输出专业色准证明。自动化移除了强制 sRGB 参数。

## 已观察结果

1. Arcane HEVC PQ/EAC3 在 Web 和打包态通过兼容内核显示。WebCodecs 和 HEVC WASM 都能播放；
   WASM 路径通过测试时临时设置资源 forceSoftware 进入，不增加产品开关。
   从正在显示及停帧的 video 再读 VideoFrame，均保留 PQ/BT2020。
2. YouTube 下载样片以 `ffmpeg -map 0 -c copy` 无损封装为临时 MKV 后从正式入口读取。
   实际为 AV1 1920×1080 59.94fps PQ，并非文件名所称 4K；不新增 WebM 产品导入支持。
3. HEVC SDR 10-bit / AAC 和 AVC SDR 8-bit 无音轨样片正常显示。无音轨样片结束状态正确；
   SAR=2 的 320×180 编码画面以 640×180 显示。
4. 暂停冻结音频上下文与媒体时钟，video.paused 保持 false，提交/呈现计数停止增加。
   连续 seek 最终定位 90 秒；暂停中变为 1.5 倍速和换 EAC3 音轨后仍暂停，继续播放可正常送帧。
5. 视频 2 秒、音频 5 秒的样片在音频尾部继续运行；暂停恢复后到 5 秒结束，画面维持最后一帧，
   所有已排程音频节点自然释放，无额外视频帧。
6. 正式设置可在兼容与原生之间切换，独立 video 表面互斥显示并保留暂停位置。
   旋转、全屏、外挂 ASS 字幕和非方形像素画面已截图；时间轴预览成功生成 240×135 缩略图；预览/字幕 Canvas 仍为独立用途。
7. 测试注入一次 video.play 拒绝后，旧轨道结束、解码器与音频上下文释放；点击重试恢复到目标 120 秒。
   首帧启动修复了新流 loadstart 前写入导致首帧被丢弃的问题，并有挂载期间取消回归测试。
8. 约 60 秒 Arcane / WebCodecs 打包态采样保存于 formal-performance.json。三轮切源后旧 track=ended、
   context=closed、client 不存在、音频节点=0。进程内存仍包含缓存与 GC 波动，三轮不能证明无限时间无泄漏。
   openMs 是切源操作到 video.readyState=4 的墙钟时间；seekMs 是暂停定位完成时间。
   app.getAppMetrics 中 GPU 项是 GPU 进程 CPU/RSS，不是 GPU 运算占用率或显存。

## 自动检查

Node 24 类型检查、167 项针对性测试、Web 和 Electron 构建通过。本地 unsigned app 打包通过。
改动范围 ESLint 无错误；保留既有 useNativePlayerRuntime 的 setRuntime-in-effect 警告。
构建保留已有 chunk/dynamic import/Sentry 未配置上传凭据提示。没有发布应用或上传源映射。
生产引用审计：主画面无 Canvas renderer；Canvas 仅用于预览、历史缩略图与 libass 字幕。

## 尚未证明

- 正式版本在 HDR 显示器上的高光、暂停亮度和 SDR 映射观感等待用户验收，截图不等于 HDR 亮度测量。
- 当前没有 HLG 实文件、Windows/Linux 目标机、多显示器切换或专业色度计证据。
- 软解短样片可播放不等于所有分辨率/帧率均实时，也不证明完整 HDR 元数据无损。
- 未执行旧 Canvas 同条件 A/B 测试，不据此给出性能提升百分比。
- 长同步测量使用合成闪光/蜂鸣素材、video 呈现回调与 Web Audio 分析节点。
  分析节点位于扬声器之前，不能替代回环录音或人工口型检查；有测量器重连间隙需剔除。

## 复现入口

`scripts/player-engine/tests/compat-video-acceptance.mjs` 接受 MARCHEN_TEST_APP、MARCHEN_TEST_FILE、
可选 MARCHEN_TEST_EVIDENCE。运行后在正式应用中停帧供人工查看，关闭窗口结束。
长测、故障注入和打包矩阵的 JSON 分别记录实际运行观察，不把它们当作产品平台支持承诺。

60 秒采样的 Electron 进程 CPU 合计中位数约 17.6%，进程 RSS 合计范围约 471–717 MiB。三轮切源后 RSS 分别约 580/464/329 MiB；这是有限运行观察，不是 Canvas A/B 性能结论。

## 长同步测量结果

运行 637.2 秒，覆盖 1x/1.25x、暂停恢复和跳转。按 outputLatency 估算后，
首分钟中位偏移 46.0 ms，末分钟 36.0 ms，
全程中位 52.0 ms，P05/P95 为 18.9/69.6 ms。
正值表示视频较分析节点加设备延迟的估算音频输出晚。没有观察到随播放时长持续累积的大幅漂移，
但异常值范围 -122.1 至 261.4 ms，不能判定为严格音画同步验收通过。
测试同时进行了其他窗口操作，存在后台恢复/音频上下文重建；约 166 秒修复分析节点重连，
该间隙缺失样本，已保留原始记录及全部配对异常值。下一步需独占前台或回环录音定位瞬态抖动；
未向播放器加入固定补偿。
