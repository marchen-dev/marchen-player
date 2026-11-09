## 1. 验证门槛（不达标先修订 design，不进入第 2 组之后的实现）

- [x] 1.1 用 `mkvmerge --cues <PGS 轨>:none` 和 ffmpeg 分别重新封装《你的名字》样本，得到“无字幕 Cues”和“只有视频关键帧 Cues”两份文件（仅留在本地，不提交）
- [x] 1.2 写一次性实验脚本（放在 `.tmp/`，不进产品代码）：借视频 Cues 定位，首次扫描 [t − 10 s, t + 5 s]，测量跳到 10 / 50 / 100 分钟后第一张字幕的耗时、请求次数和字节数；对比“只读块头”与“预读窗口”两种扫描方式；在 Electron 中测量 `marchen://` 单次 Range 请求的往返耗时；对照达标线（本地 Electron 冷启动 ≤ 1.5 s，字节数只记录），结论写入 `evidence/gate/no-subtitle-cues.md`
- [x] 1.3 在 3 个时间点用 mpv 截图，对比 BT.709 与 PQ 两种调色板换算的输出，确定参考白和色调压缩方式，结论写入 `evidence/gate/hdr-palette.md`
- [ ] 1.4 补充至少 2 个来源不同的 PGS 样本（普通 1080p BD Remux、动画 BD），用 1.2 的脚本统计 epoch 分布、对象尺寸与是否有字幕 Cues，记入 `evidence/gate/samples.md`
- [x] 1.5 根据 1.2 至 1.4 的结论确认或修订 design 第 4、5、6 节的参数与方案

## 2. PGS 解码（纯函数）

- [x] 2.1 在 `services/media/subtitles/pgs/` 新增段解析：PCS / WDS / PDS / ODS / END，支持分片 ODS 拼接，越界与缺段返回稳定原因码
- [x] 2.2 实现 epoch 累积：从起点到目标显示集合并窗口、调色板、对象，同 ID 覆盖，Epoch Start 清空，依赖缺失判为不可显示
- [x] 2.3 实现 RLE 解码与像素数校验、对象尺寸上限
- [x] 2.4 实现调色板换算：所有视频按 BT.709 limited range 换算，PQ / HLG 视频再乘固定增益 1.11 并裁剪（不影响透明度），按调色板缓存
- [x] 2.5 编写测试用的最小 PGS 编码器，并补齐 2.1 至 2.4 的单元测试（分片、Normal 依赖、覆盖、清屏、RLE 边界、损坏、HDR / SDR）
- [x] 2.6 新增只在本地运行的对照测试：通过环境变量指定真实样本，用 ffmpeg 把若干显示集解码成 PNG，与本实现的 SDR 输出逐像素比较（允许 ±1）；未指定样本时跳过，不进 CI、不提交素材；在本地运行一次并把结果记入 `evidence/`

## 3. Matroska 目录与索引

- [x] 3.1 拆分 `matroska.ts` 的 `indexedCues`：抽出“解析 Cues 得到某轨位置列表”和“按位置读取单块并解压”，文本路径改用新函数，现有字幕测试全部通过
- [x] 3.2 `S_HDMV/PGS` 标为支持，轨道增加 `kind: 'text' | 'bitmap'`，PGS 不读 CodecPrivate；其他图片 codec 使用 `bitmap_codec` 原因码
- [x] 3.3 目录阶段读取视频轨 Colour → TransferCharacteristics，并检查 SeekHead 中是否有 Cues；整个文件没有 Cues 时 PGS 轨标记为 `missing_index`
- [x] 3.4 用 mkvmerge 把自造 `.sup` 封装成有字幕 Cues、无字幕 Cues、无 Cues 三种 MKV fixture，补充目录与索引测试

## 4. 窗口加载与 Worker

