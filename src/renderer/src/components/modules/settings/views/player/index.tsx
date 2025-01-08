import { SettingViewContainer } from '../Layout'
import { DanmakuSetting } from './DanmakuSetting'
import { VideoSetting } from './VideoSetting'

export const PlayerView = () => {
  return (
    <SettingViewContainer>
      <VideoSetting />
      <DanmakuSetting />
    </SettingViewContainer>
  )
}
