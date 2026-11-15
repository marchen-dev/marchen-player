import { usePlayerSettings } from '@renderer/atoms/settings/player'
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
import { useTranslation } from 'react-i18next'

import { SettingContainer } from '../../Container'

export const Subtitle = () => {
  const { t } = useTranslation('player')
  const [settings, setSettings] = usePlayerSettings()
  const {
    tracks,
    embeddedSupported,
    loadingOperation,
    selectedId,
    timeOffset,
    loading,
    pendingId,
    cancelLoading,
    error,
    selectTrack,
    importTrack,
    setTimeOffset,
  } = useNativeSubtitles()
  const portalContainer = usePlayerPortalContainer()
  // 图片字幕（PGS）是位图，不支持调整大小；全局偏好保持不变，切回文本字幕后照常生效
  const bitmapSelected = tracks.find((track) => track.id === selectedId)?.kind === 'bitmap'

  return (
    <SettingContainer>
      {!embeddedSupported && (
        <p className="text-sm text-white/60">{t('subtitle.remoteNoEmbedded')}</p>
      )}
      <FieldLayout title={t('subtitle.track')}>
        <Select value={pendingId ?? selectedId} onValueChange={(value) => void selectTrack(value)}>
          <SelectTrigger
            aria-label={t('subtitle.track')}
            className="w-56 border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0"
          >
            <SelectValue placeholder={t('subtitle.trackPlaceholder')} />
          </SelectTrigger>
          <SelectContent
            container={portalContainer}
            className="border-white/11 bg-player-popover player-glass text-white"
          >
            <SelectGroup>
              <SelectItem value="off" className="focus:bg-white/14 focus:text-white">
                {t('subtitle.off')}
              </SelectItem>
              {tracks.map((track) => (
                <SelectItem
                  key={track.id}
                  value={track.id}
                  disabled={track.supported === false}
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

      <FieldLayout title={t('subtitle.scale', { percent: settings.subtitleScale })}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={settings.subtitleScale}
            disabled={bitmapSelected}
            aria-label={t('subtitle.scaleLabel')}
            aria-valuetext={`${settings.subtitleScale}%`}
            aria-describedby={bitmapSelected ? 'subtitle-scale-bitmap-hint' : undefined}
            className="min-w-0 flex-1 accent-[var(--player-settings-accent)] disabled:opacity-40"
            onChange={(event) => {
              const subtitleScale = event.currentTarget.valueAsNumber
              setSettings((previous) => ({ ...previous, subtitleScale }))
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={bitmapSelected || settings.subtitleScale === 100}
            className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
            onClick={() => setSettings((previous) => ({ ...previous, subtitleScale: 100 }))}
          >
            {t('subtitle.reset')}
          </Button>
        </div>
      </FieldLayout>
      {bitmapSelected && (
        <p id="subtitle-scale-bitmap-hint" className="-mt-2 text-sm text-white/60">
          {t('subtitle.bitmapNoScale')}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
        onClick={() => void importTrack()}
      >
        {t('subtitle.import')}
      </Button>

      <FieldLayout
        // 右侧是占满剩余宽度的滑块，标题本来就换行显示；不加间距，保持滑块原来的宽度
        className="gap-0"
        title={t('subtitle.offset', {
          offset: `${timeOffset > 0 ? '+' : ''}${timeOffset.toFixed(1)}`,
        })}
      >
        <input
          type="range"
          min={-9}
          max={9}
          step={0.5}
          value={timeOffset}
          aria-label={t('subtitle.offsetLabel')}
          className="w-full accent-[var(--player-settings-accent)]"
          onChange={(event) => void setTimeOffset(event.currentTarget.valueAsNumber)}
        />
      </FieldLayout>

      {loading && (embeddedSupported || loadingOperation !== 'catalog') && (
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-sm text-white/60">
            {loadingOperation === 'catalog' ? t('subtitle.loadingCatalog') : t('subtitle.loading')}
          </p>
          <Button type="button" variant="ghost" onClick={cancelLoading}>
            {t('subtitle.cancelLoading')}
          </Button>
        </div>
      )}

      {error && (
        <p role="status" className="text-sm text-red-400">
          {t('subtitle.errorSuffix', { error })}
        </p>
      )}
    </SettingContainer>
  )
}
