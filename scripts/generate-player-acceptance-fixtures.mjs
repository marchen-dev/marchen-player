import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputDirectory = resolve(
  process.cwd(),
  process.argv[2] ?? 'test-results/player-acceptance',
)

mkdirSync(outputDirectory, { recursive: true })

const ass = `[Script Info]
Title: Marchen Player generated acceptance subtitle
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,42,&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.50,0:00:03.50,Default,,0,0,0,,Marchen Player ASS fixture
Dialogue: 0,0:00:04.00,0:00:07.00,Default,,0,0,0,,字幕切换与时间偏移验收
Dialogue: 0,0:00:08.00,0:00:11.50,Default,,0,0,0,,全屏 resize 与资源释放
`

const ssa = `[Script Info]
Title: Marchen Player generated SSA fixture
ScriptType: v4.00
PlayResX: 1280
PlayResY: 720

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
Style: Default,Arial,42,&HFFFFFF,&HFFFFFF,&H000000,&H000000,-1,0,1,2,1,2,40,40,40,0,1

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: Marked=0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Marchen Player SSA fixture
Dialogue: Marked=0,0:00:06.00,0:00:10.00,Default,,0,0,0,,Web 外挂字幕验收
`

writeFileSync(resolve(outputDirectory, 'fixture.ass'), ass)
writeFileSync(resolve(outputDirectory, 'fixture.ssa'), ssa)

const createDanmaku = (count, dense) =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    mode: index % 15 === 0 ? 5 : index % 11 === 0 ? 4 : 1,
    progress: dense ? 2_000 + (index % 120) * 20 : 500 + index * 350,
    fontsize: 25,
    color: index % 7 === 0 ? 0x66CCFF : 0xFFFFFF,
    midHash: 'generated-fixture',
    content: `${dense ? '高密度' : '本地'}弹幕 ${index + 1}`,
    ctime: 1_700_000_000 + index,
    weight: 0,
    idStr: String(index + 1),
    attr: 0,
  }))

writeFileSync(
  resolve(outputDirectory, 'local-danmaku.json'),
  `${JSON.stringify(createDanmaku(30, false), null, 2)}\n`,
)
writeFileSync(
  resolve(outputDirectory, 'dense-danmaku.json'),
  `${JSON.stringify(createDanmaku(1_200, true), null, 2)}\n`,
)

const runFfmpeg = (args) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  })
  if (result.error) {
    throw new Error(`无法启动 ffmpeg：${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg 生成验收样本失败，退出码 ${result.status}`)
  }
}

const mp4Path = resolve(outputDirectory, 'native-h264-aac.mp4')
runFfmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=1280x720:rate=30',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=880:sample_rate=48000',
  '-t',
  '12',
  '-c:v',
  'libx264',
  '-preset',
  'ultrafast',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-shortest',
  mp4Path,
])

// 部分自动化 Chromium 不含专有 H.264 解码器，额外提供开放编码的 Web 验收样本。
runFfmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=640x360:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=660:sample_rate=48000',
  '-t',
  '12',
  '-c:v',
  'libsvtav1',
  '-preset',
  '12',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-shortest',
  resolve(outputDirectory, 'native-av1-aac.mp4'),
])

runFfmpeg([
  '-i',
  mp4Path,
  '-i',
  resolve(outputDirectory, 'fixture.ass'),
  '-map',
  '0:v:0',
  '-map',
  '0:a:0',
  '-map',
  '1:0',
  '-c:v',
  'copy',
  '-c:a',
  'copy',
  '-c:s',
  'ass',
  '-metadata:s:s:0',
  'language=zho',
  '-metadata:s:s:0',
  'title=生成的中文字幕',
  resolve(outputDirectory, 'embedded-ass.mkv'),
])

console.log(`播放器验收样本已生成：${outputDirectory}`)
