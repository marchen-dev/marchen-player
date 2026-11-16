import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import {
  DANMAKU_FONT_SCALE,
  danmakuDisplayAreas,
  danmakuSpeedIndexOf,
  danmakuSpeedLevels,
  DEFAULT_DANMAKU_SPEED_INDEX,
} from '@renderer/services/player-runtime/danmaku/appearance'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useTranslation } from 'react-i18next'

import { PanelCard, PanelRow, PanelSection } from '../../panel-layout'
import { SegmentedControl } from '../../SegmentedControl'
import { SliderField } from '../../SliderField'
import { DanmakuTranslationRow } from './DanmakuTranslationRow'

/** 「显示」组：开关类设置，左标题右控件 */
export const DanmakuDisplaySettings = () => {
  const [playerSetting, setPlayerSetting] = usePlayerSettings()
  const portalContainer = usePlayerPortalContainer()
  const { t } = useTranslation('danmaku')
  // 弹幕翻译选了目标语言时「繁体转简体」不适用：有译文的弹幕显示译文。
  // 开关置灰但保留原来的值，没有译文的弹幕仍按它决定是否转简体
  const translationOn = playerSetting.danmakuTranslation.enabled

  return (
    <PanelSection title={t('settings.groups.display')}>
      <PanelCard>
        <PanelRow>
          <FieldLayout title={t('settings.show')}>
            <SettingSwitch
              playerMaterial
              value={playerSetting.enableDanmaku}
              onCheckedChange={(value) => {
                captureFeatureUsed('danmaku', value ? 'enable' : 'disable')
                setPlayerSetting((previous) => ({ ...previous, enableDanmaku: value }))
              }}
            />
          </FieldLayout>
        </PanelRow>
        {/* 客户端转换，切换即时作用于当前弹幕，无需重新请求 */}
        <PanelRow>
          <FieldLayout
            title={
              translationOn ? (
                <span className="flex min-w-0 flex-col gap-0.5">
                  {t('settings.traditionalToSimplified')}
                  <span
                    id="danmaku-t2s-disabled-hint"
                    className="text-xs font-normal text-[var(--player-fg-muted)]"
                  >
                    {t('settings.traditionalToSimplifiedDisabled')}
                  </span>
                </span>
              ) : (
                t('settings.traditionalToSimplified')
              )
            }
          >
            <SettingSwitch
              playerMaterial
              disabled={translationOn}
              aria-describedby={translationOn ? 'danmaku-t2s-disabled-hint' : undefined}
              value={playerSetting.enableTraditionalToSimplified}
              onCheckedChange={(value) => {
                captureFeatureUsed(
                  'danmaku_traditional_to_simplified',
                  value ? 'enable' : 'disable',
                )
                setPlayerSetting((prev) => ({ ...prev, enableTraditionalToSimplified: value }))
              }}
            />
          </FieldLayout>
        </PanelRow>
        {/* 本机翻译，只换显示文本；状态与下载进度在这一行内呈现 */}
        <PanelRow>
          <DanmakuTranslationRow playerMaterial portalContainer={portalContainer} />
        </PanelRow>
      </PanelCard>
    </PanelSection>
  )
}

/**
 * 「外观」组：滑块与分段按钮，标题与当前值一行、控件占满下方整行。
 * 这些设置变化都不清屏（字号、速度、区域连续更新，见 requiresDanmakuLayoutReset）。
 */
export const DanmakuAppearanceSettings = () => {
  const [playerSetting, setPlayerSetting] = usePlayerSettings()
  const { t } = useTranslation('danmaku')
  const speedName = (index: number) =>
    t(`settings.speedOptions.${danmakuSpeedLevels[index]?.id ?? 'normal'}`)

  return (
    <PanelSection title={t('settings.groups.appearance')}>
      <div className="space-y-5">
        <SliderField
          title={t('settings.fontSize')}
          value={playerSetting.danmakuFontScale}
          defaultValue={DANMAKU_FONT_SCALE.default}
          min={DANMAKU_FONT_SCALE.min}
          max={DANMAKU_FONT_SCALE.max}
          step={DANMAKU_FONT_SCALE.step}
          formatValue={(value) => `${value}%`}
          onValueChange={(danmakuFontScale) =>
            setPlayerSetting((previous) => ({ ...previous, danmakuFontScale }))
          }
        />
        <SliderField
          title={t('settings.opacity')}
          value={playerSetting.danmakuOpacity}
          defaultValue={100}
          min={10}
          max={100}
          step={5}
          formatValue={(value) => `${value}%`}
          onValueChange={(danmakuOpacity) =>
            setPlayerSetting((previous) => ({ ...previous, danmakuOpacity }))
          }
        />
        {/* 存的是滚过屏幕的毫秒数；滑块按档位下标调节，从左到右越来越快 */}
        <SliderField
          title={t('settings.speed')}
          value={danmakuSpeedIndexOf(playerSetting.danmakuDuration)}
          defaultValue={DEFAULT_DANMAKU_SPEED_INDEX}
          min={0}
          max={danmakuSpeedLevels.length - 1}
          step={1}
          formatValue={speedName}
          onValueChange={(index) => {
            const level = danmakuSpeedLevels[index]
            if (!level) return
            setPlayerSetting((previous) => ({ ...previous, danmakuDuration: level.value }))
          }}
        />
        <div className="space-y-2">
          <div className="text-sm">{t('settings.area')}</div>
          <SegmentedControl
            label={t('settings.area')}
            className="grid-cols-5"
            value={playerSetting.danmakuEndArea}
            options={danmakuDisplayAreas.map((value) => ({
              value,
              label: `${Math.round(Number(value) * 100)}%`,
            }))}
            onValueChange={(danmakuEndArea) =>
              setPlayerSetting((previous) => ({ ...previous, danmakuEndArea }))
            }
          />
        </div>
      </div>
    </PanelSection>
  )
}
