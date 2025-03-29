import { useAppSettings } from '@renderer/atoms/settings/app'
import Show from '@renderer/components/common/Show'
import { DownloadClient } from '@renderer/components/layout/sidebar'
import { useToast } from '@renderer/components/ui/toast'
import { appLog } from '@renderer/lib/log'
import { cn, isChromiumBased, isWeb, isWindows } from '@renderer/lib/utils'
import { useEffect } from 'react'

import { Titlebar } from './WindowsTitlebar'

export const Prepare = () => {
  const [_, setAppSettings] = useAppSettings()
  useEffect(() => {
    const doneTime = Math.trunc(performance.now())

    appLog('App is ready', `${doneTime}ms`)

    if (!isWeb) {
      setAppSettings((old) => ({
        ...old,
        firstOpen: false,
      }))
    }
  }, [])

  if (isWeb) {
    return <PrepareForWeb />
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

const PrepareForWeb = () => {
  const [appSettings, setAppSettings] = useAppSettings()
  const { toast } = useToast()
  const { firstOpen } = appSettings

  useEffect(() => {
    appLog(
      'Download the Marchen Player client from github',
      'https://github.com/marchen-dev/marchen-player/releases/latest',
    )
    if (!firstOpen) {
      return
    }
    const clear = setTimeout(() => {
      const description = `${!isChromiumBased() ? '当前浏览器不支持 MKV 容器格式，' : ''}推荐下载客户端版本获得完整的体验`
      toast({
        title: '下载客户端',
        description,
        duration: 10000,
        action: <DownloadClient />,
      })
      setAppSettings((old) => ({
        ...old,
        firstOpen: false,
      }))
    }, 1000)

    return () => clearTimeout(clear)
  }, [])

  return null
}
