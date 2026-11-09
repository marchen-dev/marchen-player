## 动机

蓝光 Remux 的 MKV 通常只带 PGS（`S_HDMV/PGS`）图片字幕。播放器内嵌字幕只支持 ASS/SSA/SRT 等文本格式，这类文件的字幕轨会全部显示“（暂不支持）”，用户只能另找外挂字幕。`report-subtitle-unsupported-tracks` 已经开始上报 PGS 这类不支持轨道。

PGS 与文本字幕的数据规模完全不同。以《你的名字》UHD BluRay Remux（12.9 GB）为例实测：

- 单条中文 PGS 轨解压后 212 MB（文件中 zlib 压缩后 106 MB），共 8027 个显示集，分散在整个文件中。
- 片尾曲是 24 fps 的逐帧动画，最密集的 30 秒里有 367 个显示集、10.7 MB。
- mkvmerge 为每个字幕块都写了 Cues 索引，可以按时间直接定位。
- UHD HDR 原盘的调色板最亮的不透明色只有 Y=154。按 BT.709 直接换算约为 161 / 255，比 mpv 的显示结果（约 178）暗约 10%。

因此，现有“整轨读成文本再交给 libass”的路径不能直接沿用。需要按播放位置窗口读取数据，并用独立的位图渲染层显示。

## 变更内容

- 本地 MKV / MK3D 中的内嵌 PGS 轨变为可选，在 Electron 与 Web 桌面端、H5 与兼容两个内核上都能正确显示。
- 新增 PGS 解码：解析显示集、RLE 解码、调色板按 BT.709 转 RGBA；视频为 PQ / HLG 时统一提亮，使亮度与 mpv 一致。
- 新增按时间窗口加载：用 Cues 索引定位，跳转后往回找到可独立显示的显示集（epoch 起点），按字节预算预读；可以取消；已解码位图的总量有上限。
- 文件缺少字幕 Cues 时，借视频 Cues 定位附近的 Cluster，在有限范围内扫描。整个文件都没有 Cues 时，这条轨标记为不支持，并给出原因。不做全片扫描。
- 新增位图字幕渲染层，与 libass 画布并列，两者互斥；复用播放时钟、时间偏移和画面尺寸计算。
- PGS 轨的选择沿用现有历史记录规则（轨道 UID + codec），不改数据库结构。
- 选中 PGS 轨时，字幕大小滑块禁用，并提示“图片字幕不支持调整大小”。
- 其他仍不支持的图片字幕（如 VobSub），提示文案改为“（图片字幕，暂不支持）”。
- 新增 PGS 加载与渲染的遥测：首张位图耗时、窗口读取字节数、回溯步数、稳定失败原因码。

**实现前的验证门槛**：先验证缺少字幕 Cues 时的有限扫描耗时，再对照外部播放器确认 HDR 调色板换算。任一项不达标，先修订 design，不直接进入实现。

**不在本次范围**：VobSub；M2TS / TS 中的 PGS；远程来源（WebDAV、远程直链、Jellyfin、Emby）；导入外挂 `.sup`；调整 PGS 字幕大小；“只显示强制字幕”模式；OCR 转文本。

## 能力

### 新增能力

- `pgs-subtitle-decoding`：PGS 显示集解析、epoch 依赖、RLE 解码、调色板与 HDR 颜色换算
- `pgs-windowed-loading`：基于 Cues 的时间窗口读取、epoch 回溯、字节与位图预算、缺少索引时的有限扫描、跳转与取消
- `pgs-subtitle-presentation`：PGS 轨在字幕目录中的可选状态、位图渲染层、时钟与偏移同步、字幕大小禁用提示、历史记录、错误降级与遥测

### 修改能力

无（仓库没有现行主规格；内嵌文本字幕行为保持不变）。

## 影响范围

- `services/media/subtitles/matroska.ts`：将 `S_HDMV/PGS` 标为支持，拆出可复用的 Cues 索引和单块读取；文本字幕路径的行为不变。
- `services/media/subtitles/`：新增 PGS 解析、窗口加载与 Worker 协议。
- `services/player-runtime/platform/embedded-catalog.ts`、`ports.ts`：`ResolvedSubtitleTrack` 改为区分文本与位图的联合类型；PGS 会话持有读取租约，释放时才关闭。
- `services/player-runtime/subtitles/`：新增 `PgsSubtitleAdapter`；`context.tsx` 按轨道类型选择适配器。
- 字幕设置面板：PGS 时禁用字幕大小，并调整图片字幕的不支持文案。
- `services/telemetry/`：新增 PGS 事件与原因码，口径同步到 `docs/observability-runbook.md`。
- `AGENTS.md`：字幕渲染章节补充位图字幕说明。
- 不新增第三方依赖；不涉及主进程、数据库结构和 API。
