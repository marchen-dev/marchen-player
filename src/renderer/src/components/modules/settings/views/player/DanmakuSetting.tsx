import type { FC, PropsWithChildren } from 'react'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { cn } from '@renderer/lib/utils'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useTranslation } from 'react-i18next'

import { FieldLayout, FieldsCardLayout } from '../Layout'
import { DanmakuTranslationRow } from './DanmakuTranslationRow'
import {
  danmakuDensityList,
  danmakuDurationList,
  danmakuEndAreaList,
  danmakuFontSizeList,
  danmakuOpacityList,
} from './list'

interface DanmakuSettingProps extends PropsWithChildren {
  classNames?: { cardLayout?: string }
}

export const DanmakuSetting: FC<DanmakuSettingProps> = (props) => {
  const { classNames, children } = props
  const [playerSetting, setPlayerSetting] = usePlayerSettings()
  const isPlaying = !!classNames?.cardLayout
  const portalContainer = usePlayerPortalContainer()
  const { t } = useTranslation('danmaku')
  // 弹幕翻译选了目标语言时「繁体转简体」不适用：有译文的弹幕显示译文。
  // 开关置灰但保留原来的值，没有译文的弹幕仍按它决定是否转简体
  const translationOn = playerSetting.danmakuTranslation.enabled

  const content = (
    <>
      {isPlaying && (
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
      )}
      {/* 客户端转换，切换即时作用于当前弹幕，无需重新请求 */}
      <FieldLayout
        title={
          translationOn ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              {t('settings.traditionalToSimplified')}
              <span
                id="danmaku-t2s-disabled-hint"
                className={cn(
                  'text-xs font-normal',
                  isPlaying ? 'text-[var(--player-fg-muted)]' : 'text-muted-foreground',
                )}
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
          playerMaterial={isPlaying}
          disabled={translationOn}
          aria-describedby={translationOn ? 'danmaku-t2s-disabled-hint' : undefined}
          value={playerSetting.enableTraditionalToSimplified}
          onCheckedChange={(value) => {
            captureFeatureUsed('danmaku_traditional_to_simplified', value ? 'enable' : 'disable')
            setPlayerSetting((prev) => ({ ...prev, enableTraditionalToSimplified: value }))
          }}
        />
      </FieldLayout>
      {/* 本机翻译，只换显示文本；状态与下载进度在这一行内呈现 */}
      <DanmakuTranslationRow
        playerMaterial={isPlaying}
        portalContainer={isPlaying ? portalContainer : undefined}
      />
      <FieldLayout title={t('settings.fontSize')}>
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          placeholder={t('settings.fontSizePlaceholder')}
          groups={danmakuFontSizeList}
          value={playerSetting.danmakuFontSize}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuFontSize: value }))
          }
        />
      </FieldLayout>
      <FieldLayout title={t('settings.opacity')}>
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          ariaLabel={t('settings.opacityPlaceholder')}
          placeholder={t('settings.opacityPlaceholder')}
          groups={danmakuOpacityList}
          value={String(playerSetting.danmakuOpacity)}
          onValueChange={(value) =>
            setPlayerSetting((previous) => ({ ...previous, danmakuOpacity: Number(value) }))
          }
        />
      </FieldLayout>
      <FieldLayout title={t('settings.duration')}>
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          placeholder={t('settings.durationPlaceholder')}
          groups={danmakuDurationList.map((item) => ({
            ...item,
            label: t(`settings.durationOptions.${item.id}`),
          }))}
          value={playerSetting.danmakuDuration}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuDuration: value }))
          }
        />
      </FieldLayout>
      <FieldLayout title={t('settings.area')}>
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          placeholder={t('settings.areaPlaceholder')}
          groups={danmakuEndAreaList}
          value={playerSetting.danmakuEndArea}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuEndArea: value }))
          }
        />
      </FieldLayout>
      {isPlaying && (
        <FieldLayout title={t('settings.density')}>
          <SettingSelect
            container={portalContainer}
            playerMaterial
            placeholder={t('settings.densityPlaceholder')}
            groups={danmakuDensityList.map((item) => ({
              ...item,
              label: t(`settings.densityOptions.${item.id}`),
            }))}
            value={playerSetting.danmakuMaxOnScreen}
            onValueChange={(value) =>
              setPlayerSetting((previous) => ({ ...previous, danmakuMaxOnScreen: value }))
            }
          />
        </FieldLayout>
      )}
      {children}
    </>
  )

  return isPlaying ? (
    <div className={classNames?.cardLayout}>{content}</div>
  ) : (
    <FieldsCardLayout title={t('settings.cardTitle')}>{content}</FieldsCardLayout>
  )
}
