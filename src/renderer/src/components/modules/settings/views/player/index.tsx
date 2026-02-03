import { SettingViewContainer } from '../Layout'
import { DanmakuSetting } from './DanmakuSetting'
import { PlayerSetting } from './PlayerSetting'

export const PlayerView = () => {
  return (
    <SettingViewContainer>
      <PlayerSetting />
      <DanmakuSetting />
    </SettingViewContainer>
  )
}
