import type { DownloadSettings } from '@marchen/shared/downloads'
import {
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@renderer/components/modules/settings/components'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadCall, downloadError, downloadsAtom } from './state'
export function DownloadSettingsView() {
  const { t } = useTranslation('settings')
  return (
    <SettingsPage
      sectionId="downloads"
      title={t('tabs.downloads.label')}
      description={t('tabs.downloads.description')}
    >
      <DownloadSettingsSection />
    </SettingsPage>
  )
}
function DownloadSettingsSection() {
  const snapshot = useAtomValue(downloadsAtom)
  return snapshot ? <DownloadSettingsForm initial={snapshot.settings} /> : null
}
function DownloadSettingsForm({ initial }: { initial: DownloadSettings }) {
  const { t } = useTranslation(['downloads', 'app'])
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  return (
    <SettingsSection title={t('app:routes.downloads')} description={t('settings.description')}>
      <SettingsGroup>
        <div className="space-y-4 p-4">
          <label className="block text-sm">
            {t('settings.directory')}
            <div className="mt-2 flex gap-2">
              <Input readOnly value={value.directory} aria-label={t('settings.directory')} />
              <Button
                variant="outline"
                onClick={() => {
                  void downloadCall(ipcClient?.downloads.selectDirectory())
                    .then((path) => {
                      if (path) setValue({ ...value, directory: path })
                    })
                    .catch(downloadError)
                }}
              >
                {t('newDialog.choose')}
              </Button>
            </div>
          </label>
          <label className="block text-sm">
            {t('settings.uploadLimit')}
            <Input
              className="mt-2"
              type="number"
              aria-label={t('settings.uploadLimitLabel')}
              value={value.uploadLimit === -1 ? -1 : value.uploadLimit / 1024}
              onChange={(e) =>
                setValue({
                  ...value,
                  uploadLimit:
                    Number(e.target.value) === -1 ? -1 : Math.round(Number(e.target.value) * 1024),
                })
              }
            />
          </label>
          <Button
            disabled={busy || !(value.uploadLimit === -1 || value.uploadLimit > 0)}
            onClick={() => {
              setBusy(true)
              void downloadCall(ipcClient?.downloads.settings(value))
                .then(() => {
                  captureFeatureUsed('download_settings', 'save_upload_limit', value.uploadLimit)
                  toast({ title: t('settings.saved') })
                })
                .catch(downloadError)
                .finally(() => setBusy(false))
            }}
          >
            {t('settings.save')}
          </Button>
        </div>
      </SettingsGroup>
    </SettingsSection>
  )
}
