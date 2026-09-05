import type { PlaybackError, PlaybackMediaSnapshot } from '@marchen/playback-core'
import type { PlaybackMode } from '@marchen/shared/media'
import type { PlaybackMethod } from '@marchen/shared/media'
import { LogicalPlaybackAttemptChain, playbackMethodForMode } from './logical-attempt-chain'
import type { CompatibilityFallbackErrorLike } from './fallback-classification'
import { isCompatibilityFallbackEligible } from './fallback-classification'

export interface PlaybackFallbackState {
  media: Pick<PlaybackMediaSnapshot, 'currentTime' | 'volume' | 'muted' | 'rate' | 'paused'>
  rotation: 0 | 90 | 180 | 270
  subtitle: {
    selectedId: string
    timeOffset: number
  }
  danmaku: {
    enabled: boolean
  }
}

export type PlaybackFallbackResult =
  | { status: 'replaced' }
  | { status: 'ignored'; reason: 'ineligible-error' | 'ineligible-mode' | 'already-attempted' }

interface PlaybackFallbackRequest {
  logicalSourceId: string
  mode: PlaybackMode
  error: CompatibilityFallbackErrorLike
  capture: () => PlaybackFallbackState
  prepareAndActivate: (attemptMethods: PlaybackMethod[]) => Promise<void>
  restore: (state: PlaybackFallbackState) => Promise<void> | void
}

export const isNativeDecodeFallbackError = (error: Pick<PlaybackError, 'code'>): boolean =>
  isCompatibilityFallbackEligible(error)

/**
 * 回退额度绑定原始 logical source，而不是 marchen/HLS 临时 URL。
 * 额度在异步准备前即消耗，因此兼容源失败、迟到错误或换 generation 都不会形成循环。
 */
export class PlaybackFallbackController {
  private readonly attempts = new Map<string, LogicalPlaybackAttemptChain>()

  hasAttempted(logicalSourceId: string): boolean {
    return this.attempts.get(logicalSourceId)?.methods.includes('transcode') === true
  }

  async replace(request: PlaybackFallbackRequest): Promise<PlaybackFallbackResult> {
    if (!isCompatibilityFallbackEligible(request.error)) {
      return { status: 'ignored', reason: 'ineligible-error' }
    }
    // direct、remux、仅转音频都可能把原视频轨道交给 Chromium 解码；只有已经
    // 转为 H.264 的 transcode-video 不得再次回退，避免兼容链形成循环。
    if (request.mode === 'transcode-video') return { status: 'ignored', reason: 'ineligible-mode' }
    const currentMethod = playbackMethodForMode(request.mode)
    const chain =
      this.attempts.get(request.logicalSourceId) ?? new LogicalPlaybackAttemptChain(currentMethod)
    if (chain.methods.includes('transcode')) {
      return { status: 'ignored', reason: 'already-attempted' }
    }

    const attemptMethods = chain.advance('transcode')
    this.attempts.set(request.logicalSourceId, chain)
    const state = request.capture()
    await request.prepareAndActivate(attemptMethods)
    await request.restore(state)
    return { status: 'replaced' }
  }
}
