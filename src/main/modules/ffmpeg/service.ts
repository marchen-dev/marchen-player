import type { FfmpegRuntime } from './runtime'

import { mediaCachePath, screenshotsPath, subtitlesPath } from '@main/constants/app'

import { app } from 'electron'
import { MediaCacheManager } from './cache'
import { FfmpegProcessExecutor } from './executor'
import { FfmpegMediaTools } from './media-tools'
import { resolveFfmpegRuntime } from './runtime'
import { FfmpegTaskScheduler } from './scheduler'

const executor = new FfmpegProcessExecutor()
const scheduler = new FfmpegTaskScheduler()

let mediaToolsPromise: Promise<FfmpegMediaTools> | undefined
let runtimePromise: Promise<FfmpegRuntime> | undefined
let cacheManager: MediaCacheManager | undefined

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
  cacheManager: (cacheManager ??= new MediaCacheManager({ root: mediaCachePath() })),
})

export const shutdownFfmpegService = (): void => scheduler.close()

export const sweepFfmpegMediaCache = (): Promise<string[]> => {
  cacheManager ??= new MediaCacheManager({ root: mediaCachePath() })
  return cacheManager.sweepExpired()
}
