import type { PlaybackSource } from '@marchen/playback-core'
import type { ReadyState, ReloadingState } from '@marchen/player-loading'
import type {
  MediaCompatError,
  PlaybackSourceLease,
  PlaybackTimelineDescriptor,
} from '@marchen/shared/media'
import type { SourceLifecyclePort } from './platform'
import { isMediaCompatErrorCode } from '@marchen/shared/media'
import { usePlayerLoadingState } from '@renderer/services/player-loading/hooks'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { PlaybackTelemetryObserver } from '@renderer/services/telemetry/playback-observer'
import { getPlayerOperationId } from '@renderer/services/telemetry/player-loading-observer'
import { useEffect, useRef, useState } from 'react'
import { HtmlVideoMediaAdapter } from './adapters'
import { waitForBrowserFirstFrame } from './browser-playback-readiness'
import { isCompatibilityFallbackEligible } from './fallback-classification'
import { PlaybackFallbackController } from './fallback-controller'
import type { PlaybackFallbackStatePort } from './fallback-state'
import {
  DEFAULT_PREPARATION_DEADLINES_MS,
  withPlaybackStageDeadline,
} from './preparation-deadlines'
import { PlaybackPerformanceRecorder } from './playback-performance'
import { PlayerRuntime } from './runtime'
import { PlaybackSourceGenerationGuard } from './source-generation'

type PreparedLoadingState = ReadyState | ReloadingState

const browserMediaError = (error: unknown, lease: PlaybackSourceLease): MediaCompatError => {
  const candidate = error as Partial<MediaCompatError> | undefined
  return {
    code:
      typeof candidate?.code === 'string' && isMediaCompatErrorCode(candidate.code)
        ? candidate.code
        : 'decode-failed',
    stage: candidate?.stage ?? 'decode',
    message: error instanceof Error ? error.message : '浏览器兼容播放失败',
    recoverable: true,
    cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
    profile: lease.profile,
    attemptChain: lease.attemptChain,
    deadlineStage: candidate?.deadlineStage,
  }
}

export const createPlaybackSource = (
  state: PreparedLoadingState,
  leasedUrl: string,
  timeline?: PlaybackTimelineDescriptor,
  mimeType?: string,
): PlaybackSource => {
  const { video } = state

  return {
    id: `${video.hash}:${video.source.kind}`,
    url: leasedUrl,
    timeline,
    mimeType,
    title: video.name,
    autoplay: true,
  }
}

/**
 * 只在 player-loading 已准备好数据时拥有 Runtime。
 * ready 与 reloading 之间保持实例；新导入、cancel 或卸载会销毁旧实例。
 */
