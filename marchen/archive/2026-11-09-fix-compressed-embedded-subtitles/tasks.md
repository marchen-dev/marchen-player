## 背景

mkvmerge 封装的部分 MKV（例如 LoliHouse `FX Senshi Kurumi-chan - 06v2`）在字幕轨上带了 ContentEncodings → ContentCompression，没有显式算法字段，按规范默认是 zlib，作用范围默认只包括 Block 数据。`services/media/subtitles/matroska.ts` 的 `readTrack` 看到 ContentEncodings（0x6D80）就把轨道标为「暂不支持压缩或加密字幕轨」，所以这类文件的 ASS 字幕在两个内核下都不可用。

方案：在 Matroska 字幕解析中解析 ContentEncoding，支持 zlib（ContentCompAlgo=0，用浏览器原生 `DecompressionStream('deflate')`）和头部剥离（ContentCompAlgo=3，把 ContentCompSettings 拼回 payload 前面）。解压能力做成与 codec 无关的通用步骤，后续位图字幕（PGS）可以直接复用。加密（ContentEncryption）、bzlib、lzo 以及多层编码仍判为不支持，并给出更准确的原因。单块解压结果设上限，防止压缩炸弹；已有的 8 MiB 文本预算继续按解压后的文本统计。CodecPrivate 在 Scope 含 2 时也同样解码。

## 1. 解析 ContentEncoding

- [x] 1.1 在 `readTrack` 中读取 ContentEncodings 子结构（Order / Scope / Type / Compression 的 Algo、Settings），得到轨道的内容编码描述；仅单层、Type=0 压缩、Algo 为 0 或 3 时视为可解码
- [x] 1.2 不可解码的情况细分 `unsupportedReason`（加密、不支持的压缩算法、多层编码），图片字幕和时间缩放的原有判断保持不变
- [x] 1.3 Scope 含 CodecPrivate（bit 2）时，解码后再读取 `track.header`

## 2. 解码 Block 数据

- [x] 2.1 新增 payload 解码函数：zlib 用 `DecompressionStream('deflate')` 并限制单块解压后字节数；头部剥离拼接前缀；未编码时原样返回
- [x] 2.2 `cues()` 扫描路径和 `indexedCues()` 索引路径在 UTF-8 解码前都经过 payload 解码，Scope 不含 Block 时跳过

## 3. 测试与验证

- [x] 3.1 在 `services/media/tests/matroska-subtitles.test.ts` 补充 zlib 与头部剥离轨道的扫描和索引读取用例，以及加密、bzlib 仍判为不支持、损坏的 zlib 数据会报错的用例
- [x] 3.2 运行 `pnpm test:player-runtime`、`pnpm typecheck`、`pnpm lint`，再用目标样片验证两条中文轨能完整读出全部 cue
