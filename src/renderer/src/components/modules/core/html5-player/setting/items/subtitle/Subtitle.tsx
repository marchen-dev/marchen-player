import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'

import { SettingContainer } from '../../Container'
import { SubtitleImport } from './SubtitleImport'
import { SubtitleTimeOff } from './SubtitleTimeOff'

export const Subtitle = () => {
  return (
    <SettingContainer>
      <FieldLayout title="字幕">
        <SubtitleImport />
      </FieldLayout>

      <FieldLayout title="时间偏移">
        <SubtitleTimeOff />
      </FieldLayout>
    </SettingContainer>
  )
}
