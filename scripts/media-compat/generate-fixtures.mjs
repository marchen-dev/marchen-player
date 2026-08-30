import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const outputDirectory = resolve(process.cwd(), process.argv[2] ?? 'test-results/media-compat')
mkdirSync(outputDirectory, { recursive: true })

const run = (binary, args, capture = false) => {
  const result = spawnSync(binary, args, {
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw new Error(`无法启动 ${binary}：${result.error.message}`)
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr}` : ''
    throw new Error(`${binary} 退出码 ${result.status}${detail}`)
  }
  return capture ? result.stdout : ''
}

const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])

const fixture = (name) => resolve(outputDirectory, name)
const videoSource = 'testsrc2=size=320x180:rate=30'
const audioSource = 'sine=frequency=880:sample_rate=48000'
const unitDuration = '2'
const structureDuration = '30'
const commonH264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']
const commonHevc = ['-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error']

const rotatedBasePath = fixture('structure-rotated-multi-audio.base.mp4')
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  audioSource,
  '-t',
  unitDuration,
  ...commonH264,
  '-c:a',
  'aac',
  '-shortest',
  fixture('native-h264-aac.mp4'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  audioSource,
  '-t',
  unitDuration,
  ...commonHevc,
  '-pix_fmt',
  'yuv420p',
  '-tag:v',
  'hvc1',
  '-c:a',
  'aac',
  '-shortest',
  fixture('hevc-main8-aac.mp4'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  audioSource,
  '-t',
  unitDuration,
  ...commonHevc,
  '-pix_fmt',
  'yuv420p10le',
  '-c:a',
  'aac',
  '-shortest',
  fixture('hevc-main10-aac.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  audioSource,
  '-t',
  unitDuration,
  '-vf',
  'setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv',
  ...commonHevc,
  '-pix_fmt',
  'yuv420p10le',
  '-color_primaries',
  'bt2020',
  '-color_trc',
  'smpte2084',
  '-colorspace',
  'bt2020nc',
  '-x265-params',
  'log-level=error:colorprim=9:transfer=16:colormatrix=9',
  '-c:a',
  'aac',
  '-shortest',
  fixture('hevc-main10-hdr-aac.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  'anullsrc=r=48000:cl=5.1',
  '-t',
  unitDuration,
  ...commonH264,
  '-c:a',
  'eac3',
  '-shortest',
  fixture('h264-eac3-5.1.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  'anullsrc=r=48000:cl=5.1',
  '-t',
  unitDuration,
  ...commonHevc,
  '-pix_fmt',
  'yuv420p10le',
  '-c:a',
  'eac3',
  '-shortest',
  fixture('hevc-main10-eac3-5.1.mkv'),
])

// 结构样本刻意拉长到 30 秒，用于暴露真实文件常见的长 GOP、首片段等待和色彩事实缺失。
// 这些样本仍保持低分辨率，避免把兼容回归变成机器性能测试。
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  audioSource,
  '-t',
  structureDuration,
  '-c:v',
  'libx265',
  '-preset',
  'ultrafast',
  '-pix_fmt',
  'yuv420p10le',
  '-x265-params',
  'log-level=error:keyint=300:min-keyint=300:scenecut=0',
  '-c:a',
  'flac',
  '-shortest',
  fixture('structure-main10-sdr-flac-long-gop.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  'anullsrc=r=48000:cl=5.1',
  '-t',
  structureDuration,
  '-vf',
  'setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc:range=tv',
  '-c:v',
  'libx265',
  '-preset',
  'ultrafast',
  '-pix_fmt',
  'yuv420p10le',
  '-color_primaries',
  'bt2020',
  '-color_trc',
  'smpte2084',
  '-colorspace',
  'bt2020nc',
  '-x265-params',
  'log-level=error:keyint=300:min-keyint=300:scenecut=0:colorprim=9:transfer=16:colormatrix=9',
  '-c:a',
  'eac3',
  '-shortest',
  fixture('structure-hdr10-eac3-long-gop.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  audioSource,
  '-t',
  structureDuration,
  '-vf',
  'setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc:range=tv',
  '-c:v',
  'libx265',
  '-preset',
  'ultrafast',
  '-pix_fmt',
  'yuv420p10le',
  '-color_primaries',
  'bt2020',
  '-color_trc',
  'arib-std-b67',
  '-colorspace',
  'bt2020nc',
  '-x265-params',
  'log-level=error:keyint=300:min-keyint=300:scenecut=0:colorprim=9:transfer=18:colormatrix=9',
  '-c:a',
  'aac',
  '-shortest',
  fixture('structure-hlg-long-gop.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  `testsrc2=size=320x180:rate=30:duration=${structureDuration}`,
  '-vf',
  "select='if(lt(t,10),not(mod(n,3)),not(mod(n,2)))',setpts=PTS+5/TB",
  '-fps_mode',
  'vfr',
  '-copyts',
  ...commonH264,
  fixture('structure-vfr-nonzero-start.mkv'),
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=320x180:rate=30:duration=3',
  '-vf',
  "select='if(lt(t,1),not(mod(n,3)),not(mod(n,2)))',setpts=PTS+5/TB",
  '-fps_mode',
  'vfr',
  '-copyts',
  ...commonH264,
  fixture('vfr-nonzero-start.mkv'),
])

const coverPath = fixture('attached-cover.jpg')
ffmpeg([
  '-f',
  'lavfi',
  '-i',
  'color=c=#d94645:size=320x180',
  '-frames:v',
  '1',
  '-c:v',
  'mjpeg',
  coverPath,
])

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=660:sample_rate=48000',
  '-t',
  structureDuration,
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-map',
  '2:a:0',
  '-vf:v:0',
  'setsar=4/3',
  '-c:v:0',
  'libx264',
  '-preset:v:0',
  'ultrafast',
  '-pix_fmt:v:0',
  'yuv420p',
  '-c:a',
  'aac',
  '-disposition:a:0',
  'default',
  '-disposition:a:1',
  '0',
  rotatedBasePath,
])

// display matrix 在编码命令中常被编码器清掉；先生成正片，再 remux 写入旋转矩阵与封面。
ffmpeg([
  '-display_rotation:v:0',
  '90',
  '-i',
  rotatedBasePath,
  '-i',
  coverPath,
  '-map',
  '0:v:0',
  '-map',
  '0:a:0',
  '-map',
  '0:a:1',
  '-map',
  '1:v:0',
  '-c',
  'copy',
  '-disposition:v:1',
  'attached_pic',
  fixture('structure-rotated-multi-audio.mp4'),
])
rmSync(rotatedBasePath, { force: true })

ffmpeg([
  '-f',
  'lavfi',
  '-i',
  videoSource,
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=660:sample_rate=48000',
  '-i',
  coverPath,
  '-t',
  unitDuration,
  '-map',
  '0:v:0',
  '-map',
  '1:a:0',
  '-map',
  '2:a:0',
  '-map',
  '3:v:0',
  '-c:v:0',
  'libx264',
  '-preset:v:0',
  'ultrafast',
  '-pix_fmt:v:0',
  'yuv420p',
  '-c:v:1',
  'mjpeg',
  '-c:a',
  'aac',
  '-disposition:v:1',
  'attached_pic',
  '-disposition:a:0',
  'default',
  '-disposition:a:1',
  '0',
  '-metadata:s:a:0',
  'language=jpn',
  '-metadata:s:a:0',
  'title=日语主音轨',
  '-metadata:s:a:1',
  'language=zho',
  '-metadata:s:a:1',
  'title=评论音轨',
  '-shortest',
  fixture('multi-audio-attached-picture.mp4'),
])

const specialDirectory = fixture('含 空格')
mkdirSync(specialDirectory, { recursive: true })
copyFileSync(fixture('native-h264-aac.mp4'), resolve(specialDirectory, '路径 样本.mp4'))

const fixtureDefinitions = [
  { name: 'native-h264-aac.mp4', tier: 'unit', traits: ['h264', 'aac', 'native'] },
  { name: 'hevc-main8-aac.mp4', tier: 'unit', traits: ['hevc-main8', 'aac'] },
  { name: 'hevc-main10-aac.mkv', tier: 'unit', traits: ['hevc-main10', 'sdr'] },
  { name: 'hevc-main10-hdr-aac.mkv', tier: 'unit', traits: ['hevc-main10', 'hdr10'] },
  { name: 'h264-eac3-5.1.mkv', tier: 'unit', traits: ['h264', 'eac3-5.1'] },
  { name: 'hevc-main10-eac3-5.1.mkv', tier: 'unit', traits: ['hevc-main10', 'eac3-5.1'] },
  { name: 'vfr-nonzero-start.mkv', tier: 'unit', traits: ['vfr', 'nonzero-start'] },
  {
    name: 'multi-audio-attached-picture.mp4',
    tier: 'unit',
    traits: ['multi-audio', 'attached-picture'],
  },
  { name: '含 空格/路径 样本.mp4', tier: 'unit', traits: ['special-path'] },
  {
    name: 'structure-main10-sdr-flac-long-gop.mkv',
    tier: 'structure',
    traits: ['hevc-main10', 'sdr', 'flac', 'long-gop', 'missing-rfc6381'],
  },
  {
    name: 'structure-hdr10-eac3-long-gop.mkv',
    tier: 'structure',
    traits: ['hevc-main10', 'hdr10', 'eac3-5.1', 'long-gop', 'missing-rfc6381'],
  },
  {
    name: 'structure-vfr-nonzero-start.mkv',
    tier: 'structure',
    traits: ['vfr', 'nonzero-start'],
  },
  {
    name: 'structure-hlg-long-gop.mkv',
    tier: 'structure',
    traits: ['hevc-main10', 'hlg', 'long-gop'],
  },
  {
    name: 'structure-rotated-multi-audio.mp4',
    tier: 'structure',
    traits: ['multi-audio', 'attached-picture', 'rotation', 'sar'],
  },
]

const generatedBy = JSON.parse(
  run('ffprobe', ['-v', 'quiet', '-show_versions', '-of', 'json'], true),
)
const fixtures = fixtureDefinitions.map((definition) => ({
  ...definition,
  probe: JSON.parse(
    run(
      'ffprobe',
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', fixture(definition.name)],
      true,
    ),
  ),
}))

writeFileSync(
  fixture('generated-manifest.json'),
  `${JSON.stringify({ generatedBy, fixtures }, null, 2)}\n`,
)

console.log(`媒体兼容样本已生成：${outputDirectory}`)
