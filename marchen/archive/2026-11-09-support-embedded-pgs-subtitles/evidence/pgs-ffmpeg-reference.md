# 任务 2.6：PGS 解码与 ffmpeg 对照（本地样本）

日期：2026-11-09
测试：`src/renderer/src/services/media/tests/pgs-ffmpeg-reference.test.ts`（未设置 `PGS_SAMPLE` 时跳过，不进 CI）
样本：《你的名字》UHD BluRay Remux，第 1 条字幕流（PGS chs&jpn），本地文件，不提交
参照：ffmpeg（Homebrew），用 `overlay=format=rgb` 把字幕叠加到黑色 RGB 画布上取帧

## 命令

```bash
PGS_SAMPLE="/Users/bilibili/Movies/与你相恋到生命/Your.Name.2016.2160p.UHD.BluRay.x265.10bit.HDR.DTS-HD.MA.5.1.4Audio-SONYHD.mkv" \
PGS_SAMPLE_TIMES=322.3,4200.5,5000.2 \
npx vitest run --config vitest.player-runtime.config.ts \
  src/renderer/src/services/media/tests/pgs-ffmpeg-reference.test.ts --reporter=verbose
```

## 结果

| 时刻 | 比较的不透明像素 | 最大通道差 |
|---|---|---|
| 322.3 s | 19850 | 1 |
| 4200.5 s | 13552 | 1 |
| 5000.2 s | 13997 | 1 |

全部通过，容差 ±1（design 第 9 节）。比较走的是 SDR 换算路径（不加 HDR 增益）。

## 调试过程中发现的两个对照测试问题（已修复，不是解码器问题）

1. **时间轴没对齐**：ffmpeg 默认把每个输入的起始时间归零，`.sup` 第一个包（如 4.687 s）被当作 0 s，叠加时取到另一句字幕，最大差 161。加 `-copyts` 后解决。
2. **YUV 叠加多一次舍入**：默认 overlay 在 YUV 中叠加再转 RGB，最大差 3。改为 `format=rgb24` 画布和 `overlay=format=rgb` 后，最大差降为 1。

## 局限

- 只比较完全不透明的像素；半透明描边的混合方式两边不同，不在比较范围内。
- 1810.5 s 等淡入淡出时刻没有完全不透明的颜色，不适合作为对照时刻。
