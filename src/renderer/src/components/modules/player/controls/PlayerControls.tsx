import type { PlayerCapabilities } from '@renderer/services/player-runtime'
import type { PlayerRotation } from './PlayerInspector'
import { playerSettingSheetAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { TooltipProvider } from '@renderer/components/ui/Tooltip'
import {
  resolvePlayerControlAvailability,
  useNativeDanmaku,
  usePlaybackClock,
  usePlaybackCommands,
  usePlaybackViewModel,
} from '@renderer/services/player-runtime'
import { useAtomValue } from 'jotai'
import { useCallback, useMemo, useRef, useState } from 'react'
import { FloatingController } from './FloatingController'
import { PlayerIconButton } from './PlayerIconButton'
import { PlayerInspector } from './PlayerInspector'
import { TimelineScrubber } from './TimelineScrubber'
import { useControllerVisibility } from './useControllerVisibility'
import { usePlayerShortcuts } from './usePlayerShortcuts'
import { formatTime } from './utils'
import { VolumeSlider } from './VolumeSlider'

export interface PlayerControlsProps {
  capabilities: PlayerCapabilities
  onPrevious?: () => void
  onNext?: () => void
  onDanmaku?: () => void
  onSubtitle?: () => void
  onPlaylist?: () => void
  onExit?: () => void
  onFullscreen?: () => void
  onExitFullscreen?: () => void
  fullscreen?: boolean
  rotation?: PlayerRotation
  onRotationChange?: (rotation: PlayerRotation) => void
}

export const PlayerControls = ({
  capabilities,
  onPrevious,
  onNext,
  onDanmaku,
  onSubtitle,
  onPlaylist,
  onExit,
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
  const initialSnapshot = clock.snapshot()
  const availability = resolvePlayerControlAvailability(capabilities)
  const [volume, setVolume] = useState(initialSnapshot.volume)
  const [muted, setMuted] = useState(initialSnapshot.muted)
  const [dragging, setDragging] = useState(false)
  const [seeking, setSeeking] = useState(false)
  const [focused, setFocused] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const settingSheetOpen = useAtomValue(playerSettingSheetAtom)
  const { enableMiniProgress } = usePlayerSettingsValue()

  const playing = state.status === 'playing'
  const currentTime = getCurrentTime(state)
  const duration = 'duration' in state ? state.duration : initialSnapshot.duration
  const rate = 'rate' in state ? state.rate : initialSnapshot.rate
  const controllerLocked = dragging || seeking || focused || inspectorOpen || settingSheetOpen
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
    blocked: settingSheetOpen || inspectorOpen,
    actions: shortcutActions,
  })

  return (
    <TooltipProvider delayDuration={350}>
      <div
        ref={controlsRef}
        data-player-controls
        className="pointer-events-none absolute inset-0 z-40"
        onFocusCapture={() => {
          setFocused(true)
          markActivity()
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        <FloatingController
          visible={visible}
          onDraggingChange={setDragging}
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
                onClick={() => setInspectorOpen(true)}
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
        <PlayerInspector
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          capabilities={capabilities}
          rate={rate}
          rotation={rotation}
          onRateChange={commands.setRate}
          onRotationChange={onRotationChange ?? (() => {})}
          onDanmaku={onDanmaku}
          onSubtitle={onSubtitle}
          onPlaylist={onPlaylist}
          onExit={onExit}
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
