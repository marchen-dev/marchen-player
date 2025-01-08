import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { isWeb } from '@renderer/lib/utils'

import { FieldLayout, FieldsCardLayout } from '../Layout'

export const VideoSetting = () => {
  const [playerSetting, setPlayerSetting] = usePlayerSettings()
  if (isWeb) {
    return
  }
  return (
    <FieldsCardLayout title="视频">
      <FieldLayout title="自动续播">
        <SettingSwitch
          value={playerSetting.enableAutomaticEpisodeSwitching}
          onCheckedChange={(value) => {
            setPlayerSetting((prev) => ({ ...prev, enableAutomaticEpisodeSwitching: value }))
          }}
        />
      </FieldLayout>
    </FieldsCardLayout>
  )
}
