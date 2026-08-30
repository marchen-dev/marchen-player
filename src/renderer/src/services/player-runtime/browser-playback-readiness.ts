import type { MediaCompatErrorStage } from '@marchen/shared/media'

export class BrowserPlaybackReadinessError extends Error {
  constructor(
    readonly code: 'metadata-invalid' | 'startup-deadline-exceeded' | 'cancelled',
    readonly stage: MediaCompatErrorStage,
    message: string,
  ) {
    super(message)
    this.name = 'BrowserPlaybackReadinessError'
  }
}

export interface BrowserPlaybackReadinessOptions {
  deadlineMs: number
  signal?: AbortSignal
}

/** loadedmetadata + 有效 duration + 首个实际解码帧共同定义 Browser playable。 */
export const waitForBrowserFirstFrame = (
  video: HTMLVideoElement,
  options: BrowserPlaybackReadinessOptions,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false
    let frameCallbackId: number | undefined
    const finish = (error?: BrowserPlaybackReadinessError) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('loadeddata', onLoadedData)
      options.signal?.removeEventListener('abort', onAbort)
      if (frameCallbackId !== undefined && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameCallbackId)
      }
      error ? reject(error) : resolve()
    }
    const onFrame = () => finish()
    const requestFrame = () => {
      if ('requestVideoFrameCallback' in video && video.requestVideoFrameCallback) {
        frameCallbackId = video.requestVideoFrameCallback(onFrame)
      }
    }
    const onMetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        finish(
          new BrowserPlaybackReadinessError(
            'metadata-invalid',
            'metadata',
            '浏览器已加载媒体元数据，但 duration 无效',
          ),
        )
        return
      }
      requestFrame()
    }
    // 旧 Chromium 没有 requestVideoFrameCallback 时，loadeddata 是可用的首帧降级证据。
    const onLoadedData = () => {
      if (
        !video.requestVideoFrameCallback &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        finish()
      }
    }
    const onAbort = () =>
      finish(new BrowserPlaybackReadinessError('cancelled', 'cleanup', '首帧等待已取消'))
    const deadline = setTimeout(
      () =>
        finish(
          new BrowserPlaybackReadinessError(
            'startup-deadline-exceeded',
            'decode',
            `浏览器未在 ${options.deadlineMs}ms 内解码首帧`,
          ),
        ),
      Math.max(1, options.deadlineMs),
    )

    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('loadeddata', onLoadedData)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
    else if (video.readyState >= 1) onMetadata()
  })