export const useNativePlayerRuntime = (
  video: HTMLVideoElement | null,
  sourceLifecycle: SourceLifecyclePort,
  fallbackState?: PlaybackFallbackStatePort,
): PlayerRuntime | null => {
  const loadingState = usePlayerLoadingState()
  const active = loadingState.step === 'ready' || loadingState.step === 'reloading'
  const [runtime, setRuntime] = useState<PlayerRuntime | null>(null)
  const loadedSourceRef = useRef<{ runtime: PlayerRuntime; id: string } | null>(null)
  const mediaAdapterRef = useRef<{ runtime: PlayerRuntime; adapter: HtmlVideoMediaAdapter } | null>(
    null,
  )
  const sourceGenerationRef = useRef(new PlaybackSourceGenerationGuard())
  const fallbackControllerRef = useRef(new PlaybackFallbackController())
  const telemetryRef = useRef<{
    runtime: PlayerRuntime
    id: string
    observer: PlaybackTelemetryObserver
    unsubscribe: () => void
    detachVideo: () => void
  } | null>(null)

  const disposeTelemetry = (reason: 'user_exit' | 'source_changed' | 'cancelled') => {
    const current = telemetryRef.current
    if (!current) return
    telemetryRef.current = null
    current.unsubscribe()
    current.detachVideo()
    current.observer.finish(reason)
  }

  useEffect(() => {
    if (!video || !active) {
      setRuntime(null)
      return
    }

    const adapter = new HtmlVideoMediaAdapter(video)
    const nextRuntime = new PlayerRuntime(adapter)
    mediaAdapterRef.current = { runtime: nextRuntime, adapter }
    setRuntime(nextRuntime)
    const retryBlockedAutoplay = () => {
      if (!document.hidden) nextRuntime.retryBlockedAutoplay()
    }
    window.addEventListener('focus', retryBlockedAutoplay)
    document.addEventListener('visibilitychange', retryBlockedAutoplay)

    return () => {
      window.removeEventListener('focus', retryBlockedAutoplay)
      document.removeEventListener('visibilitychange', retryBlockedAutoplay)
      disposeTelemetry(active ? 'user_exit' : 'cancelled')
      nextRuntime.destroy()
      if (mediaAdapterRef.current?.runtime === nextRuntime) mediaAdapterRef.current = null
      loadedSourceRef.current = null
      setRuntime((current) => (current === nextRuntime ? null : current))
    }
  }, [active, video])

  useEffect(() => {
    if (!runtime || !active) return
    const logicalId = `${loadingState.video.hash}:${loadingState.video.source.kind}`
    if (loadedSourceRef.current?.runtime === runtime && loadedSourceRef.current.id === logicalId)
      return

    const sourceGeneration = sourceGenerationRef.current
    const generation = sourceGeneration.begin()
    disposeTelemetry('source_changed')
    const operationId = getPlayerOperationId(loadingState.video.hash) ?? crypto.randomUUID()
    const playbackTelemetry = new PlaybackTelemetryObserver(operationId)
    const attemptId = playbackTelemetry.beginPrepare(generation)
    const readinessAbort = new AbortController()
    const performanceRecorder = new PlaybackPerformanceRecorder()
    const unsubscribe = runtime.subscribe(() => playbackTelemetry.observe(runtime.state))
    const onWaiting = () => playbackTelemetry.onWaiting()
    const onPlaying = () => playbackTelemetry.onPlaying()
    video?.addEventListener('waiting', onWaiting)
    video?.addEventListener('playing', onPlaying)
    telemetryRef.current = {
      runtime,
      id: logicalId,
      observer: playbackTelemetry,
      unsubscribe,
      detachVideo: () => {
        video?.removeEventListener('waiting', onWaiting)
        video?.removeEventListener('playing', onPlaying)
      },
    }
    const activateLease = (
      lease: Awaited<ReturnType<SourceLifecyclePort['prepare']>>,
      currentAttemptId: string,
    ) => {
      const telemetryAccepted = playbackTelemetry.completePrepare(currentAttemptId, lease)
      if (!telemetryAccepted) {
        lease.release()
        return
      }
      const source = createPlaybackSource(loadingState, lease.url, lease.timeline, lease.mimeType)
      runtime.load(source, lease)
      loadedSourceRef.current = { runtime, id: logicalId }
      const deferAutoplayUntilTransportReady =
        source.autoplay && lease.transport === 'hls' && Boolean(lease.profile)
      if (source.autoplay && !deferAutoplayUntilTransportReady) void runtime.commands.play()

      if (!lease.profile || lease.profile === 'native') return
      const adapter =
        mediaAdapterRef.current?.runtime === runtime ? mediaAdapterRef.current.adapter : undefined
      void (async () => {
        if (!adapter) throw new Error('HLS 媒体适配器已经释放')
        // BUFFER_CREATED 是 SourceBuffer 已建立的证据；此前不能把 Main 会话推进到 attaching。
        const finishMse = performanceRecorder.beginStage('mse')
        try {
          await withPlaybackStageDeadline('mse', adapter.waitForTransportReady(), {
            signal: readinessAbort.signal,
          })
        } finally {
          finishMse()
        }
        await lease.markAttaching?.()
        const finishFirstFrame = performanceRecorder.beginStage('first-frame')
        try {
          await waitForBrowserFirstFrame(video!, {
            deadlineMs: DEFAULT_PREPARATION_DEADLINES_MS['first-frame'],
            signal: readinessAbort.signal,
          })
        } finally {
          finishFirstFrame()
        }
        await lease.markPlayable?.()
        if (deferAutoplayUntilTransportReady) {
          // v1 EVENT 在 FFmpeg 生产期间被 HLS.js 当成直播，首帧就绪时可能已停在
          // live edge。先回到当前 generation 的局部起点，再重申 autoplay；不调用
          // lease.seek，避免初始播放又创建一个 generation。
          if (lease.hlsSessionMode !== 'stable-vod') adapter.seek(0)
          await runtime.commands.play()
        }
      })().catch(async (error) => {
        const detail = browserMediaError(error, lease)
        if (!readinessAbort.signal.aborted) {
          await lease
            .markFailed?.(detail)
            .catch((cause) => reportOperationalError('player', 'mark_failed', cause))
        }
        if (
          !isCompatibilityFallbackEligible(detail) ||
          readinessAbort.signal.aborted ||
          !sourceGeneration.isCurrent(generation) ||
          lease.mode === 'transcode-video'
        ) {
          if (!readinessAbort.signal.aborted) {
            reportOperationalError('player', 'browser_playable', error)
          }
          return
        }
        const fallbackAttemptId = playbackTelemetry.beginFallback(lease.mode, 'transcode-video')
        await fallbackControllerRef.current
          .replace({
            logicalSourceId: logicalId,
            mode: lease.mode,
            error: detail,
            capture: () => fallbackState?.capture(runtime) ?? defaultFallbackState(runtime),
            prepareAndActivate: async (attemptMethods) => {
              const safeLease = await sourceLifecycle.prepare(loadingState.video.source, {
                nativeDecodeFailed: true,
                signal: readinessAbort.signal,
                startTime: runtime.clock.now(),
                attemptMethods,
              })
              if (!sourceGeneration.isCurrent(generation)) {
                safeLease.release()
                throw new Error('兼容回退已过期')
              }
              activateLease(safeLease, fallbackAttemptId)
            },
            restore: (state) =>
              fallbackState?.restore(runtime, state) ?? runtime.commands.restore(state.media),
          })
          .catch((cause) => {
            playbackTelemetry.fail('fallback-failed')
            reportOperationalError('player', 'fallback', cause)
          })
      })
    }

    void sourceLifecycle
      .prepare(loadingState.video.source, { signal: readinessAbort.signal })
      .then((lease) => {
        const acceptedLease = sourceGeneration.accept(generation, lease)
        if (!acceptedLease) return
        activateLease(acceptedLease, attemptId)
      })
      .catch((error) => {
        if (sourceGeneration.isCurrent(generation)) {
          if (import.meta.env.DEV) console.error('[media] prepare source failed', error)
          playbackTelemetry.fail('prepare-failed')
          reportOperationalError('player', 'prepare_source', error)
        }
      })

    return () => {
      readinessAbort.abort()
      sourceGeneration.invalidate(generation)
    }
  }, [active, fallbackState, loadingState, runtime, sourceLifecycle, video])

  useEffect(() => {
    if (!runtime || !active) return
    let cancelled = false
    const fallbackAbort = new AbortController()
    let handledError = false
    const logicalSourceId = `${loadingState.video.hash}:${loadingState.video.source.kind}`
    const unsubscribe = runtime.subscribe(() => {
      const state = runtime.state
      if (state.status !== 'error') {
        handledError = false
        return
      }
      if (handledError) return
      handledError = true
      const playbackTelemetry = telemetryRef.current?.observer
      const currentMode = runtime.playbackMode
      if (!currentMode || currentMode === 'transcode-video') {
        playbackTelemetry?.fail(state.error.code)
        reportOperationalError('player', 'playback', state.error)
        return
      }
      const fallbackAttemptId = playbackTelemetry?.beginFallback(currentMode, 'transcode-video')
      void fallbackControllerRef.current
        .replace({
          logicalSourceId,
          mode: currentMode,
          error: state.error,
          capture: () => fallbackState?.capture(runtime) ?? defaultFallbackState(runtime),
          prepareAndActivate: async (attemptMethods) => {
            const lease = await sourceLifecycle.prepare(loadingState.video.source, {
              nativeDecodeFailed: true,
              signal: fallbackAbort.signal,
              startTime: runtime.clock.now(),
              attemptMethods,
            })
            if (cancelled) {
              lease.release()
              throw new Error('原生解码回退已取消')
            }
            if (fallbackAttemptId) {
              playbackTelemetry?.completePrepare(fallbackAttemptId, lease, { fallback: true })
            }
            runtime.load(
              {
                ...createPlaybackSource(loadingState, lease.url, lease.timeline, lease.mimeType),
                autoplay: false,
              },
              lease,
            )
          },
          restore: (state) =>
            fallbackState?.restore(runtime, state) ?? runtime.commands.restore(state.media),
        })
        .catch((error) => {
          if (!cancelled) {
            if (import.meta.env.DEV) console.error('[media] compatibility fallback failed', error)
            playbackTelemetry?.fail('fallback-failed')
            reportOperationalError('player', 'fallback', error)
          }
        })
    })
    return () => {
      cancelled = true
      fallbackAbort.abort()
      unsubscribe()
    }
  }, [active, fallbackState, loadingState, runtime, sourceLifecycle])

  return runtime
}

const defaultFallbackState = (runtime: PlayerRuntime) => ({
  media: runtime.clock.snapshot(),
  rotation: 0 as const,
  subtitle: { selectedId: 'off', timeOffset: 0 },
  danmaku: { enabled: true },
})
