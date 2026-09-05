// 生成 v2 seek 回归样本：顶部 12 位二进制标记表示 24fps 的视频帧编号。
import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
const ffmpeg = resolve(
  'resources/ffmpeg',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
)
const directory = resolve('test-results/media-compat')
await mkdir(directory, { recursive: true })
const filter = Array.from(
  { length: 12 },
  (_, bit) =>
    `drawbox=x=${bit * 24}:y=0:w=24:h=16:color=black:t=fill,drawbox=x=${bit * 24}:y=0:w=24:h=16:color=white:t=fill:enable='gte(mod(floor(t*24+0.001)/${2 ** bit},2),1)'`,
).join(',')
await promisify(execFile)(ffmpeg, [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=320x180:rate=24',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-t',
  '120',
  '-vf',
  filter,
  '-c:v',
  'libx265',
  '-preset',
  'ultrafast',
  '-pix_fmt',
  'yuv420p10le',
  '-x265-params',
  'keyint=144:min-keyint=144:scenecut=0:log-level=error',
  '-c:a',
  'eac3',
  '-y',
  resolve(directory, 'formal-app-hevc-eac3-timeline.mkv'),
])
console.log('已生成 120 秒 HEVC Main10 + EAC-3 逐帧标记样本')
