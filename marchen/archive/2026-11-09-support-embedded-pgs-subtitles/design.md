## 背景

### 现状

内嵌字幕链路只服务文本格式：

```
embedded-catalog.list     MatroskaSubtitles.open → 轨道目录（PGS 被 supportedCodecs 判为 codec 不支持）
embedded-catalog.resolve  openPlaybackResource → resolveEmbeddedSubtitle 读完整轨 → Blob URL
                          finally: resource.close()（文本已在内存，用完即关）
context.tsx               fetch(url) → LibassSubtitleAdapter.setTrack；rAF 中 adapter.sync()
                          resize()：按 presentation 尺寸、容器尺寸和 data-rotation 计算画布
```

`matroska.ts` 中已有可复用的基础：带 1 MiB 预读窗口的 EBML `Reader`、SeekHead → Cues 解析（`indexedCues` 前半段）、有限并发按索引读块、zlib / 头部剥离 `decompress` 及 4 MiB 单块解压预算。兼容内核的 Worker 已经通过 `CompatResource.source`（`{ kind: 'file' } | { kind: 'url' }`）在 Worker 内读取媒体，Electron 的 `marchen://` 租约 URL 与 Web 的 File 都能在 Worker 中读取。

### 实测数据（《你的名字》UHD BluRay Remux，12.9 GB，6 号轨 chs&jpn）

| 项 | 值 |
|---|---|
| 显示集 | 8027 个；Epoch Start 1016 / Acquisition Point 5914 / Normal 1097 |
| 每个显示集的对象数 | 0 个 1097（全是清屏），1 个 4734，2 个 2196 |
| 存储 / 解压后 | 106 MB / 212 MB；单块 p95 35 KB，最大 59 KB |
| 画布 | 1920×1080（视频为 3840×2160）；常见对象约 707×115 |
| Cues | 每个字幕块都有索引；Cues 元素 864 KB，Python 解析 0.32 s |
| 回溯 | 最多 1 步、9.9 s（只有清屏包需要往回找） |
| 密度 | 30 s 窗口中位数 18 个显示集；片尾曲 6050 s 起为 24 fps 动画，30 s 内 367 个、10.7 MB |
| 时长 | 块没有 BlockDuration，结束时间由下一个显示集决定；单句最长显示 24 s |
| 颜色 | 不透明调色板 Y 范围 68–154（limited）。门槛 1.3 实测：mpv 在 SDR 输出下字幕主体约 178 / 255，BT.709 直接换算为 161（见 `evidence/gate/hdr-palette.md`） |

这是唯一的本地样本，其他来源的光盘（epoch 链更长、强制字幕、无字幕 Cues）尚未覆盖。

### JS 测速（Node 24，Apple Silicon，本地 SSD，文件已在系统缓存中，偏乐观）

| 环节 | 实测 |
|---|---|
| 解析 Cues（864 KB，本轨 8027 条） | 60–80 ms |
| 随机跳转 50 次：读取 + 解压 + 解码前 8 个显示集 | 平均 1.5 ms，最差 3.4 ms |
| 普通段 30 s（9 个显示集，53 KB） | 共约 30 ms |
| 片尾曲 30 s（367 个显示集，7 MB） | 读 103 ms + 解压 31 ms + RLE / 调色板 67 ms，平均每个 0.55 ms |
| 单块解压 | `DecompressionStream` 0.14 ms，`inflateSync` 0.04 ms |
| RLE + 调色板 | 约 500 万像素/ms；片尾曲 30 s 共 3350 万像素（全部解码约 134 MB RGBA） |

未测：浏览器中的 `createImageBitmap` / `drawImage`，以及 Electron `marchen://` 单次 Range 请求的往返开销。

### Cluster 密度（50 分钟处 30 s）

49 个 Cluster（平均 1.5 MB），1796 个块（约 59 块/秒，主要是 4K 视频和 4 条音轨），共 72 MB。这决定了缺少字幕 Cues 时的扫描代价：用大块预读要读约 72 MB；只读块头则约 1800 次请求。

### 约束

- 两端：Electron 与 Web 桌面端；两个内核：H5 与兼容。字幕由 playback-core 时钟驱动，不绑定 video 元素。
- 不新增第三方依赖。libpgs（MIT）只支持整份 `.sup` 加载、整轨常驻内存，与窗口加载模型不符；解析和 RLE 逻辑自行实现（规范小，约 300 行）。
- 遥测只通过 `services/telemetry` 封装；纯解析模块不依赖遥测 SDK。
- 测试素材必须是自行构造的 PGS，不得把商业影片的字幕提交进仓库。

