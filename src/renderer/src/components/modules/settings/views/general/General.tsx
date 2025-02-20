import { useAppSettings } from '@renderer/atoms/settings/app'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { tipcClient } from '@renderer/lib/client'
import { isWeb } from '@renderer/lib/utils'

import { FieldLayout, FieldsCardLayout, SettingViewContainer } from '../Layout'
import { DarkModeToggle } from './DarkMode'

export const GeneralView = () => {
  const [appSettings, setAppSettings] = useAppSettings()
  return (
    <SettingViewContainer>
      {!isWeb && (
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
      )}

      <FieldsCardLayout title="外观">
        <FieldLayout title="主题">
          <DarkModeToggle />
        </FieldLayout>

        {!isWeb && (
          <FieldLayout title="播放记录显示海报" className="pt-1">
            <SettingSwitch
              value={appSettings.showPoster}
              onCheckedChange={(checked) =>
                setAppSettings((prev) => ({ ...prev, showPoster: checked }))
              }
            />
          </FieldLayout>
        )}
      </FieldsCardLayout>
    </SettingViewContainer>
  )
}
