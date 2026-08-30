import type { MediaProbeResult } from '@marchen/shared/media'
import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import type { FfmpegRuntimePaths } from './runtime'

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { FfmpegProcessExecutor } from './executor'
import { normalizeFfprobeOutput } from './probe'
import { FfmpegTaskScheduler } from './scheduler'
import { selectPrimaryMediaStreams } from './stream-selection'

export interface FfprobeStream {
  index: number
  codec_name?: string
  codec_type?: string
  codec_tag_string?: string
  disposition?: Record<string, number>
  tags?: Record<string, string>
  [key: string]: unknown
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: Record<string, unknown>
}

export interface FfmpegCommandExecutor {
  run: (options: FfmpegExecutionOptions) => Promise<FfmpegExecutionResult>
}

export interface FfmpegMediaToolsDirectories {
  screenshots: string
  subtitles: string
}

export class FfmpegMediaTools {
  constructor(
    private readonly paths: Pick<FfmpegRuntimePaths, 'ffmpeg' | 'ffprobe'>,
    private readonly directories: FfmpegMediaToolsDirectories,
    private readonly executor: FfmpegCommandExecutor = new FfmpegProcessExecutor(),
    private readonly scheduler: FfmpegTaskScheduler = new FfmpegTaskScheduler(),
  ) {}

  async probeStreams(inputPath: string, signal?: AbortSignal): Promise<FfprobeStream[]> {
    const output = await this.probeRaw(inputPath, signal)
    return Array.isArray(output.streams) ? output.streams : []
  }

  async probe(
    inputPath: string,
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<MediaProbeResult> {
    return selectPrimaryMediaStreams(
      normalizeFfprobeOutput(sourceId, await this.probeRaw(inputPath, signal)),
    )
  }

  private async probeRaw(inputPath: string, signal?: AbortSignal): Promise<FfprobeOutput> {
    return this.scheduler.schedule({
      kind: 'probe',
      signal,
      run: async (taskSignal) => {
        const result = await this.executor.run({
          executable: this.paths.ffprobe,
          arguments: ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', inputPath],
          inputs: [inputPath],
          kind: 'probe',
          signal: taskSignal,
        })
        return JSON.parse(result.stdout.toString('utf8')) as FfprobeOutput
      },
    })
  }

  async getSubtitleStreams(inputPath: string, signal?: AbortSignal): Promise<FfprobeStream[]> {
    const streams = await this.probeStreams(inputPath, signal)
    return streams.filter((stream) => stream.codec_type === 'subtitle')
  }

  async grabFrame(inputPath: string, time: string, signal?: AbortSignal): Promise<string> {
    await mkdir(this.directories.screenshots, { recursive: true })
    const outputPath = join(this.directories.screenshots, `${randomUUID()}.jpeg`)
    try {
      await this.scheduler.schedule({
        kind: 'screenshot',
        signal,
        run: (taskSignal) =>
          this.executor.run({
            executable: this.paths.ffmpeg,
            arguments: [
              '-hide_banner',
              '-loglevel',
              'error',
              '-ss',
              time,
              '-i',
              inputPath,
              '-map',
              '0:v:0',
              '-frames:v',
              '1',
              '-vf',
              'scale=640:360',
              '-c:v',
              'mjpeg',
              '-y',
              outputPath,
            ],
            inputs: [inputPath],
            signal: taskSignal,
          }),
      })
      const data = await readFile(outputPath)
      return `data:image/jpeg;base64,${data.toString('base64')}`
    } finally {
      await rm(outputPath, { force: true })
    }
  }

  async convertSubtitle(inputPath: string, signal?: AbortSignal) {
    await mkdir(this.directories.subtitles, { recursive: true })
    const fileName = `${randomUUID()}.ass`
    const outputPath = join(this.directories.subtitles, fileName)
    try {
      await this.scheduler.schedule({
        kind: 'subtitle',
        signal,
        run: (taskSignal) =>
          this.executor.run({
            executable: this.paths.ffmpeg,
            arguments: [
              '-hide_banner',
              '-loglevel',
              'error',
              '-i',
              inputPath,
              '-map',
              '0:s:0',
              '-c:s',
              'ass',
              '-y',
              outputPath,
            ],
            inputs: [inputPath],
            signal: taskSignal,
          }),
      })
      return { fileName, filePath: outputPath }
    } catch (error) {
      await rm(outputPath, { force: true })
      throw error
    }
  }

  async extractSubtitle(inputPath: string, subtitleIndex: number, signal?: AbortSignal) {
    const subtitleStreams = await this.getSubtitleStreams(inputPath, signal)
    const stream = subtitleStreams.at(subtitleIndex)
    if (!stream) throw new Error('解析内嵌字幕发生错误')
    const codecName = `${stream.codec_name ?? ''} ${stream.codec_tag_string ?? ''}`.toLowerCase()
    if (codecName.includes('pgs') || codecName.includes('hdmv_pgs')) {
      throw new Error('不支持加载「位图字幕」')
    }

    await mkdir(this.directories.subtitles, { recursive: true })
    const outputPath = join(this.directories.subtitles, `${randomUUID()}-${subtitleIndex}.ass`)
    try {
      await this.scheduler.schedule({
        kind: 'subtitle',
        signal,
        run: (taskSignal) =>
          this.executor.run({
            executable: this.paths.ffmpeg,
            arguments: [
              '-hide_banner',
              '-loglevel',
              'error',
              '-i',
              inputPath,
              '-map',
              `0:s:${subtitleIndex}`,
              '-c:s',
              'ass',
              '-y',
              outputPath,
            ],
            inputs: [inputPath],
            signal: taskSignal,
          }),
      })
      return outputPath
    } catch (error) {
      await rm(outputPath, { force: true })
      throw error
    }
  }
}
