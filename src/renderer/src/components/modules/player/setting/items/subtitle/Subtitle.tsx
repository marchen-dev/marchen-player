import { usePlayerSettings } from '@renderer/atoms/settings/player'
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

import { PanelSection } from '../../panel-layout'
import { SliderField } from '../../SliderField'

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
    // 与弹幕页一致：分组标题 + 上下排。轨道名常带字幕组与语言（如「chs&jpn[字幕组] · zh-Hans」），
    // 放在右侧半宽下拉框里总会被截断，所以下拉框占满整行
    <div className="space-y-7">
      <PanelSection title={t('subtitle.track')}>
        {!embeddedSupported && (
          <p className="text-sm text-[var(--player-settings-muted)]">
            {t('subtitle.remoteNoEmbedded')}
          </p>
        )}
        <Select value={pendingId ?? selectedId} onValueChange={(value) => void selectTrack(value)}>
          <SelectTrigger
            aria-label={t('subtitle.track')}
            className="w-full border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0"
          >
            <SelectValue placeholder={t('subtitle.trackPlaceholder')} />
          </SelectTrigger>
          <SelectContent
            container={portalContainer}
            className="bg-player-popover player-glass border-white/11 text-white"
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

        <Button
          type="button"
          variant="outline"
          className="w-full border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
          onClick={() => void importTrack()}
        >
          {t('subtitle.import')}
        </Button>

        {loading && (embeddedSupported || loadingOperation !== 'catalog') && (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-sm text-[var(--player-settings-muted)]">
              {loadingOperation === 'catalog'
                ? t('subtitle.loadingCatalog')
                : t('subtitle.loading')}
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
      </PanelSection>

      <PanelSection title={t('subtitle.adjust')}>
        <div className="space-y-5">
          <SliderField
            title={t('subtitle.scaleLabel')}
            value={settings.subtitleScale}
            defaultValue={100}
            min={50}
            max={200}
            step={5}
            disabled={bitmapSelected}
            formatValue={(value) => `${value}%`}
            onValueChange={(subtitleScale) =>
              setSettings((previous) => ({ ...previous, subtitleScale }))
            }
            description={
              bitmapSelected && (
                <p className="mt-0.5 text-xs text-[var(--player-settings-muted)]">
                  {t('subtitle.bitmapNoScale')}
                </p>
              )
            }
          />
          <SliderField
            title={t('subtitle.offsetLabel')}
            value={timeOffset}
            defaultValue={0}
            min={-9}
            max={9}
            step={0.5}
            formatValue={(value) =>
              t('subtitle.offsetValue', { offset: `${value > 0 ? '+' : ''}${value.toFixed(1)}` })
            }
            onValueChange={(value) => void setTimeOffset(value)}
          />
        </div>
      </PanelSection>
    </div>
  )
}
