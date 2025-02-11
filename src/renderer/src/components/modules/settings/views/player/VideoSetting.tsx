import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { isWeb } from '@renderer/lib/utils'

import { FieldLayout, FieldsCardLayout } from '../Layout'

export const VideoSetting = () => {
  const [playerSetting, setPlayerSetting] = usePlayerSettings()

  return (
    <FieldsCardLayout title="视频">
      {!isWeb && (
        <FieldLayout title="自动续播">
          <SettingSwitch
            value={playerSetting.enableAutomaticEpisodeSwitching}
            onCheckedChange={(value) => {
              setPlayerSetting((prev) => ({ ...prev, enableAutomaticEpisodeSwitching: value }))
            }}
          />
        </FieldLayout>
      )}

      <FieldLayout title="底部迷你进度条">
        <SettingSwitch
          value={playerSetting.enableMiniProgress}
          onCheckedChange={(value) => {
            setPlayerSetting((prev) => ({ ...prev, enableMiniProgress: value }))
          }}
        />
      </FieldLayout>
    </FieldsCardLayout>
  )
}