## 目标与非目标

**目标：**

- 本地 MKV / MK3D 内嵌 PGS 在两端、两个内核上正确显示；UHD HDR 原盘在 SDR 输出下的字幕亮度与 mpv 接近。
- 首张字幕的读取量与整条轨大小无关；内存、并发、后台读取都有上限。
- 跳转、换轨、关闭都能可靠取消，迟到结果不出现在画面上。
- 文本字幕路径的行为保持不变。

**非目标：** VobSub、M2TS / TS、远程来源（WebDAV、直链、Jellyfin、Emby）、外挂 `.sup`、调整 PGS 字幕大小、“只显示强制字幕”模式、OCR、为无 Cues 文件建立全片索引。

## 决策

### 0. 验证门槛先于正式接入

正式接入前完成两项验证，结论写入 `evidence/gate/`：

1. **缺少字幕 Cues 时的有限扫描**：用 `mkvmerge --cues <PGS 轨>:none` 重新封装样本，并用 ffmpeg 重新封装一份（只有视频关键帧 Cues）。首次扫描范围为目标时间往前 10 s、往后 5 s。分别测量跳到 10 / 50 / 100 分钟后第一张字幕的耗时、请求次数和字节数，并测量 Electron `marchen://` 单次 Range 请求的往返耗时。达标线：本地 Electron 冷启动 ≤ 1.5 s。按 Cluster 密度，字节数无法压到几十 MB 以下，因此不设字节上限，只记录。用实测结果决定扫描采用“只读块头”还是“预读窗口”，或两者结合。不达标时修订第 5 节，不临时扩大扫描范围。
2. **HDR 颜色**：在 3 个时间点，把本实现的换算结果与 mpv 截图（`--sub-hdr-peak` 默认值）对照，确定 PQ → SDR 的参考白和色域换算方式。H5 内核在 HDR 显示器与 SDR 显示器上各看一次。

**门槛结论（2026-11-09）：**

- 门槛 1 **达标**，见 `evidence/gate/no-subtitle-cues.md`。256 KB 预读窗口下，Electron 首次扫描约 100 ms，补扫到 30 s 前约 250 ms；只读块头约 1.3 s，不采用。另外，新版 ffmpeg（Lavf 63）会为每个字幕包写 Cues，“ffmpeg 封装的文件只有视频 Cues”的假设不成立，有限扫描只是兜底路径。
- 门槛 2 **推翻了原颜色方案**，见 `evidence/gate/hdr-palette.md`。mpv 会把 HDR 视频上的图片字幕和视频一起色调映射，SDR 输出时字幕主体约 178 / 255；原方案“PQ → 以 203 nits 为白点”会得到纯白 255，明显偏亮。改为第 6 节的“BT.709 + HDR 固定增益”。HDR 显示器直通输出未验证，列为已知局限。
- 任务 1.4（补充样本）暂缓，最终验收（8.2）前补齐。

同时至少补充 2 个来源不同的 PGS 样本（普通 1080p BD Remux、动画 BD），用于第 7 节的验收。

### 1. 分层

```
┌ context.tsx ─────────────────────────────────────────────────────┐
│ 按 ResolvedSubtitleTrack.kind 选择适配器（互斥）；共享 resize 与 rAF │
└───────┬───────────────────────────────────────┬──────────────────┘
   kind: 'text'                            kind: 'bitmap'
        │                                       │
LibassSubtitleAdapter（不变）           PgsSubtitleAdapter（主线程）
                                          │ 每帧取 clock.now() + offset
                                          │ 选当前显示集 → 变化时才重绘
                                          │ want(t, generation) ↓ ↑ frames
                                        pgs.worker（Worker）
                                          │ PgsTrackIndex：Cues → (时间, cluster, 偏移)
                                          │ PgsWindowLoader：回溯 + 预读 + 预算 + 取消
                                          │ pgs-decoder：段解析 / epoch / RLE / 调色板
                                          ▼
                                        CompatResource.source（file | url）
```

纯函数模块（`pgs-decoder`、epoch 累积、窗口规划）放在 `services/media/subtitles/pgs/`，不依赖 DOM、Worker 或遥测，方便单元测试。Worker 只负责 I/O、调度和 `createImageBitmap`。

**为什么解码放在 Worker**：片尾曲每秒 24 个显示集，每个约 20 KB 压缩数据和两个对象。解压与 RLE 放在主线程会和弹幕、UI 抢帧。`ImageBitmap` 可以零拷贝 transfer 回主线程。

