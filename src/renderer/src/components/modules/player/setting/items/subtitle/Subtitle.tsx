import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { useNativeSubtitles, usePlayerPortalContainer } from '@renderer/services/player-runtime'

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
  const portalContainer = usePlayerPortalContainer()

  return (
    <SettingContainer>
      <FieldLayout title="字幕轨道">
        <Select
          value={selectedId}
          disabled={loading}
          onValueChange={(value) => void selectTrack(value)}
        >
          <SelectTrigger
            aria-label="字幕轨道"
            className="w-56 border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0"
          >
            <SelectValue placeholder="选择字幕轨道" />
          </SelectTrigger>
          <SelectContent
            container={portalContainer}
            className="border-white/11 bg-[rgb(38_38_44/96%)] text-white"
          >
            <SelectGroup>
              <SelectItem value="off" className="focus:bg-white/14 focus:text-white">
                关闭字幕
              </SelectItem>
              {tracks.map((track) => (
                <SelectItem
                  key={track.id}
                  value={track.id}
                  className="focus:bg-white/14 focus:text-white"
                >
                  {track.title}
                  {track.language ? ` · ${track.language}` : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </FieldLayout>

      <Button
        type="button"
        variant="outline"
        disabled={loading}
        className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
        onClick={() => void importTrack()}
      >
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
          className="w-full accent-[var(--player-settings-accent)]"
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
