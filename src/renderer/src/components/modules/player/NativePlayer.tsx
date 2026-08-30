import type { PlayerRotation } from './setting/PlayerSettingsPanel'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import {
  createPlayerPorts,
  isPlayerSessionReady,
  NativeDanmakuProvider,
  NativeDanmakuSurface,
  NativeSubtitleProvider,
  PlayerPortalRoot,
  PlayerRuntimeProvider,
  useNativePlayerRuntime,
  usePlaybackSessionObservers,
} from '@renderer/services/player-runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useEffect, useMemo, useRef, useState } from 'react'
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

/** 新原生播放链的最小宿主，后续在各 surface 上逐步接入字幕、弹幕和 controls。 */
export const NativePlayer = () => {
  const rootRef = useRef<HTMLElement | null>(null)
  const ports = useMemo(() => createPlayerPorts(), [])
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [rotation, setRotation] = useState<PlayerRotation>(0)
  const [fullscreen, setFullscreen] = useState(ports.fullscreen.getSnapshot().active)
  const runtime = useNativePlayerRuntime(video, ports.sourceLifecycle)
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
        <SubtitleSurface />
        {sessionReady ? <NativeDanmakuSurface /> : <DanmakuSurface />}
        <InteractionSurface />
        {sessionReady && (
          <>
            <PlayerControls
              capabilities={ports.capabilities}
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
      <NativeDanmakuProvider>
        <NativeSubtitleProvider
          video={video}
          runtime={runtime}
          catalog={ports.subtitles}
          source={preparedVideo.source}
          hash={preparedVideo.hash}
        >
          {shell}
        </NativeSubtitleProvider>
      </NativeDanmakuProvider>
    </PlayerRuntimeProvider>
  )
}
