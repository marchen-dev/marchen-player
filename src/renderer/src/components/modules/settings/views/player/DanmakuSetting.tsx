import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import type { FC, PropsWithChildren } from 'react'
import { useMemo } from 'react'

import { FieldLayout, FieldsCardLayout } from '../Layout'
import { danmakuDurationList, danmakuEndAreaList, danmakuFontSizeList } from './list'

interface DanmakuSettingProps extends PropsWithChildren {
  classNames?: { cardLayout?: string }
  onTraditionalToSimplifiedChange?: (value: boolean) => void
}

export const DanmakuSetting: FC<DanmakuSettingProps> = (props) => {
  const { classNames, children, onTraditionalToSimplifiedChange } = props
  const [playerSetting, setPlayerSetting] = usePlayerSettings()
  const isPlaying = !!classNames?.cardLayout
  const CardLayout = useMemo(() => {
    return ({ children }) =>
      isPlaying ? (
        <div className={classNames?.cardLayout}>{children}</div>
      ) : (
        <FieldsCardLayout title="弹幕">{children}</FieldsCardLayout>
      )
  }, [classNames?.cardLayout, isPlaying])

  return (
    <CardLayout>
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
          placeholder="弹幕显示区域"
          groups={danmakuEndAreaList}
          value={playerSetting.danmakuEndArea}
          onValueChange={(value) =>
            setPlayerSetting((prev) => ({ ...prev, danmakuEndArea: value }))
          }
        />
      </FieldLayout>
      {children}
    </CardLayout>
  )
}
