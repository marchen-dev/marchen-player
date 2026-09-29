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
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { downloadCall, downloadError, downloadsAtom } from './state'
export function DownloadSettingsView() {
  return (
    <SettingsPage sectionId="downloads" title="下载" description="管理下载目录与传输设置">
      <DownloadSettingsSection />
    </SettingsPage>
  )
}
function DownloadSettingsSection() {
  const snapshot = useAtomValue(downloadsAtom)
  return snapshot ? <DownloadSettingsForm initial={snapshot.settings} /> : null
}
function DownloadSettingsForm({ initial }: { initial: DownloadSettings }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  return (
    <SettingsSection
      title="下载"
      description="下载完成后自动停止传输；上传限速仅用于下载期间的分片交换。"
    >
      <SettingsGroup>
        <div className="space-y-4 p-4">
          <label className="block text-sm">
            默认保存目录
            <div className="mt-2 flex gap-2">
              <Input readOnly value={value.directory} aria-label="默认保存目录" />
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
                选择
              </Button>
            </div>
          </label>
          <label className="block text-sm">
            上传限速（KB/s，-1 表示不限速）
            <Input
              className="mt-2"
              type="number"
              aria-label="上传限速"
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
                .then(() => toast({ title: '下载设置已保存' }))
                .catch(downloadError)
                .finally(() => setBusy(false))
            }}
          >
            保存下载设置
          </Button>
        </div>
      </SettingsGroup>
    </SettingsSection>
  )
}
