import { createStorageFolder } from '@main/constants/app'
import { getFfmpegMediaTools } from '@main/modules/ffmpeg/service'

/**
 * 保留原有 IPC 使用的轻量外观，实际命令统一进入运行时、自检、调度器和参数数组执行器。
 */
export default class FFmpeg {
  constructor(private readonly inputPath: string) {
    createStorageFolder()
  }

  grabFrame = async (time: string): Promise<string> =>
    (await getFfmpegMediaTools()).grabFrame(this.inputPath, time)

  coverToAssSubtitle = async (): Promise<{ fileName: string; filePath: string }> =>
    (await getFfmpegMediaTools()).convertSubtitle(this.inputPath)

  getSubtitlesIntroFromAnime = async () =>
    (await getFfmpegMediaTools()).getSubtitleStreams(this.inputPath)

  extractSubtitles = async (index: number): Promise<string> =>
    (await getFfmpegMediaTools()).extractSubtitle(this.inputPath, index)
}
