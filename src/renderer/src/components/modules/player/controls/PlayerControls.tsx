import type { PlayerCapabilities, PlaylistEntry } from '@renderer/services/player-runtime'
import type { PlayerRotation } from '../setting/PlayerSettingsPanel'
import { playerSettingsPanelAtom, showPlayerSettingsPanel } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { TooltipProvider } from '@renderer/components/ui/Tooltip'
import {
  resolvePlayerControlAvailability,
  useNativeDanmaku,
  usePlaybackClock,
  usePlaybackCommands,
  usePlaybackViewModel,
  usePlayerRuntime,
} from '@renderer/services/player-runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useAtomValue } from 'jotai'
import { useCallback, useMemo, useRef, useState } from 'react'
import { PlayerSettingsPanel } from '../setting/PlayerSettingsPanel'
import { FloatingController } from './FloatingController'
import { PlayerIconButton } from './PlayerIconButton'
import { TimelineScrubber } from './TimelineScrubber'
import { useControllerVisibility } from './useControllerVisibility'
import { usePlayerShortcuts } from './usePlayerShortcuts'
import { formatTime } from './utils'
import { VolumeSlider } from './VolumeSlider'

export interface PlayerControlsProps {
  capabilities: PlayerCapabilities
  playlist?: readonly PlaylistEntry[]
  onSelectPlaylist?: (entry: PlaylistEntry) => void
  onPreview?: (time: number, signal: AbortSignal) => Promise<string>
  onPrevious?: () => void
  onNext?: () => void
  onFullscreen?: () => void
  onExitFullscreen?: () => void
  fullscreen?: boolean
  rotation?: PlayerRotation
  onRotationChange?: (rotation: PlayerRotation) => void
}