**为什么主线程绘制而不是 OffscreenCanvas**：画布尺寸、旋转与清屏由 `context.tsx` 统一管理，与 libass 画布共用一套 resize 逻辑；主线程只在显示集变化时 `drawImage`，开销可以忽略。

### 2. 端口契约

`ResolvedSubtitleTrack` 改为可区分的联合类型：

```ts
type ResolvedSubtitleTrack =
  | (Common & { kind: 'text'; url: string; fonts?: readonly string[]; persistencePath?; persistenceContent? })
  | (Common & { kind: 'bitmap'; session: BitmapSubtitleSession })
```

`BitmapSubtitleSession` 对外只暴露 `start(clock)`、`setTimeOffset`、`attach(canvas)`、`resize`、`sync`、`close` 和状态快照，不暴露 PGS 细节，以后接 VobSub 可复用。现有外挂、恢复、媒体源字幕都返回 `kind: 'text'`，不靠 `url` 是否为空来判断模式。

**租约归属**：`resolveEmbeddedTrack` 对文本轨保持“读完即关”；对 PGS 轨，`openPlaybackResource` 得到的资源交给会话持有，`release` 时关闭。字幕会话只关闭自己打开的资源，不影响播放器的读取租约。

### 3. 目录与索引

- `matroska.ts` 的 `supportedCodecs` 加入 `S_HDMV/PGS`，`EmbeddedSubtitleTrack` 增加 `kind: 'text' | 'bitmap'`。PGS 轨不读 CodecPrivate。
- `S_VOBSUB` 等其他图片 codec 新增不支持原因码 `bitmap_codec`，目录标题为“（图片字幕，暂不支持）”。
- 打开目录时顺带读取 Video 轨的 Colour → TransferCharacteristics（16 = PQ，18 = HLG），只用来决定是否应用第 6 节的 HDR 增益。这个信息来自容器，两个内核一致。兼容内核的 `sourceTransfer` 只作为容器缺失时的补充。
- 把 `indexedCues` 拆成“解析 Cues 得到某轨的位置列表”和“按位置读取单块并解压”两个函数，文本路径改为调用它们，行为不变（已有测试作为回归）。
- 目录阶段是否判定“完全没有 Cues”：只检查 SeekHead 中是否有 Cues 条目，不读取 Cues 正文，避免拖慢目录。

### 4. 窗口加载

时间轴以显示集开始时间排序，第 i 个显示集的结束时间为第 i+1 个的开始时间（最后一个保持到轨道结束）。

```
目标时间 t ──二分──▶ i = 开始时间 ≤ t 的最后一个显示集
            ──回溯──▶ j = i 往前第一个 Epoch Start / Acquisition Point（≤ 64 个、≤ 8 MB）
            ──读取──▶ [j … 窗口末尾]，窗口末尾 = min(t + 30 s, 累计 4 MB)
            ──解码──▶ 只对 [t, t + 2 s] 内、累计不超过 800 万像素的显示集生成 ImageBitmap
```

**每个显示集一次请求**：Cues 已经给出 Cluster 位置和块在 Cluster 内的偏移。读取时先按需取得 Cluster 头（同一 Cluster 只读一次并缓存），然后从块偏移处一次读 64 KB，在内存中解析 BlockGroup / SimpleBlock 并取出数据。块大于 64 KB 时再补读一次（实测最大 59 KB，很少触发）。这样片尾曲 30 s 的请求数从逐元素读取的约 1100 次降到约 370 次；在 Electron 中，每次请求都要经过主进程，这一点很重要。

**像素上限**：提前解码同时受时间（2 s）和像素数（800 万像素，约 32 MB RGBA）约束，先到为准。普通对象（约 700×115）2 s 内远达不到上限；全屏 1920×1080 的对象（每个约 8 MB）做成动画时，只提前解码 3 帧。Worker 跟不上时，画面短暂停在上一帧，不显示错误内容。

合成状态需要读块才知道。为避免回溯时盲读，索引项在首次读到后缓存合成状态；未知时按“读一块、判一块”往回走，并计入回溯预算。

| 参数 | 初值 | 依据 |
|---|---|---|
| 前方读取 | 30 s 或 4 MB，先到为准 | 普通段 30 s 只有几百 KB；片尾曲 30 s 有 10.7 MB |
| 提前解码 | 2 s 或 800 万像素，先到为准 | 24 fps 时约 48 个显示集；全屏对象动画时防止超出预算 |
| 单次块读取 | 64 KB，不够时补读一次 | 实测块最大 59 KB |
| 已解码位图 | 64 MB，按距离当前位置淘汰 | 片尾曲每秒约 15 MB RGBA |
| 已读取的压缩块 | 16 MB | 跳回近处时不必重读 |
| 回溯 | 64 个显示集或 8 MB | 实测最多 1 步，上限只是兜底 |
| 并发读取 | 4 | 沿用现有有限并发 |

