import { useAppSettings } from '@renderer/atoms/settings/app'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { ipcClient } from '@renderer/lib/client'
import { resetApp } from '@renderer/lib/ns'
import { isWeb } from '@renderer/lib/utils'
import { useCallback } from 'react'

import {
  SettingsActionRow,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '../../components'
import { DarkModeToggle } from './DarkMode'

export const GeneralView = () => {
  const [appSettings, setAppSettings] = useAppSettings()
  const { toast } = useToast()
  const showConfirmationDialog = useConfirmationDialog()

  const handleClearDanmakuCache = useCallback(async () => {
    try {
      await db.transaction('rw', db.history, async () => {
        const allEntries = await db.history.toArray()
        await Promise.all(
          allEntries.map((entry) => db.history.update(entry.hash, { danmaku: undefined })),
        )
      })
      toast({ title: '清除弹幕缓存成功' })
    } catch (error) {
      console.error('Failed to clear danmaku field:', error)
      toast({ title: '清除弹幕缓存失败', variant: 'destructive' })
    }
  }, [toast])

  return (
    <SettingsPage sectionId="general" title="通用" description="管理应用行为、外观与本地数据">
      {!isWeb && (
        <SettingsSection title="应用">
          <SettingsGroup>
            <SettingsRow
              label="开机自启"
              description="登录系统后自动启动 Marchen"
              labelId="launch-at-login-label"
              descriptionId="launch-at-login-description"
            >
              <SettingSwitch
                value={appSettings.launchAtLogin}
                aria-labelledby="launch-at-login-label"
                aria-describedby="launch-at-login-description"
                onCheckedChange={async (checked) => {
                  await ipcClient?.app.windowAction({ action: 'laungh-at-login', checked })
                  setAppSettings((prev) => ({ ...prev, launchAtLogin: checked }))
                }}
              />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title="外观">
        <SettingsGroup>
          <SettingsRow
            label="主题"
            description="跟随系统，或固定使用白天与夜间外观"
            labelId="theme-preference-label"
          >
            <div aria-labelledby="theme-preference-label">
              <DarkModeToggle />
            </div>
          </SettingsRow>
          {!isWeb && (
            <SettingsRow
              label="播放记录显示海报"
              description="在历史记录中使用番剧海报作为封面"
              labelId="show-poster-label"
              descriptionId="show-poster-description"
            >
              <SettingSwitch
                value={appSettings.showPoster}
                aria-labelledby="show-poster-label"
                aria-describedby="show-poster-description"
                onCheckedChange={(checked) =>
                  setAppSettings((prev) => ({ ...prev, showPoster: checked }))
                }
              />
            </SettingsRow>
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="数据" description="这些操作不会影响本地视频文件">
        <SettingsGroup>
          <SettingsActionRow label="清除弹幕缓存" description="下次播放时会重新获取已缓存的弹幕">
            <Button variant="outline" size="sm" onClick={handleClearDanmakuCache}>
              清除缓存
            </Button>
          </SettingsActionRow>
          <SettingsActionRow
            label="重置应用"
            description="清除历史记录、服务配置与所有应用设置"
            danger
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                showConfirmationDialog({
                  title: '确定重置应用？此操作无法撤销。',
                  handleConfirm: resetApp,
                })
              }
            >
              重置应用
            </Button>
          </SettingsActionRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}
