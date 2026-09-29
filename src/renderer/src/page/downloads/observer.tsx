import { jotaiStore } from '@renderer/atoms/store'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { handlers, ipcClient } from '@renderer/lib/client'
import { downloadTelemetry } from '@renderer/services/telemetry/downloads'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { downloadCall, downloadError, downloadsAtom, torrentRequestAtom } from './state'
export function DownloadObserver() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!ipcClient) return
    const timer = setInterval(() => downloadTelemetry.tick(), 15000)
    const remove = handlers?.downloadsChanged.listen((snapshot) => {
      const previous = jotaiStore.get(downloadsAtom)
      if (previous && previous.revision >= snapshot.revision) return
      downloadTelemetry.observe(snapshot)
      if (previous)
        for (const task of snapshot.tasks) {
          const old = previous.tasks.find((t) => t.id === task.id)
          if (old && !old.completedAt && task.completedAt) toast({ title: '下载完成' })
        }
      jotaiStore.set(downloadsAtom, snapshot)
    })
    const open = handlers?.openTorrent.listen((request) => {
      jotaiStore.set(torrentRequestAtom, request)
      navigate('/downloads')
    })
    void downloadCall(ipcClient.downloads.list())
      .then((snapshot) => {
        const old = jotaiStore.get(downloadsAtom)
        if (!old || snapshot.revision > old.revision) {
          downloadTelemetry.observe(snapshot)
          jotaiStore.set(downloadsAtom, snapshot)
        }
      })
      .catch(downloadError)
    void ipcClient.app.torrentOpenReady().catch(downloadError)
    return () => {
      clearInterval(timer)
      remove?.()
      open?.()
    }
  }, [navigate])
  return null
}
