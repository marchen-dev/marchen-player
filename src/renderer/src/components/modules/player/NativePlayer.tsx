import type { PlayerRotation } from './setting/PlayerSettingsPanel'
import { mediaFrameQueue } from '@renderer/services/media/frame-queue'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import {
  createPlayerPorts,
  isPlayerSessionReady,
  NativeDanmakuProvider,
  NativeDanmakuSurface,
  NativeSubtitleProvider,
  PlaybackVisualStateBridge,
  PlayerPortalRoot,
  PlayerRuntimeProvider,
  useNativePlayerRuntime,
  usePlaybackSessionObservers,
} from '@renderer/services/player-runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlayerControls } from './controls'
import {
  DanmakuSurface,
  InteractionSurface,
  PlayerCompatibilityNotice,
  PlayerShell,
  PlayerWindowChrome,
  SubtitleSurface,
  VideoSurface,
} from './shell'

/** 双内核共用宿主，控制器、字幕与弹幕跨内核切换保持挂载。 */
export const NativePlayer = () => {
  const rootRef = useRef<HTMLElement | null>(null)
  const ports = useMemo(() => createPlayerPorts(), [])
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [rotation, setRotation] = useState<PlayerRotation>(0)
  const [fullscreen, setFullscreen] = useState(ports.fullscreen.getSnapshot().active)
  const fallbackState = useMemo(() => new PlaybackVisualStateBridge(), [])
  fallbackState.bindRotation(rotation, setRotation)
  const runtime = useNativePlayerRuntime(video, canvas)
  const preparedVideo = usePlayerLoadingSelector((state) =>
    state.step === 'ready' || state.step === 'reloading' ? state.video : null,
  )
  const title = preparedVideo?.name ?? ''
  const playlistActions = usePlaybackSessionObservers({
    runtime,
    ports,
    hash: preparedVideo?.hash,
    source: preparedVideo?.source,
  })
  const sessionReady = isPlayerSessionReady(runtime, video, preparedVideo, ports.subtitles)

  useEffect(() => () => ports.sourceLifecycle.dispose(), [ports])
  useEffect(() => ports.fullscreen.subscribe((snapshot) => setFullscreen(snapshot.active)), [ports])

  const previewFrame = useCallback(
    (time: number, signal: AbortSignal) => {
      if (!preparedVideo) return Promise.reject(new Error('媒体来源已关闭'))
      return mediaFrameQueue.request(
        'player-preview',
        { source: preparedVideo.source, time, rotation, maxWidth: 240, signal },
        1,
      )
    },
    [preparedVideo, rotation],
  )
  const toggleFullscreen = () => {
    if (rootRef.current) {
      captureFeatureUsed('fullscreen', fullscreen ? 'exit' : 'enter')
      void ports.fullscreen.toggle(rootRef.current)
    }
  }

  const exitFullscreen = () => {
    captureFeatureUsed('fullscreen', 'exit')
    void ports.fullscreen.exit()
  }

  const shell = (
    <PlayerShell rootRef={rootRef} title={title}>
      <PlayerPortalRoot>
        <PlayerWindowChrome onClose={() => getPlayerLoadingService().cancel()} />
        <VideoSurface videoRef={setVideo} rotation={rotation} />
        <canvas
          ref={setCanvas}
          hidden
          data-player-canvas
          data-telemetry-replay-block
          className="absolute top-1/2 left-1/2 z-0 bg-black object-contain"
          style={{
            width: rotation === 90 || rotation === 270 ? '100dvh' : '100dvw',
            height: rotation === 90 || rotation === 270 ? '100dvw' : '100dvh',
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
          aria-label="视频画面"
        />
        <SubtitleSurface />
        {sessionReady ? <NativeDanmakuSurface /> : <DanmakuSurface />}
        {/* 全屏手势仅绑定画面层，避免设置菜单、弹窗等 Portal 事件冒泡后误触发。 */}
        <InteractionSurface onDoubleClick={toggleFullscreen} />
        {sessionReady && (
          <>
            <PlayerControls
              capabilities={ports.capabilities}
              onPreview={previewFrame}
              playlist={playlistActions.playlist}
              onSelectPlaylist={playlistActions.onSelectPlaylist}
              onPrevious={playlistActions.onPrevious}
              onNext={playlistActions.onNext}
              rotation={rotation}
              fullscreen={fullscreen}
              onRotationChange={setRotation}
              onFullscreen={toggleFullscreen}
              onExitFullscreen={fullscreen ? exitFullscreen : undefined}
            />
            <PlayerCompatibilityNotice
              capabilities={ports.capabilities}
              onExit={() => getPlayerLoadingService().cancel()}
            />
          </>
        )}
      </PlayerPortalRoot>
    </PlayerShell>
  )

  if (!runtime || !video || !preparedVideo || !ports.subtitles) return shell

  return (
    <PlayerRuntimeProvider runtime={runtime}>
      <NativeDanmakuProvider fallbackState={fallbackState}>
        <NativeSubtitleProvider
          video={video}
          runtime={runtime}
          catalog={ports.subtitles}
          source={preparedVideo.source}
          hash={preparedVideo.hash}
          fallbackState={fallbackState}
        >
          {shell}
        </NativeSubtitleProvider>
      </NativeDanmakuProvider>
    </PlayerRuntimeProvider>
  )
}
