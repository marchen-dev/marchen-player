import { useAppSettings } from '@renderer/atoms/settings/app'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { tipcClient } from '@renderer/lib/client'

import { FieldLayout, FieldsCardLayout, SettingViewContainer } from '../Layout'
import { DarkModeToggle } from './DarkMode'

export const GeneralView = () => {
  const [appSettings, setAppSettings] = useAppSettings()
  return (
    <SettingViewContainer>
      <FieldsCardLayout title="基本">
        <FieldLayout title="开机自启">
          <SettingSwitch
            value={appSettings.launchAtLogin}
            onCheckedChange={async (checked) => {
              await tipcClient?.windowAction({ action: 'laungh-at-login', checked })
              setAppSettings((prev) => ({ ...prev, launchAtLogin: checked }))
            }}
          />
        </FieldLayout>
      </FieldsCardLayout>

      <FieldsCardLayout title="外观">
        <FieldLayout title="主题">
          <DarkModeToggle />
        </FieldLayout>
      </FieldsCardLayout>
    </SettingViewContainer>
  )
}
