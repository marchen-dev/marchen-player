import { useAppSettings } from '@renderer/atoms/settings/app'
import Show from '@renderer/components/common/Show'
import { useToast } from '@renderer/components/ui/toast'
import { appLog } from '@renderer/lib/log'
import { cn, isWeb, isWindows } from '@renderer/lib/utils'
import { useEffect } from 'react'

import { Titlebar } from './WindowsTitlebar'

export const Prepare = () => {
  const [_, setAppSettings] = useAppSettings()
  const { toast } = useToast()
  useEffect(() => {
    const doneTime = Math.trunc(performance.now())

    appLog('App is ready', `${doneTime}ms`)
    try {
      if (!localStorage.getItem('marchen-player-storage-notice')) {
        toast({
          title: '播放存储已更新',
          description: '本版本使用新的播放记录和媒体库，旧版本数据保留，不会自动导入。',
          duration: 10000,
        })
        localStorage.setItem('marchen-player-storage-notice', '1')
      }
    } catch {
      /* 存储不可用不阻止播放器启动。 */
    }

    setAppSettings((old) => ({ ...old, firstOpen: false }))
  }, [])

  if (isWeb) {
    return null
  }

  return (
    <div
      className={cn(
        'drag-region absolute inset-x-0 top-0 h-12 shrink-0',
        isWindows && 'pointer-events-none z-[9999]',
      )}
      aria-hidden
    >
      <Show when={isWindows}>
        <Titlebar />
      </Show>
    </div>
  )
}
