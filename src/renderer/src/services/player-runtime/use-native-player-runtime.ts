import type { MediaAudioTrack, PlaybackMediaRestoreState } from '@marchen/playback-core'
import type { EnginePreference, PlayerEngine } from './engine-policy'
import type { PlaybackResource } from './platform/media-resource'
import { playerEngineStateAtom } from '@renderer/atoms/player-engine'
import { playerSettingAtom } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { db } from '@renderer/database/db'
import { usePlayerLoadingState } from '@renderer/services/player-loading/hooks'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { PlaybackTelemetryObserver } from '@renderer/services/telemetry/playback-observer'
import { getPlayerOperationId } from '@renderer/services/telemetry/player-loading-observer'
import { useEffect, useRef, useState } from 'react'
import { CanvasMediaAdapter } from '../media/canvas/media-adapter'
import { HtmlVideoMediaAdapter } from './adapters'
import { DualMediaAdapter } from './adapters/dual-media-adapter'
import { restoreAudioPreference } from './audio-preference'
import { waitForBrowserFirstFrame } from './browser-playback-readiness'
import { getCanvasSupport } from './canvas-support'
import {
  assertNativeVideoSupport,
  canFallbackToCanvas,
  choosePlaybackEngine,
} from './engine-policy'
import { isCompleted } from './history/playback-history-adapter'
import { openPlaybackResource } from './platform/media-resource'
import { PlayerRuntime } from './runtime'