参数集中定义在一个常量对象中，属于内部策略，可以在验收中调整。

**代次与取消**：跳转（|Δt| 超出已覆盖范围）、换轨、偏移跳变都使 generation +1，并 abort 当前读取。Worker 回传的每一帧都带 generation，主线程丢弃旧代次结果并 `close()` 对应位图。暂停时完成当前窗口即停止。

### 5. 缺少字幕 Cues 的有限扫描

PGS 轨没有 Cues 但有视频 Cues 时，扫描分两段进行。扫描使用 **256 KB 预读窗口**的 `Reader`（门槛 1 选定），只解析元素头和本轨块，其余块按长度跳过，不使用“只读块头”的逐次小读取：

1. **首次扫描**：借视频 Cues 找到 t − 10 s 之前最近的 Cluster，扫描到 t + 5 s，随即显示当前字幕。按 Cluster 密度，这一段约 15 s、900 个块、36 MB。
2. **后台推进**：之后随播放在后台继续向前扫描，最多领先播放位置 30 s，暂停时停止。首次显示后，再把起点往前补到 t − 30 s，用来找回开始得更早的长句（实测单句最长 24 s）。

预算按时间约束，不按字节：首次扫描必须在门槛 1 的达标线内完成；后台扫描的读取速度不高于本地播放码率的 2 倍（本样本约 2.4 MB/s）。10 s 以前就开始显示的长句，在首次扫描时可能漏掉，补扫完成后恢复，属于可接受的降级。

扫描结果写入会话内的索引缓存，后续跳回同一区域不再扫描。只扫描播放经过的区域，不预先补全整轨索引。

整个文件没有 Cues 时，目录阶段就标记为不支持（原因码 `missing_index`），不进入扫描。

### 6. 解码与颜色

- 段类型：PCS 0x16、WDS 0x17、PDS 0x14、ODS 0x15、END 0x80。MKV 块里不带 `PG` 魔数和 PTS 头，时间来自块时间戳。
- epoch 累积：从 j 到 i 按顺序合并窗口、调色板和对象，同 ID 后者覆盖前者；遇到 Epoch Start 时清空。
- RLE：按 PGS 规则解码，像素数必须等于宽 × 高；单个对象的像素上限为 1920 × 1080 × 4（防御性上限）。
- 颜色：所有视频都按 **BT.709 矩阵、limited range** 把 YCbCr 换算为 R′G′B′，直接作为 sRGB 编码值使用，不做线性化和色调映射。视频传递函数为 PQ 或 HLG 时，再对 R′G′B′ 乘以固定增益 **1.11** 并裁剪到 [0, 1]。增益由门槛 2 标定：使 Y=154 的字幕主体从 161 提升到约 178，与 mpv 在 SDR 输出下的结果一致；Y ≥ 213 的颜色会被裁剪为纯白。透明度不受增益影响。换算结果按调色板（最多 256 项）缓存。
  - **为什么不用 PQ / BT.2020 换算**：字幕画布既不能超过 SDR 白，也不能参与视频的色调映射；按 PQ 以 203 nits 为白点会让字幕在 SDR 输出时成为纯白，比 mpv 亮约 76 级。固定增益在 SDR 输出下最接近 mpv，实现也最简单。
  - **为什么不按输出模式区分**：需要检测显示器 HDR 能力和内核是否直通 HDR，本机也无法验证 HDR 直通，收益不确定。H5 内核在 HDR 显示器上直通时字幕可能偏暗，作为已知局限。
- 显示集合成结果是若干 `{ x, y, bitmap }`，坐标属于 PGS 画布（宽高来自 PCS）。主线程按 `画布像素 / PGS 画布尺寸` 缩放绘制。

### 7. 呈现与设置

- `context.tsx` 中的画布创建和 resize 逻辑抽出一份共享实现，PGS 画布与 libass 画布同层并列；选中一方时另一方清空。
- 时间与偏移：与 `LibassSubtitleAdapter.sync()` 同口径，`clock.now() + timeOffset`；暂停时不重绘，倍速无需特殊处理。
- 字幕大小：设置面板通过上下文得知当前轨道为 bitmap，禁用滑块并显示提示；不写 `subtitleScale`。
- 历史记录：沿用 `embedded: { number, uid, codec }`，恢复规则不变。

