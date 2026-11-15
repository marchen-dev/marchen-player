import { useLabsSettings } from '@renderer/atoms/settings/labs'
import { BetaBadge } from '@renderer/components/common/BetaBadge'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { isWeb } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'

import { SettingsGroup, SettingsPage, SettingsRow, SettingsSection } from '../../components'

export const LabsView = () => {
  const [labsSettings, setLabsSettings] = useLabsSettings()
  const { t } = useTranslation('settings')

  return (
    <SettingsPage sectionId="labs" title={t('tabs.labs.label')} description={t('labs.description')}>
      {isWeb ? (
        <p className="text-muted-foreground text-sm">{t('labs.empty')}</p>
      ) : (
        <SettingsSection
          title={t('labs.playback.title')}
          description={t('labs.playback.description')}
        >
          <SettingsGroup>
            <SettingsRow
              label={
                <span className="inline-flex items-center gap-2">
                  {t('labs.remoteUrl.label')}
                  <BetaBadge />
                </span>
              }
              description={
                <>
                  {t('labs.remoteUrl.description')}
                  {/* Web 直接从浏览器读取远端，受跨域策略约束 */}
                  {isWeb && t('labs.remoteUrl.descriptionWebSuffix')}
                </>
              }
              labelId="labs-remote-url-playback-label"
              descriptionId="labs-remote-url-playback-description"
            >
              <SettingSwitch
                value={labsSettings.remoteUrlPlayback}
                aria-labelledby="labs-remote-url-playback-label"
                aria-describedby="labs-remote-url-playback-description"
                onCheckedChange={(checked) =>
                  setLabsSettings((prev) => ({ ...prev, remoteUrlPlayback: checked }))
                }
              />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      )}
    </SettingsPage>
  )
}
