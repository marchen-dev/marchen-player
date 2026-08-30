import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import type { FfmpegCommandExecutor } from './media-tools'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FfmpegMediaTools } from './media-tools'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const createDirectories = async () => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-media-tools-'))
  temporaryDirectories.push(root)
  return { screenshots: join(root, 'screenshots'), subtitles: join(root, 'subtitles') }
}

const success = (stdout = Buffer.alloc(0)): FfmpegExecutionResult => ({
  code: 0,
  signal: null,
  stdout,
  stderr: '',
  durationMs: 1,
})

describe('ffmpegMediaTools', () => {
  it('特殊字符路径始终作为单独参数传递，截图临时文件读取后释放', async () => {
    const directories = await createDirectories()
    const calls: FfmpegExecutionOptions[] = []
    const executor: FfmpegCommandExecutor = {
      run: async (options) => {
        calls.push(options)
        await writeFile(options.arguments.at(-1)!, 'jpeg')
        return success()
      },
    }
    const tools = new FfmpegMediaTools(
      { ffmpeg: '/runtime/ffmpeg', ffprobe: '/runtime/ffprobe' },
      directories,
      executor,
    )
    const input = '/视频/含 空格;$(不会执行).mkv'

    await expect(tools.grabFrame(input, '00:00:01.25')).resolves.toBe(
      `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`,
    )
    expect(calls[0].arguments[calls[0].arguments.indexOf('-i') + 1]).toBe(input)
    expect(calls[0].inputs).toEqual([input])
    expect(await readdir(directories.screenshots)).toEqual([])
  })

  it('内嵌字幕使用字幕相对索引，并在转换前识别 PGS', async () => {
    const directories = await createDirectories()
    const calls: FfmpegExecutionOptions[] = []
    const streams = [
      { index: 0, codec_type: 'video', codec_name: 'h264' },
      { index: 3, codec_type: 'subtitle', codec_name: 'ass' },
      { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle' },
    ]
    const executor: FfmpegCommandExecutor = {
      run: async (options) => {
        calls.push(options)
        if (options.executable.endsWith('ffprobe')) {
          return success(Buffer.from(JSON.stringify({ streams })))
        }
        await writeFile(options.arguments.at(-1)!, 'subtitle')
        return success()
      },
    }
    const tools = new FfmpegMediaTools(
      { ffmpeg: '/runtime/ffmpeg', ffprobe: '/runtime/ffprobe' },
      directories,
      executor,
    )

    await tools.extractSubtitle('/video.mkv', 0)
    expect(calls[1].arguments).toContain('0:s:0')
    await expect(tools.extractSubtitle('/video.mkv', 1)).rejects.toThrow('位图字幕')
    expect(calls.filter((call) => call.executable.endsWith('ffmpeg'))).toHaveLength(1)
  })

  it('命令失败时移除未完成的输出文件', async () => {
    const directories = await createDirectories()
    const executor: FfmpegCommandExecutor = {
      run: async (options) => {
        await writeFile(options.arguments.at(-1)!, 'partial')
        throw new Error('conversion failed')
      },
    }
    const tools = new FfmpegMediaTools(
      { ffmpeg: '/runtime/ffmpeg', ffprobe: '/runtime/ffprobe' },
      directories,
      executor,
    )

    await expect(tools.convertSubtitle('/subtitle.srt')).rejects.toThrow('conversion failed')
    expect(await readdir(directories.subtitles)).toEqual([])
  })
})

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const executableSuffix = process.platform === 'win32' ? '.exe' : ''
const fixture = resolve('test-results/media-compat/含 空格/路径 样本.mp4')

describe.runIf(
  existsSync(join(runtimeDirectory, `ffmpeg${executableSuffix}`)) && existsSync(fixture),
)('真实 FFmpeg 媒体工具迁移', () => {
  it('可探测特殊路径并抓取 JPEG 帧', async () => {
    const directories = await createDirectories()
    const tools = new FfmpegMediaTools(
      {
        ffmpeg: join(runtimeDirectory, `ffmpeg${executableSuffix}`),
        ffprobe: join(runtimeDirectory, `ffprobe${executableSuffix}`),
      },
      directories,
    )

    const streams = await tools.probeStreams(fixture)
    expect(streams.some((stream) => stream.codec_type === 'video')).toBe(true)
    await expect(tools.grabFrame(fixture, '0.1')).resolves.toMatch(/^data:image\/jpeg;base64,/)
    expect(await readdir(directories.screenshots)).toEqual([])
  })
})