### 8. 遥测

- 新增 `subtitle_bitmap_session`（关闭时上报一次）：`codec: 'pgs'`、`first_bitmap_ms`、`read_bytes`、`max_backtrack`、`scan_used: boolean`、`decode_failures`、`engine`、`hdr: boolean`。
- 会话失败沿用 `subtitle_failed`，`stage` 增加 `bitmap`；原因码：`index_missing`、`backtrack_exceeded`、`block_invalid`、`decode_failed`、`read_failed`、`worker_failed`。预算超限不报错，只淘汰缓存或缩小解码范围。
- 单块失败只计数，不单独上报。AbortError 不上报。
- `subtitle_track_unsupported` 中 PGS 将自然减少；新增 `bitmap_codec`、`missing_index` 原因。口径同步更新 `docs/observability-runbook.md`。

### 9. 测试与验收

- 单元测试使用自行编写的最小 PGS 编码器生成显示集，覆盖：分片 ODS、Normal 依赖、同 ID 覆盖、清屏、RLE 边界、损坏块、HDR / SDR 换算、窗口规划、回溯上限、代次丢弃。
- MKV fixture 用 mkvmerge 把自造 `.sup` 封装成有字幕 Cues、无字幕 Cues、无 Cues 三种。
- **只在本地运行的对照测试**：编码器和解码器都是自己写的，可能对规范有同样的误解，测试全部通过但结果是错的。因此用 ffmpeg 把真实样本中若干显示集解码成 PNG，与本实现的 RGBA 输出逐像素比较（SDR 换算路径，允许 ±1 的舍入误差）。测试通过环境变量指定本地样本路径，未指定时跳过；不进 CI，不提交任何素材。
- 已有文本字幕测试（`matroska` / `resolve` / libass 适配器）必须全部通过，作为拆分 Cues 读取的回归。
- 人工验收：三份真实样本 × Electron / Web × H5 / 兼容；跳到 10 / 50 / 100 分钟各 5 次；片尾曲段连续播放；连续播放 20 分钟并往返跳转 20 次，检查位图数量、Worker 内存与关闭后资源释放。

## 风险与权衡

- **只有一个真实样本**：epoch 链长度、强制字幕、对象尺寸、调色板动画（本样本 0 次）都只在一部片子上测过。缓解：门槛阶段补样本；回溯与对象尺寸设上限，超限降级而不是崩溃。
- **无字幕 Cues 的文件**：门槛 1 已验证，256 KB 预读窗口下首次扫描约 100 ms、读取约 30 MB，代价可接受。mkvmerge 和新版 ffmpeg 都会给字幕建索引，这条路径只在手动关闭索引或较老工具封装时触发；MakeMKV 的行为待样本确认。
- **Electron 单次读取开销未测**：本地文件读取都要经过主进程的 `marchen://` 协议。已改为每个显示集一次请求，但往返开销仍需门槛 1 实测；开销过大时，需要考虑合并相邻请求。
- **全屏大对象**：一个 1920×1080 对象解码后约 8 MB，做成逐帧动画时，提前解码只能覆盖几帧，Worker 稍慢就会停在上一帧。像素上限保证内存不超，但流畅度要靠验收中的真实样本确认。
- **测试自证**：自写编码器和解码器可能共享同一误解，靠只在本地运行的 ffmpeg 对照测试兜底；这项测试不在 CI 中，需要实现者本地执行并在 evidence 中记录。
- **HDR 颜色主观性**：不同播放器对 UHD PGS 的亮度处理不一致。以 mpv 的 SDR 输出为基准标定固定增益，接受与个别播放器有差异。增益只用一个样本标定；补充 HDR 样本后如差异明显，再调整常量。
- **HDR 显示器直通**：H5 内核在 HDR 显示器上直通 HDR 视频时，视频高光可能远亮于 SDR 白，字幕显得偏暗。本次不处理，未验证。
- **主线程与 Worker 的帧同步**：24 fps 动画需要提前 2 s 解码。实测片尾曲在 Worker 中每秒只需约 13 ms 计算，正常情况下不会落后；若落后，画面会短暂停在上一帧，不会显示错误内容。
- **自研解析的维护成本**：没有依赖库，但需要自己维护 PGS 规范的边界情况。规范稳定，代码量可控。
- **端口联合类型的改动面**：外挂、恢复、媒体源字幕都要补 `kind: 'text'`，类型检查可以覆盖遗漏。
