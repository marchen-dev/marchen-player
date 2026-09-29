import type { DownloadPeer } from '@marchen/shared/downloads'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { ipcClient } from '@renderer/lib/client'
import { useEffect, useState } from 'react'
import { bytes, downloadCall } from './state'

const states = {
  downloading: '正在接收',
  choked: '等待对方允许',
  ready: '等待传输',
  unneeded: '暂无所需分片',
}
export function PeerDialog({
  id,
  name,
  onClose,
}: {
  id: string
  name: string
  onClose: () => void
}) {
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
          setError(e instanceof Error ? e.message : '节点信息读取失败')
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
  }, [id])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        data-telemetry-replay-block
        className="ph-no-capture sm:max-w-4xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(`download-menu-${id}`)?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>节点详情{peers ? ` · ${peers.length} 个连接` : ''}</DialogTitle>
          <DialogDescription className="truncate" title={name}>
            {name}
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          每 2 秒刷新。分片占比针对整个种子；传输量仅统计当前连接。连接成功不代表正在传输。
        </p>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : peers === null ? (
          <p className="text-muted-foreground py-8 text-center">正在读取节点信息…</p>
        ) : peers.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            暂无已连接节点，暂停或完成后会断开连接。
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-background text-muted-foreground sticky top-0">
                <tr>
                  {['地址', '下载 / 上传', '累计接收 / 发送', '持有分片', '状态'].map((label) => (
                    <th key={label} className="px-3 py-2 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {peers.map((peer) => (
                  <tr key={peer.id} className="border-t">
                    <td className="px-3 py-3 font-mono text-xs select-text">{peer.address}</td>
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
                    <td className="px-3 py-3">{states[peer.state]}</td>
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
