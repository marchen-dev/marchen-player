import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import {
  usePlaybackViewModel,
  usePlayerPortalContainer,
  usePlayerRuntime,
} from '@renderer/services/player-runtime'
import { useRef, useState } from 'react'

export const AudioTrackSetting = () => {
  const runtime = usePlayerRuntime()
  usePlaybackViewModel()
  const portal = usePlayerPortalContainer()
  const requestRef = useRef(0)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<number>()
  const { tracks, selectedId } = runtime.audioTracks
  if (!tracks.length) return null
  const select = async (value: string) => {
    const request = ++requestRef.current
    const id = Number(value)
    setPending(id)
    setError(undefined)
    try {
      await runtime.selectAudioTrack(id)
    } catch (cause) {
      if (
        request === requestRef.current &&
        !(cause instanceof DOMException && cause.name === 'AbortError')
      )
        setError(cause instanceof Error ? cause.message : '音轨切换失败')
    } finally {
      if (request === requestRef.current) setPending(undefined)
    }
  }
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span>音轨</span>
        <SettingSelect
          playerMaterial
          container={portal}
          groups={tracks.map((track) => ({
            value: String(track.id),
            label: `${track.label} · ${track.language}`,
          }))}
          value={String(pending ?? selectedId ?? '')}
          onValueChange={(value) => void select(value)}
        />
      </div>
      {runtime.presentation?.audioOutputChannels === 2 && (
        <p className="text-xs text-[var(--player-settings-muted)]">当前输出：立体声</p>
      )}
      {error && <p className="text-xs text-amber-300">{error}</p>}
    </div>
  )
}
