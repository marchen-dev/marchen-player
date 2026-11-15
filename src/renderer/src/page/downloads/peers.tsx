import type { DownloadPeer } from '@marchen/shared/downloads'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { ipcClient } from '@renderer/lib/client'
import { describeError } from '@renderer/lib/errors'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bytes, downloadCall } from './state'

export function PeerDialog({
  id,
  name,
  onClose,
}: {
  id: string
  name: string
  onClose: () => void
}) {
  const { t } = useTranslation('downloads')
  const [peers, setPeers] = useState<DownloadPeer[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // 请求结束后再排下一次，关闭弹窗后不再请求或更新状态。
    const refresh = async () => {
      try {
        const value = await downloadCall(ipcClient?.downloads.peers({ id }))
        if (!cancelled) {
          setPeers(value)
          setError('')
        }
      } catch (e) {
        if (!cancelled) {
          setPeers(null)
          setError(describeError(e, t('peers.readFailed')))
        }
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 2000)
      }
    }
    void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, t])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-4xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(`download-menu-${id}`)?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {peers ? t('peers.titleWithCount', { count: peers.length }) : t('peers.title')}
          </DialogTitle>
          <DialogDescription className="truncate" title={name}>
            {name}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">{t('peers.hint')}</p>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : peers === null ? (
          <p className="text-muted-foreground py-8 text-center">{t('peers.loading')}</p>
        ) : peers.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">{t('peers.empty')}</p>
        ) : (
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-background text-muted-foreground sticky top-0">
                <tr>
                  {(['address', 'speed', 'transferred', 'pieces', 'state'] as const).map(
                    (column) => (
                      <th key={column} className="px-3 py-2 font-medium">
                        {t(`peers.columns.${column}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {peers.map((peer) => (
                  <tr key={peer.id} className="border-t">
                    <td className="px-3 py-3 font-mono text-xs select-text">
                      {peer.address || t('peers.addressUnavailable')}
                    </td>
                    <td className="px-3 py-3">
                      {bytes(peer.downloadSpeed)}/s / {bytes(peer.uploadSpeed)}/s
                    </td>
                    <td className="px-3 py-3">
                      {bytes(peer.downloaded)} / {bytes(peer.uploaded)}
                    </td>
                    <td className="px-3 py-3">
                      {peer.availablePercent === null
                        ? '—'
                        : `${peer.availablePercent.toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-3">{t(`peers.states.${peer.state}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
