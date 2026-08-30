import type { FC, PropsWithChildren } from 'react'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'

import { FieldLayout, FieldsCardLayout } from '../Layout'
import {
  danmakuDensityList,
  danmakuDurationList,
  danmakuEndAreaList,
  danmakuFontSizeList,
} from './list'

interface DanmakuSettingProps extends PropsWithChildren {
  classNames?: { cardLayout?: string }
  onTraditionalToSimplifiedChange?: (value: boolean) => void
}

export const DanmakuSetting: FC<DanmakuSettingProps> = (props) => {
  const { classNames, children, onTraditionalToSimplifiedChange } = props
  const [playerSetting, setPlayerSetting] = usePlayerSettings()
  const isPlaying = !!classNames?.cardLayout
  const portalContainer = usePlayerPortalContainer()

  const content = (
    <>
      {isPlaying && (
        <FieldLayout title="显示弹幕">
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
      {!isPlaying && (
        <FieldLayout title="繁体转简体">
          <SettingSwitch
            value={playerSetting.enableTraditionalToSimplified}
            onCheckedChange={(value) => {
              setPlayerSetting((prev) => ({ ...prev, enableTraditionalToSimplified: value }))
              onTraditionalToSimplifiedChange?.(value)
            }}
          />
        </FieldLayout>
      )}
      <FieldLayout title="字体大小">
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          placeholder="弹幕字体大小"
          groups={danmakuFontSizeList}
          value={playerSetting.danmakuFontSize}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuFontSize: value }))
          }
        />
      </FieldLayout>
      <FieldLayout title="持续时间">
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          placeholder="弹幕持续时间"
          groups={danmakuDurationList}
          value={playerSetting.danmakuDuration}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuDuration: value }))
          }
        />
      </FieldLayout>
      <FieldLayout title="显示区域">
        <SettingSelect
          container={isPlaying ? portalContainer : undefined}
          playerMaterial={isPlaying}
          placeholder="弹幕显示区域"
          groups={danmakuEndAreaList}
          value={playerSetting.danmakuEndArea}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuEndArea: value }))
          }
        />
      </FieldLayout>
      {isPlaying && (
        <>
          <FieldLayout title="悬停暂停弹幕">
            <SettingSwitch
              playerMaterial
              value={playerSetting.enableDanmakuHoverPause}
              onCheckedChange={(value) =>
                setPlayerSetting((previous) => ({
                  ...previous,
                  enableDanmakuHoverPause: value,
                }))
              }
            />
          </FieldLayout>
          <FieldLayout title="在屏密度">
            <SettingSelect
              container={portalContainer}
              playerMaterial
              placeholder="弹幕密度"
              groups={danmakuDensityList}
              value={playerSetting.danmakuMaxOnScreen}
              onValueChange={(value) =>
                setPlayerSetting((previous) => ({ ...previous, danmakuMaxOnScreen: value }))
              }
            />
          </FieldLayout>
        </>
      )}
      {children}
    </>
  )

  return isPlaying ? (
    <div className={classNames?.cardLayout}>{content}</div>
  ) : (
    <FieldsCardLayout title="弹幕">{content}</FieldsCardLayout>
  )
}