- [x] 4.1 实现纯函数窗口规划：二分定位、回溯（含上限）、前方窗口（时间 + 字节）、提前解码范围（2 s 或 800 万像素，先到为准），参数集中为常量（补读由每次位置更新重新规划，不单设阈值）；补单元测试（含全屏对象动画）
- [x] 4.2 实现缺少字幕 Cues 时的扫描：借视频 Cues 首次扫描 [t − 10 s, t + 5 s] 后立即显示；之后后台随播放推进，最多领先 30 s，暂停时停止，并往前补到 t − 30 s；已扫描区域写入会话内索引缓存，不重复扫描；扫描方式按门槛 1.2 的结论选择；补测试
- [x] 4.3 新增 `pgs.worker`：从 `CompatResource.source` 读取；按 Cues 偏移每个显示集一次读 64 KB（不够时补读一次），Cluster 头按 Cluster 缓存；有限并发、AbortSignal、代次标记；对提前解码范围生成 `ImageBitmap` 并 transfer
- [x] 4.4 实现压缩块缓存与已解码位图 LRU 预算，淘汰时 `close()` 位图
- [x] 4.5 单块失败跳过并计数，连续失败或来源不可用时报告会话失败；补 Worker 协议测试（快速连续跳转、迟到结果丢弃、关闭释放）

## 5. 端口与会话生命周期

- [x] 5.1 `ResolvedSubtitleTrack` 改为 `kind: 'text' | 'bitmap'` 联合类型，外挂、恢复、媒体源字幕全部补 `kind: 'text'`，通过双端类型检查
- [x] 5.2 定义 `BitmapSubtitleSession` 接口；`resolveEmbeddedTrack` 对 PGS 轨把资源交给会话持有，`release` 时关闭，文本轨保持读完即关
- [x] 5.3 远程来源继续沿用 `supportsEmbeddedSubtitles` 的限制，不创建 PGS 会话；补测试

## 6. 呈现与设置

- [x] 6.1 从 `context.tsx` 抽出共享的画布创建与 resize 逻辑（视频区域、黑边、旋转、DPR）
- [x] 6.2 新增 `PgsSubtitleAdapter`：按 `clock.now() + offset` 选当前显示集，变化时按 PGS 画布比例重绘，丢弃旧代次结果
- [x] 6.3 `context.tsx` 按 `kind` 选择适配器并保证互斥；换轨、关闭、外挂导入时正确清空另一方画布
- [x] 6.4 字幕设置面板：bitmap 轨时禁用字幕大小滑块并提示，不修改 `subtitleScale`；不支持的图片字幕标题改为“（图片字幕，暂不支持）”
- [x] 6.5 确认历史记录的保存与恢复对 PGS 轨生效（UID + codec），补测试

## 7. 遥测与文档

- [x] 7.1 在 `contracts.ts` 声明 `subtitle_bitmap_session`，`subtitle_failed` 增加 `stage: 'bitmap'` 与原因码，`subtitle_track_unsupported` 增加 `bitmap_codec` / `missing_index`
- [x] 7.2 会话关闭时上报汇总指标；AbortError 不上报
- [x] 7.3 更新 `docs/observability-runbook.md` 的字幕口径，以及 `AGENTS.md` 字幕渲染章节的位图字幕说明

## 8. 验证与验收

- [x] 8.1 运行 `pnpm test:player-runtime`、`pnpm typecheck`、定向 lint，以及 `pnpm build` 与 `pnpm build:web`
- [ ] 8.2 三份真实样本 × Electron / Web × H5 / 兼容内核：跳到 10 / 50 / 100 分钟各 5 次，记录首张字幕耗时与读取字节数
- [ ] 8.3 片尾曲 24 fps 段连续播放，确认无明显缺帧、位图内存不超预算；HDR 样本颜色与门槛结论一致
- [ ] 8.4 连续播放 20 分钟并往返跳转 20 次，检查位图数量、Worker 内存趋势、关闭字幕和结束播放后的资源释放
- [ ] 8.5 字幕面板验收：PGS 可选、VobSub 文案、字幕大小禁用提示、时间偏移、与外挂 ASS 互斥、再次打开时恢复选择；证据写入 `evidence/`
