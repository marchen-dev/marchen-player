# 浏览器字幕提取方案

MediaBunny 1.55.7 的 matroska-demuxer.ts 仅为 TrackType 1/2 创建音视频 backing；没有公开字幕输入轨读取接口。附件查询继续使用 MediaBunny，不能把附件接口当字幕读取。

选择自有最小 Matroska 字幕读取补充层，不增加完整播放器或 FFmpeg 解封装。新增代码沿用仓库 AGPL-3.0，不复制第三方解析器实现；格式依据 Matroska 官方规范：

- https://www.matroska.org/technical/subtitles.html
- https://www.matroska.org/technical/elements.html

接口边界：由共享 source 提供 size 和 read(start,end,signal) 的按需读取；字幕层只持有消费者租约，不关闭全局 source。目录返回 TrackNumber/TrackUID、CodecID、语言、名称、default/forced 与是否支持；读取指定轨返回头部和带开始/结束时间的事件。

仅解析必要 EBML 层级：Segment/Info/Tracks/Cluster/BlockGroup；跳过音视频块数据。ASS/SSA 保留 CodecPrivate，按 Block 时间和 BlockDuration 重建事件，保留 ReadOrder 和带逗号的文本。UTF8 字幕返回文本事件；图片字幕可列出但不解码。附件不重复实现。

后续实现须覆盖：未知长度容器、变长整数边界、非零时间与负 Block 偏移、默认时长、轨道压缩/不支持编码的明确降级、取消、选中轨预算与损坏边界。目录读取不等于全片扫描完成。复杂格式的限制必须体现在单轨错误，不能阻断视频。

本记录完成方案选择（3.1），不是 3.2–3.4 运行证据。

## 3.2 实现与验证

- 实现位于 services/media/subtitles/matroska.ts，仅依赖按需读取接口，不含 Node imports、不关闭共享来源。事件通过异步迭代输出。
- 保留 CodecPrivate、64 位 UID、轨号、语言（优先 IETF）、名称、默认/强制标记；处理容器时间、负相对时间和未知长度 Segment/Cluster。ASS/SSA 事件还原保留 ReadOrder、层级和文本逗号。
- 四项定向单测通过：元数据/图片识别、多轨时间/未知长度/ASS/SSA、取消/短读、损坏事件。Web 类型检查通过。
- Chrome 真实 Blob 按需读取 FFmpeg 生成的小 MKV：两条 ASS 的 5–7.5 秒、9–10 秒、样式层级、中文/逗号、语言及 forced 标记均与生成输入一致。结果保存在忽略目录 test-results/player-engine/subtitles/result.json。
- 未执行正式 libass 布局/字体/长片内存验收，仍由 3.4 与第 7 节承担。压缩/加密轨、非默认轨时间缩放、字幕 lacing 明确拒绝，不误报支持。

## 3.3 文本字幕转换

内嵌 UTF8、损坏 ASS 事件后另轨读取、图片轨识别和外挂 SRT/WebVTT 转 ASS 已有 8 项定向测试；Web 类型检查通过。SRT/WebVTT 保留时间、换行和基础 b/i/u，WebVTT CSS/区域/位置等不能等价保留的能力返回 warnings。FFmpeg 从代表 MKV 导出的 SRT 再转换，5–7.5 秒与 9–10 秒及中文一致。正式字幕菜单展示 warnings 在第 7 节接入，不冒充当前 UI 已可用。

## 3.4 待决策

MediaBunny 1.55.7 matroska-demuxer.ts 的 loadSegmentMetadata 对 Attachments 调用 requestSlice(..., size)，FileData 直接 readBytes(..., size)，随后保存在 AttachedFile。当前公开接口不能先列附件大小再选择读取；仅在 getMetadataTags 返回后执行 32 MiB 字体缓存限制不能约束读取峰值。需要确认增加最小附件大小预检/超限回退边界，或扩展库的按需附件接口。当前未勾选 3.4，未改用无界附件读取。

## 3.4 已按确认方案实现

附件查询前累计容器预算，超限/损坏/未知长度回退。预算内使用独立 MediaBunny Input，取消只销毁附件消费者。字体 URL 交给 libass，字体变化重建 Worker；释放幂等。

Chrome 冒烟：带 4,255,008 字节 WOFF2 附件的 MKV 读取成功；实际 libass 画布默认字幕 Y=329–350，an8 字幕 Y=13–32（640×360），关闭后 URL 数为 0。超限附件仅读结构头；模拟 4 GiB Cluster 的预检总读取少于 40 字节。相关字体/适配器测试和 Web 类型检查通过。这里验证的是读取/资源边界及小样片绘制，正式长期播放 RSS 仍在收尾验证。

## 4.1 共用来源 owner

source-owner.ts 为 Web File 使用 BlobSource、Electron 按需来源使用 CustomSource，消费者共用 Input；租约取消隔离，最后释放和切源统一关闭，迟到读取丢弃。三项来源测试通过，尚未替换旧播放入口。
