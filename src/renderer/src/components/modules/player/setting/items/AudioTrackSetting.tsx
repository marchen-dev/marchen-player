import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { describeError } from '@renderer/lib/errors'
import {
  usePlaybackViewModel,
  usePlayerPortalContainer,
  usePlayerRuntime,
} from '@renderer/services/player-runtime'
import { parseDefaultAudioTrackNumber } from '@renderer/services/player-runtime/audio-track-label'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export const AudioTrackSetting = () => {
  const { t } = useTranslation('player')
  // 没有名称的音轨内部用固定的默认名称（见 audio-track-label.ts），显示时换成当前语言的写法
  const displayAudioTrackLabel = (label: string) => {
    const number = parseDefaultAudioTrackNumber(label)
    return number === null ? label : t('audio.track', { number })
  }
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
        setError(describeError(cause, t('audio.switchFailed')))
    } finally {
      if (request === requestRef.current) setPending(undefined)
    }
  }
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span>{t('audio.title')}</span>
        <SettingSelect
          playerMaterial
          container={portal}
          groups={tracks.map((track) => ({
            value: String(track.id),
            label: `${displayAudioTrackLabel(track.label)} · ${track.language}`,
          }))}
          value={String(pending ?? selectedId ?? '')}
          onValueChange={(value) => void select(value)}
        />
      </div>
      {runtime.presentation?.audioOutputChannels === 2 && (
        <p className="text-xs text-[var(--player-settings-muted)]">{t('audio.stereo')}</p>
      )}
      {error && <p className="text-xs text-amber-300">{error}</p>}
    </div>
  )
}
