import type { FfmpegRuntime } from './runtime'

import {
  mediaKeyframeCachePath,
  mediaSegmentCachePath,
  screenshotsPath,
  subtitlesPath,
} from '@main/constants/app'

import { app } from 'electron'
import { MediaCacheManager } from './cache'
import { FfmpegProcessExecutor } from './executor'
import { FfmpegMediaTools } from './media-tools'
import { KeyframeMetadataCache } from './keyframe-cache'
import { resolveFfmpegRuntime } from './runtime'
import { FfmpegTaskScheduler } from './scheduler'

const executor = new FfmpegProcessExecutor()
const scheduler = new FfmpegTaskScheduler()

let mediaToolsPromise: Promise<FfmpegMediaTools> | undefined
let runtimePromise: Promise<FfmpegRuntime> | undefined
let cacheManager: MediaCacheManager | undefined
let keyframeCache: KeyframeMetadataCache | undefined

export const getFfmpegRuntime = (): Promise<FfmpegRuntime> => {
  runtimePromise ??= resolveFfmpegRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    developmentRoot: app.getAppPath(),
    runner: {
      run: async (executable, arguments_) => {
        const result = await executor.run({
          executable,
          arguments: arguments_,
          kind: 'probe',
        })
        return { stdout: result.stdout.toString('utf8'), stderr: result.stderr }
      },
    },
  }).then((result) => {
    if (result.ok) return result.runtime
    const error = new Error(result.error.message)
    error.cause = result.error
    throw error
  })
  return runtimePromise
}

export const getFfmpegMediaTools = (): Promise<FfmpegMediaTools> => {
  mediaToolsPromise ??= getFfmpegRuntime().then((runtime) => {
    return new FfmpegMediaTools(
      runtime.paths,
      { screenshots: screenshotsPath(), subtitles: subtitlesPath() },
      executor,
      scheduler,
    )
  })
  return mediaToolsPromise
}

export const getFfmpegPlaybackBackend = async () => ({
  runtime: await getFfmpegRuntime(),
  executor,
  scheduler,
  cacheManager: (cacheManager ??= new MediaCacheManager({ root: mediaSegmentCachePath() })),
})

/** 可跨启动复用的关键帧 metadata，与不持久化的 segment session 分属不同根目录。 */
export const getKeyframeMetadataCache = (): KeyframeMetadataCache =>
  (keyframeCache ??= new KeyframeMetadataCache(mediaKeyframeCachePath()))

export const shutdownFfmpegService = (): void => scheduler.close()

export const sweepFfmpegMediaCache = (): Promise<string[]> => {
  cacheManager ??= new MediaCacheManager({ root: mediaSegmentCachePath() })
  return cacheManager.sweepOrphaned()
}
