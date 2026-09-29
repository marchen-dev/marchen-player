import type { DownloadSettings } from '@marchen/shared/downloads'
import { SettingsGroup, SettingsSection } from '@renderer/components/modules/settings/components'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { downloadCall, downloadError, downloadsAtom } from './state'
export function DownloadSettingsSection() {
  const snapshot = useAtomValue(downloadsAtom)
  return snapshot ? <DownloadSettingsForm initial={snapshot.settings} /> : null
}
function DownloadSettingsForm({ initial }: { initial: DownloadSettings }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  return (
    <SettingsSection title="下载" description="目录和做种默认策略用于新任务；上传限速立即应用。">
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
          <label className="block text-sm">
            默认做种策略
            <select
              className="bg-background mt-2 block w-full rounded-lg border p-2"
              value={value.policy}
              onChange={(e) =>
                setValue({ ...value, policy: e.target.value as DownloadSettings['policy'] })
              }
            >
              <option value="ratio-or-time">分享率达到 1.0 或累计做种 2 小时后停止</option>
              <option value="stop">下载完成即停止</option>
              <option value="forever">持续做种</option>
            </select>
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