export const PlayerControls = ({
  capabilities,
  playlist,
  onSelectPlaylist,
  onPreview,
  onPrevious,
  onNext,
  onFullscreen,
  onExitFullscreen,
  fullscreen = false,
  rotation = 0,
  onRotationChange,
}: PlayerControlsProps) => {
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const { setExclusionRect } = useNativeDanmaku()
  const state = usePlaybackViewModel()
  const commands = usePlaybackCommands()
  const clock = usePlaybackClock()
  const runtime = usePlayerRuntime()
  const readPlaybackInfo = useCallback(() => runtime.playbackInfo, [runtime])
  const initialSnapshot = clock.snapshot()
  const availability = resolvePlayerControlAvailability(capabilities)
  const [volume, setVolume] = useState(initialSnapshot.volume)
  const [muted, setMuted] = useState(initialSnapshot.muted)
  const [dragging, setDragging] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const settingsPanelOpen = useAtomValue(playerSettingsPanelAtom).open
  const { enableMiniProgress } = usePlayerSettingsValue()

  const playing = state.status === 'playing'
  const currentTime = getCurrentTime(state)
  const duration = 'duration' in state ? state.duration : initialSnapshot.duration
  const rate = 'rate' in state ? state.rate : initialSnapshot.rate
  const controllerLocked = dragging || seeking || focused || hovered || settingsPanelOpen
  const { visible, markActivity } = useControllerVisibility({
    playing,
    locked: controllerLocked,
  })

  const reportDesktopControllerRect = useCallback(
    (rect: DOMRect | null) => {
      setExclusionRect(rect)
    },
    [setExclusionRect],
  )

  const seekBy = useCallback(
    (offset: number) => commands.seek(clock.now() + offset),
    [clock, commands],
  )
  const toggleMuted = useCallback(() => {
    setMuted((currentMuted) => {
      const next = !currentMuted
      commands.setMuted(next)
      return next
    })
  }, [commands])

  const changeVolume = useCallback(
    (offset: number) => {
      setVolume((currentVolume) => {
        const next = Math.min(1, Math.max(0, currentVolume + offset))
        commands.setMuted(false)
        commands.setVolume(next)
        return next
      })
      setMuted(false)
    },
    [commands],
  )

  const shortcutActions = useMemo(
    () => ({
      togglePlayback: () => (playing ? commands.pause() : void commands.play()),
      seekBy,
      changeVolume,
      toggleMuted,
      toggleFullscreen: onFullscreen,
      exitFullscreen: onExitFullscreen,
    }),
    [changeVolume, commands, onExitFullscreen, onFullscreen, playing, seekBy, toggleMuted],
  )

  usePlayerShortcuts({
    rootRef: controlsRef,
    blocked: settingsPanelOpen,
    actions: shortcutActions,
  })

  return (
    <TooltipProvider delayDuration={350}>
      <div
        ref={controlsRef}
        data-player-controls
        className="pointer-events-none absolute inset-0 z-40"
        onPointerDownCapture={() => setFocused(false)}
        onFocusCapture={(event) => {
          // 鼠标点击留下的焦点不能永久锁住控制器；键盘导航才保持可见。
          setFocused(event.target.matches(':focus-visible'))
          markActivity()
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        <FloatingController
          visible={visible}
          onDraggingChange={setDragging}
          onHoverChange={setHovered}
          onRectChange={reportDesktopControllerRect}
          left={
            <>
              <PlayerIconButton
                label={muted ? '取消静音' : '静音'}
                icon={
                  muted || volume === 0
                    ? 'icon-[mingcute--volume-mute-line]'
                    : 'icon-[mingcute--volume-line]'
                }
                active={muted}
                compact
                onClick={toggleMuted}
              />
              <VolumeSlider
                value={muted ? 0 : volume}
                onDraggingChange={setDragging}
                onValueChange={(next) => {
                  setVolume(next)
                  setMuted(false)
                  commands.setMuted(false)
                  commands.setVolume(next)
                }}
              />
            </>
          }
          transport={
            <>
              {availability.transport === 'playlist' && (
                <PlayerIconButton
                  label="上一集"
                  icon="icon-[mingcute--skip-previous-line]"
                  disabled={!onPrevious}
                  compact
                  onClick={onPrevious}
                />
              )}
              <PlayerIconButton
                label="后退 5 秒"
                icon="icon-[mingcute--rewind-backward-5-line]"
                compact
                onClick={() => seekBy(-5)}
              />
              <PlayerIconButton
                label={playing ? '暂停' : '播放'}
                icon={playing ? 'icon-[mingcute--pause-fill]' : 'icon-[mingcute--play-fill]'}
                className="size-11 bg-transparent text-white hover:bg-white/10 [&>i]:text-[1.9rem]"
                onClick={() => (playing ? commands.pause() : void commands.play())}
              />
              <PlayerIconButton
                label="前进 5 秒"
                icon="icon-[mingcute--rewind-forward-5-line]"
                compact
                onClick={() => seekBy(5)}
              />
              {availability.transport === 'playlist' && (
                <PlayerIconButton
                  label="下一集"
                  icon="icon-[mingcute--skip-forward-line]"
                  disabled={!onNext}
                  compact
                  onClick={onNext}
                />
              )}
            </>
          }
          tools={
            <>
              <PlayerIconButton
                label="设置"
                icon="icon-[mingcute--settings-3-line]"
                compact
                onClick={() => showPlayerSettingsPanel('playback')}
              />
              {availability.fullscreen && (
                <PlayerIconButton
                  label={fullscreen ? '退出全屏' : '全屏'}
                  icon={
                    fullscreen
                      ? 'icon-[mingcute--fullscreen-exit-line]'
                      : 'icon-[mingcute--fullscreen-line]'
                  }
                  active={fullscreen}
                  disabled={!onFullscreen}
                  compact
                  onClick={onFullscreen}
                />
              )}
            </>
          }
          timeline={
            <>
              <time className="w-12 text-right text-xs text-[var(--player-fg-muted)] tabular-nums">
                {formatTime(currentTime)}
              </time>
              <TimelineScrubber
                onPreview={state.status === 'seeking' ? undefined : onPreview}
                currentTime={currentTime}
                duration={duration}
                buffered={clock.snapshot().buffered}
                onSeek={commands.seek}
                onSeekingChange={setSeeking}
              />
              <time className="w-12 text-xs text-[var(--player-fg-muted)] tabular-nums">
                {formatTime(duration)}
              </time>
            </>
          }
        />
        <PlayerSettingsPanel
          capabilities={capabilities}
          playlist={playlist}
          onSelectPlaylist={onSelectPlaylist}
          playbackInfo={runtime.playbackInfo}
          readPlaybackInfo={readPlaybackInfo}
          rate={rate}
          rotation={rotation}
          onRateChange={(nextRate) => {
            captureFeatureUsed('playback_rate', 'change', nextRate)
            commands.setRate(nextRate)
          }}
          onRotationChange={onRotationChange ?? (() => {})}
        />
        {enableMiniProgress && playing && !visible && duration > 0 && (
          <div
            data-player-mini-progress
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20"
          >
            <span
              className="block h-full bg-[var(--player-progress)]"
              style={{ width: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

const getCurrentTime = (state: ReturnType<typeof usePlaybackViewModel>): number => {
  if ('currentTime' in state) return state.currentTime
  if (state.status === 'seeking') return state.targetTime
  if (state.status === 'ended') return state.duration
  return 0
}
