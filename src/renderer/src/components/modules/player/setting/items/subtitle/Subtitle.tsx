import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Button } from '@renderer/components/ui/button'
import { useNativeSubtitles } from '@renderer/services/player-runtime'

import { SettingContainer } from '../../Container'

export const Subtitle = () => {
  const {
    tracks,
    selectedId,
    timeOffset,
    loading,
    error,
    selectTrack,
    importTrack,
    setTimeOffset,
  } = useNativeSubtitles()

  return (
    <SettingContainer>
      <FieldLayout title="字幕轨道">
        <select
          value={selectedId}
          disabled={loading}
          aria-label="字幕轨道"
          className="border-input bg-background focus-visible:ring-ring min-h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          onChange={(event) => void selectTrack(event.currentTarget.value)}
        >
          <option value="off">关闭字幕</option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.title}
              {track.language ? ` · ${track.language}` : ''}
            </option>
          ))}
        </select>
      </FieldLayout>

      <Button type="button" variant="outline" disabled={loading} onClick={() => void importTrack()}>
        导入外挂字幕…
      </Button>

      <FieldLayout title={`时间偏移 ${timeOffset > 0 ? '+' : ''}${timeOffset.toFixed(1)} 秒`}>
        <input
          type="range"
          min={-9}
          max={9}
          step={0.5}
          value={timeOffset}
          aria-label="字幕时间偏移"
          className="w-full accent-current"
          onChange={(event) => void setTimeOffset(event.currentTarget.valueAsNumber)}
        />
      </FieldLayout>

      {error && (
        <p role="status" className="text-sm text-red-400">
          {error}，视频将继续无字幕播放。
        </p>
      )}
    </SettingContainer>
  )
}
