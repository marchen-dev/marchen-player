import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { isWeb } from '@renderer/lib/utils'

import { FieldLayout, FieldsCardLayout } from '../Layout'
import { PlayerKernelList } from './list'

export const PlayerSetting = () => {
  const [playerSetting, setPlayerSetting] = usePlayerSettings()

  return (
    <FieldsCardLayout title="视频">
      {
        <FieldLayout title="内核">
          <SettingSelect
            placeholder="播放器内核"
            groups={PlayerKernelList}
            value={playerSetting.playerKernel}
            onValueChange={(value) =>
              setPlayerSetting((prev) => ({ ...prev, playerKernel: value }))
            }
          />
        </FieldLayout>
      }
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