/** 影片与业务 Runtime 跨内核切换保持稳定；原文件授权由逻辑加载持有。 */
export const useNativePlayerRuntime = (
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
): PlayerRuntime | null => {
  const loading = usePlayerLoadingState()
  const prepared = loading.step === 'ready' || loading.step === 'reloading' ? loading.video : null
  const active = Boolean(prepared)
  const logicalId = prepared ? `${prepared.hash}:${prepared.source.kind}` : null
  const preparedRef = useRef(prepared)
  preparedRef.current = prepared
  const [runtime, setRuntime] = useState<PlayerRuntime | null>(null)
  const bindingRef = useRef<{
    runtime: PlayerRuntime
    adapter: DualMediaAdapter
    resource?: PlaybackResource
    audioTrackId?: number
  } | null>(null)

  useEffect(() => {
    if (!video || !canvas || !active) return
    const adapter = new DualMediaAdapter(
      (engine) =>
        engine === 'native'
          ? new HtmlVideoMediaAdapter(video)
          : new CanvasMediaAdapter(canvas, async (id) => {
              const resource = bindingRef.current?.resource
              if (!resource || resource.id !== id) throw new Error('媒体来源已关闭')
              return { ...resource.canvas(), audioTrackId: bindingRef.current?.audioTrackId }
            }),
      (engine) => {
        video.hidden = engine === 'canvas'
        canvas.hidden = engine !== 'canvas'
      },
      () => bindingRef.current?.resource?.metadata.videoFrameRate,
    )
    const next = new PlayerRuntime(adapter)
    bindingRef.current = { runtime: next, adapter }
    setRuntime(next)
    const retry = () => {
      if (!document.hidden) next.retryBlockedAutoplay()
    }
    window.addEventListener('focus', retry)
    const visibility = () => {
      // 全屏过渡、切换 macOS 桌面也会触发 hidden，不代表用户请求暂停。
      if (!document.hidden) retry()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('focus', retry)
      document.removeEventListener('visibilitychange', visibility)
      next.destroy()
      if (bindingRef.current?.runtime === next) {
        bindingRef.current.resource?.close()
        bindingRef.current = null
      }
      setRuntime((current) => (current === next ? null : current))
    }
  }, [active, canvas, video])

  useEffect(() => {
    const media = preparedRef.current
    const current = bindingRef.current
    if (!runtime || !logicalId || !media || !current || current.runtime !== runtime || !video)
      return
    const controller = new AbortController()
    let attemptController = new AbortController()
    let generation = 0
    let fallbackAttempted = false
    let actual: PlayerEngine = 'native'
    const canvasSupport = getCanvasSupport()
    let preference = jotaiStore.get(playerSettingAtom).enginePreference ?? 'auto'
    if (!canvasSupport.supported && preference === 'canvas') preference = 'auto'
    let userIntent = 0
    let pendingRestore: PlaybackMediaRestoreState | undefined
    let activeRestore: PlaybackMediaRestoreState | undefined
    let failedRestore: PlaybackMediaRestoreState | undefined
    let pendingPreference: EnginePreference | undefined
    let pendingPrevious: PlayerEngine | undefined
    let finishInitial = () => {}
    const initialReady = new Promise<void>((resolve) => {
      finishInitial = resolve
    })
    let resource: PlaybackResource | undefined
    let audioTracks: MediaAudioTrack[] = []
    let primaryAudioTrackId: number | undefined
    let audioSelection = 0
    let notice: ReturnType<typeof toast> | undefined
    const notify = (title: string, error = false, loading = false) => {
      const props = {
        title,
        variant: error ? ('destructive' as const) : ('default' as const),
        duration: loading ? Infinity : 4000,
        open: true,
      }
      if (notice) notice.update({ ...props, id: notice.id })
      else notice = toast(props)
    }
    const observer = new PlaybackTelemetryObserver(
      getPlayerOperationId(media.hash) ?? crypto.randomUUID(),
    )
    let buffering = false
    const unsubscribe = runtime.subscribe(() => {
      observer.observePresentation(runtime.presentation)
      observer.observe(runtime.state)
      const next = runtime.presentation?.buffering ?? false
      if (next !== buffering) {
        buffering = next
        if (next) observer.onWaiting()
        else observer.onPlaying()
      }
    })

    const activate = async (
      engine: PlayerEngine,
      state: PlaybackMediaRestoreState,
      reason: string,
    ) => {
      if (engine === 'canvas' && !canvasSupport.supported) throw new Error(canvasSupport.reason)
      if (!resource || controller.signal.aborted)
        throw new DOMException('媒体来源已关闭', 'AbortError')
      attemptController.abort()
      attemptController = new AbortController()
      const signal = AbortSignal.any([controller.signal, attemptController.signal])
      const token = ++generation
      observer.observePresentation(runtime.presentation)
      const attemptId = observer.beginPrepare(token, engine)
      if (engine === 'native' && !canvasSupport.supported) {
        await assertNativeVideoSupport(resource, (mime) => video.canPlayType(mime))
        signal.throwIfAborted()
        if (token !== generation) throw new DOMException('媒体来源已变化', 'AbortError')
      }
      actual = engine
      activeRestore = state
      runtime.load({
        ...(engine === 'canvas'
          ? { engine, resourceId: resource.id }
          : { engine, url: resource.url }),
        id: logicalId,
        title: media.name,
        startTime: state.currentTime,
        autoplay: !state.paused,
      })
      runtime.restoreCommands(() => {
        runtime.commands.setVolume(state.volume)
        runtime.commands.setMuted(
          engine === 'native' && !canvasSupport.supported ? true : state.muted,
        )
        runtime.commands.setRate(state.rate)
      })
      // 原生回执必须在可能同步出现首帧之前注册；Canvas ready 本身包含实际绘制。
      let firstFrame =
        engine === 'canvas' ? current.adapter.waitForPlayableData() : Promise.resolve()
      void firstFrame.catch(() => {})
      try {
        if (engine === 'native' && current.audioTrackId !== primaryAudioTrackId)
          throw new Error('原生内核无法保留所选音轨，请使用兼容内核')
        await current.adapter.waitForPlayableData()
        signal.throwIfAborted()
        if (engine === 'native') {
          // 非零恢复必须等待目标 seek 的真实画面，初始位置首帧不能替代。
          firstFrame =
            state.currentTime <= 0 && runtime.presentation?.firstFrame
              ? Promise.resolve()
              : waitForBrowserFirstFrame(video, { deadlineMs: 8000, signal })
          void firstFrame.catch(() => {})
          if (state.currentTime > 0)
            runtime.restoreCommands(() => runtime.commands.seek(state.currentTime))
        }
        if (!state.paused) await runtime.restoreCommands(() => runtime.commands.play())
        await firstFrame
        signal.throwIfAborted()
        if (engine === 'native' && !canvasSupport.supported)
          runtime.restoreCommands(() => runtime.commands.setMuted(state.muted))
        if (token !== generation) throw new DOMException('内核切换已取消', 'AbortError')
        if (runtime.presentation)
          observer.completeEnginePrepare(attemptId, runtime.presentation, reason)
        if (engine === 'canvas')
          notify(
            reason === 'native-incompatible' || reason === 'preference'
              ? '正在使用兼容内核播放'
              : '已切换到兼容内核',
          )
      } catch (error) {
        if (signal.aborted || token !== generation)
          throw new DOMException('内核切换已取消', 'AbortError')
        failedRestore = { ...state }
        // 手动失败还会尝试恢复旧内核，此处不结束整次观看汇总。
        runtime.fail({
          code: 'decode',
          message: error instanceof Error ? error.message : '内核启动失败',
          recoverable: true,
        })
        reportOperationalError('player', 'engine_start', error)
        throw error
      } finally {
        if (token === generation) activeRestore = undefined
      }
    }

    const publish = (
      extra: { pending?: EnginePreference; switching?: boolean; error?: string } = {},
    ) => {
      if (controller.signal.aborted) return
      jotaiStore.set(playerEngineStateAtom, {
        preference,
        actual: resource ? actual : undefined,
        switching: false,
        selectPreference,
        retryCanvas,
        ...extra,
      })
    }
    const selectPreference = async (next: EnginePreference) => {
      if (next === 'canvas' && !canvasSupport.supported) return
      const intent = ++userIntent
      pendingPreference = next
      publish({ pending: next, switching: true })
      await initialReady
      if (!resource || controller.signal.aborted || intent !== userIntent) return
      pendingPrevious ??= actual
      const previous = pendingPrevious
      pendingRestore ??= { ...runtime.clock.snapshot() }
      const state = pendingRestore
      attemptController.abort()
      runtime.restoreCommands(() => runtime.commands.pause())
      publish({ pending: next, switching: true })
      try {
        const engine = await choosePlaybackEngine(
          next,
          resource,
          (mime) => video.canPlayType(mime),
          current.audioTrackId,
          canvasSupport.supported,
        )
        if (intent !== userIntent || controller.signal.aborted) return
        await activate(engine, state, 'settings')
        if (intent !== userIntent || controller.signal.aborted) return
        preference = next
        jotaiStore.set(playerSettingAtom, (settings) => ({ ...settings, enginePreference: next }))
        observer.engineChanged({
          from: previous,
          to: actual,
          trigger: 'settings',
          result: 'success',
          requested_preference: next,
          committed_preference: preference,
        })
        pendingRestore = undefined
        pendingPrevious = undefined
        pendingPreference = undefined
        publish()
      } catch (error) {
        if (intent !== userIntent || controller.signal.aborted) return
        try {
          await activate(previous, state, 'restore')
          observer.engineChanged({
            to: previous,
            trigger: 'restore',
            result: 'success',
            committed_preference: preference,
          })
        } catch {
          if (intent === userIntent) {
            observer.failAttempt('engine-restore-failed')
            observer.engineChanged({
              to: previous,
              trigger: 'restore',
              result: 'failed',
              committed_preference: preference,
            })
          }
        }
        if (intent !== userIntent || controller.signal.aborted) return
        observer.engineChanged({
          from: previous,
          to: next === 'auto' ? actual : next,
          trigger: 'settings',
          result: 'failed',
          requested_preference: next,
          committed_preference: preference,
        })
        pendingRestore = undefined
        pendingPrevious = undefined
        pendingPreference = undefined
        publish({ error: error instanceof Error ? error.message : '内核切换失败' })
      }
    }
    const retryCanvas = async () => {
      if (!canvasSupport.supported) return
      const intent = ++userIntent
      fallbackAttempted = true
      const from = actual
      publish({ switching: true })
      try {
        await activate('canvas', failedRestore ?? { ...runtime.clock.snapshot() }, 'retry')
        if (intent === userIntent) {
          observer.engineChanged({
            from,
            to: 'canvas',
            trigger: 'retry',
            result: 'success',
            committed_preference: preference,
          })
          publish()
        }
      } catch (error) {
        if (intent === userIntent) {
          observer.engineChanged({
            from,
            to: 'canvas',
            trigger: 'retry',
            result: 'failed',
            committed_preference: preference,
          })
          publish({ error: error instanceof Error ? error.message : '兼容内核启动失败' })
        }
      }
    }
    runtime.onCommand((command) => {
      const state = activeRestore ?? pendingRestore
      if (!state) return
      if (command.type === 'pause' || command.type === 'play')
        state.paused = command.type === 'pause'
      if (command.type === 'volume') state.volume = command.volume
      if (command.type === 'muted') state.muted = command.muted
      if (command.type === 'seek' || command.type === 'rate') {
        if (command.type === 'seek') state.currentTime = command.time
        else state.rate = command.rate
        const nextPreference = pendingPreference
        const intent = ++userIntent
        // 当前公开命令先完成，再取消旧 attempt；迟到首帧不能提交旧位置或偏好。
        queueMicrotask(() => {
          if (controller.signal.aborted || intent !== userIntent) return
          if (nextPreference) void selectPreference(nextPreference)
          else
            void activate(actual, state, 'user-command')
              .then(() => publish())
              .catch((error) => {
                if (intent === userIntent && !controller.signal.aborted)
                  publish({ error: error instanceof Error ? error.message : '播放恢复失败' })
              })
        })
      }
    })
    runtime.setAudioControl({
      getTracks: () => ({
        tracks: audioTracks,
        selectedId: current.adapter.getAudioTracks().selectedId ?? current.audioTrackId,
      }),
      select: async (id) => {
        const selection = ++audioSelection
        const track = audioTracks.find((track) => track.id === id)
        if (!track) throw new Error('音轨已变化或不存在')
        if (actual === 'native' && preference === 'native')
          throw new Error('H5 内核无法切换音轨，请先将播放内核设为自动或兼容')
        const previousAudioTrackId = current.audioTrackId
        const from = actual
        current.audioTrackId = id
        try {
          if (actual === 'canvas') await current.adapter.selectAudioTrack(id)
          else await activate('canvas', { ...runtime.clock.snapshot() }, 'audio-track')
        } catch (error) {
          if (!controller.signal.aborted && selection === audioSelection) {
            current.audioTrackId = previousAudioTrackId
            if (from !== 'canvas')
              observer.engineChanged({
                from,
                to: 'canvas',
                trigger: 'audio-track',
                result: 'failed',
                committed_preference: preference,
              })
          }
          throw error
        }
        if (controller.signal.aborted || selection !== audioSelection)
          throw new DOMException('音轨切换已取消', 'AbortError')
        if (from !== 'canvas')
          observer.engineChanged({
            from,
            to: 'canvas',
            trigger: 'audio-track',
            result: 'success',
            committed_preference: preference,
          })
        await db.history.update(media.hash, { audioTrack: track })
        publish()
      },
    })
    publish({ switching: true })

    const events = current.adapter.events$.subscribe((event) => {
      if (event.type !== 'error' || controller.signal.aborted) return
      if (
        !pendingPreference &&
        !pendingRestore &&
        canFallbackToCanvas(
          preference,
          actual,
          fallbackAttempted,
          event.error,
          canvasSupport.supported,
        )
      ) {
        fallbackAttempted = true
        const state = { ...(activeRestore ?? runtime.clock.snapshot()) }
        const intent = userIntent
        publish({ switching: true })
        notify('正在切换兼容内核…', false, true)
        // 先让当前会话消费 error，再进入新 attempt，避免重入覆盖新状态。
        queueMicrotask(() => {
          if (intent !== userIntent || controller.signal.aborted) return
          void activate('canvas', state, 'native-decode-failed')
            .then(() => {
              if (intent === userIntent) {
                observer.engineChanged({
                  from: 'native',
                  to: 'canvas',
                  trigger: 'automatic',
                  result: 'success',
                  committed_preference: preference,
                })
                publish()
              }
            })
            .catch(() => {
              if (intent === userIntent) {
                observer.engineChanged({
                  from: 'native',
                  to: 'canvas',
                  trigger: 'automatic',
                  result: 'failed',
                  committed_preference: preference,
                })
                publish({ error: '兼容内核启动失败' })
              }
            })
        })
      } else {
        failedRestore = { ...(activeRestore ?? runtime.clock.snapshot()) }
        if (!pendingRestore) observer.failAttempt(event.error.code)
        publish({ error: event.error.message })
      }
    })

    void (async () => {
      resource = await openPlaybackResource(media.source, controller.signal)
      controller.signal.throwIfAborted()
      current.resource = resource
      void resource.metadata.readVideoFrameRate()
      const [description, primaryAudio, history] = await Promise.all([
        resource.metadata.describe(),
        resource.input.getPrimaryAudioTrack(),
        db.history.get(media.hash),
      ])
      controller.signal.throwIfAborted()
      primaryAudioTrackId = primaryAudio?.id
      audioTracks = description.tracks
        .filter((track) => track.type === 'audio')
        .map((track) => ({
          id: track.id,
          label: track.name || `音轨 ${track.number}`,
          language: track.language,
          codec: track.codec,
          default: track.default,
          channels:
            track.config && 'numberOfChannels' in track.config ? track.config.numberOfChannels : 0,
        }))
      current.audioTrackId = restoreAudioPreference(
        audioTracks,
        history?.audioTrack,
        primaryAudioTrackId,
      )
      if (!canvasSupport.supported) current.audioTrackId = primaryAudioTrackId
      const engine =
        preference === 'auto' && current.audioTrackId !== primaryAudioTrackId
          ? 'canvas'
          : await choosePlaybackEngine(
              preference,
              resource,
              (type) => video.canPlayType(type),
              undefined,
              canvasSupport.supported,
            )
      controller.signal.throwIfAborted()
      const progress = history?.progress ?? 0
      const finished = isCompleted(progress, history?.duration ?? 0)
      await activate(
        engine,
        { currentTime: finished ? 0 : progress, volume: 1, muted: false, rate: 1, paused: false },
        preference === 'canvas'
          ? 'preference'
          : engine === 'canvas'
            ? 'native-incompatible'
            : 'native-trial',
      )
      publish()
    })()
      .catch((error) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return
        publish({ error: error instanceof Error ? error.message : '媒体读取失败' })
        runtime.fail({
          code: resource ? 'decode' : 'source-unavailable',
          message: error instanceof Error ? error.message : '媒体读取失败',
          recoverable: true,
        })
        observer.failAttempt(resource ? 'engine-start-failed' : 'source-unavailable')
        reportOperationalError('player', 'prepare_source', error)
      })
      .finally(finishInitial)

    return () => {
      runtime.onCommand(undefined)
      runtime.setAudioControl(undefined)
      jotaiStore.set(playerEngineStateAtom, null)
      events.unsubscribe()
      unsubscribe()
      controller.abort()
      finishInitial()
      attemptController.abort()
      runtime.cancel()
      resource?.close()
      if (current.resource === resource) current.resource = undefined
      if (activeRestore)
        observer.engineChanged({
          to: actual,
          trigger: pendingPreference ? 'settings' : 'automatic',
          result: 'cancelled',
          requested_preference: pendingPreference,
          committed_preference: preference,
        })
      observer.finish('source_changed')
      notice?.dismiss()
    }
  }, [logicalId, runtime, video])
  return runtime
}
