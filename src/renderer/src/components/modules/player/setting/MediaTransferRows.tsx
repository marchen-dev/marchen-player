import { ipcClient } from '@renderer/lib/client'
import { activeRemoteLeaseAtom, formatMediaBytes } from '@renderer/services/media/remote-progress'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'

export function MediaTransferRows() {
  const remote = usePlayerLoadingSelector(
    (state) => 'video' in state && state.video.source?.kind === 'remote-url',
  )
  const lease = useAtomValue(activeRemoteLeaseAtom)?.id
  const [sample, setSample] = useState<{ lease: string; received: number; speed: number } | null>(
    null,
  )
  const stats = sample?.lease === lease ? sample : null
  useEffect(() => {
    if (!remote || !lease || !ipcClient) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const result = await ipcClient!.player.remoteTransfer({ id: lease })
        if (!cancelled) setSample(result ? { ...result, lease } : null)
      } catch {
        if (!cancelled) setSample(null)
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 1000)
      }
    }
    void refresh()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [remote, lease])
  const rows = [{ label: '媒体来源', value: remote ? '远程 · HTTP/HTTPS' : '本地文件' }]
  if (remote)
    rows.push(
      { label: '当前接收速度', value: stats ? `${formatMediaBytes(stats.speed)}/s` : '—' },
      { label: '本次累计接收', value: stats ? formatMediaBytes(stats.received) : '—' },
    )
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex min-h-11 items-start justify-between gap-4 px-4 py-3 text-sm"
        >
          <span className="shrink-0">{row.label}</span>
          <span className="min-w-0 text-right text-[var(--player-settings-muted)] tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
    </>
  )
}
