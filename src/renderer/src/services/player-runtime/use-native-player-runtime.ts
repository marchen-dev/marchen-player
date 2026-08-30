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
import {
  BrowserPlaybackReadinessError,
  waitForBrowserFirstFrame,
} from './browser-playback-readiness'
import { PlaybackFallbackController } from './fallback-controller'
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

    return () => {
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
      if (!playbackTelemetry.completePrepare(currentAttemptId, lease)) {
        lease.release()
        return
      }
      const source = createPlaybackSource(loadingState, lease.url, lease.timeline, lease.mimeType)
      runtime.load(source, lease)
      loadedSourceRef.current = { runtime, id: logicalId }
      if (source.autoplay) void runtime.commands.play()

      if (!lease.profile || lease.profile === 'native') return
      const adapter =
        mediaAdapterRef.current?.runtime === runtime ? mediaAdapterRef.current.adapter : undefined
      void (async () => {
        if (!adapter) throw new Error('HLS 媒体适配器已经释放')
        // BUFFER_CREATED 是 SourceBuffer 已建立的证据；此前不能把 Main 会话推进到 attaching。
        await adapter.waitForTransportReady()
        await lease.markAttaching?.()
        await waitForBrowserFirstFrame(video!, {
          deadlineMs: lease.profile === 'copy-video-aac' ? 8_000 : 60_000,
          signal: readinessAbort.signal,
        })
        await lease.markPlayable?.()
      })().catch(async (error) => {
        if (!readinessAbort.signal.aborted) {
          const detail = browserMediaError(error, lease)
          await lease
            .markFailed?.(detail)
            .catch((cause) => reportOperationalError('player', 'mark_failed', cause))
        }
        if (
          !(error instanceof BrowserPlaybackReadinessError) ||
          error.code !== 'startup-deadline-exceeded' ||
          readinessAbort.signal.aborted ||
          !sourceGeneration.isCurrent(generation) ||
          lease.profile !== 'copy-video-aac'
        ) {
          if (!readinessAbort.signal.aborted) {
            reportOperationalError('player', 'browser_playable', error)
          }
          return
        }
        const upgradeAttemptId = playbackTelemetry.beginPrepare(generation + 1)
        try {
          const safeLease = await sourceLifecycle.prepare(loadingState.video.source, {
            startTime: runtime.clock.now(),
            forceProfile: 'safe-h264-aac-sdr',
            attemptChain: ['copy-video-aac', 'safe-h264-aac-sdr'],
          })
          if (!sourceGeneration.isCurrent(generation)) {
            safeLease.release()
            return
          }
          activateLease(safeLease, upgradeAttemptId)
        } catch (cause) {
          const upgradeError = Object.assign(
            new Error('音频优化档位未在期限内解码首帧，安全档位也准备失败', { cause }),
            {
              code: 'startup-deadline-exceeded',
              stage: 'decode',
              attemptChain: ['copy-video-aac', 'safe-h264-aac-sdr'],
            },
          )
          playbackTelemetry.fail('profile-upgrade-failed')
          reportOperationalError('player', 'profile_upgrade', upgradeError)
        }
      })
    }

    void sourceLifecycle
      .prepare(loadingState.video.source)
      .then((lease) => {
        const acceptedLease = sourceGeneration.accept(generation, lease)
        if (!acceptedLease) return
        activateLease(acceptedLease, attemptId)
      })
      .catch((error) => {
        if (sourceGeneration.isCurrent(generation)) {
          playbackTelemetry.fail('prepare-failed')
          reportOperationalError('player', 'prepare_source', error)
        }
      })

    return () => {
      readinessAbort.abort()
      sourceGeneration.invalidate(generation)
    }
  }, [active, loadingState, runtime, sourceLifecycle, video])

  useEffect(() => {
    if (!runtime || !active) return
    let cancelled = false
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
      if (currentMode !== 'direct') {
        playbackTelemetry?.fail(state.error.code)
        reportOperationalError('player', 'playback', state.error)
        return
      }
      const fallbackAttemptId = playbackTelemetry?.beginFallback('direct', 'transcode-video')
      void fallbackControllerRef.current
        .replace({
          logicalSourceId,
          mode: 'direct',
          error: state.error,
          capture: () => {
            const media = runtime.clock.snapshot()
            return {
              media,
              // 视觉状态由同一个 NativePlayer/Provider 持有，换 transport 不会重建。
              rotation: 0,
              subtitle: { selectedId: '', timeOffset: 0 },
              danmaku: { enabled: true },
            }
          },
          prepareAndActivate: async () => {
            const lease = await sourceLifecycle.prepare(loadingState.video.source, {
              nativeDecodeFailed: true,
              startTime: runtime.clock.now(),
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
          restore: (fallbackState) => runtime.commands.restore(fallbackState.media),
        })
        .catch((error) => {
          if (!cancelled) {
            playbackTelemetry?.fail('fallback-failed')
            reportOperationalError('player', 'fallback', error)
          }
        })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [active, loadingState, runtime, sourceLifecycle])

  return runtime
}
