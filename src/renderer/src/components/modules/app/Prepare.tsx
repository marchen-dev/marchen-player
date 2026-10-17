import { useAppSettings } from '@renderer/atoms/settings/app'
import { useToast } from '@renderer/components/ui/toast'
import { appLog } from '@renderer/lib/log'
import { isMac } from '@renderer/lib/utils'
import { useEffect } from 'react'

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

  // 透明拖拽层只服务 macOS hiddenInset 标题栏。Windows 的拖拽与按钮由 AppHeader /
  // PlayerWindowChrome 承担；Linux 使用系统原生标题栏。两者叠加拖拽层都会让原生
  // 窗口命中测试吞掉顶部按钮点击。
  if (!isMac) return null

  return <div className="drag-region absolute inset-x-0 top-0 h-12 shrink-0" aria-hidden />
}
