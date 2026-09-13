import type { useAppSettingsValue } from '@renderer/atoms/settings/app'
import { updateProgressAtom } from '@renderer/atoms/progress'
import { appSettingAtom } from '@renderer/atoms/settings/app'
import { jotaiStore } from '@renderer/atoms/store'
import { windowFullscreenAtom, WindowState, windowStateAtom } from '@renderer/atoms/window'
import { useSettingModal } from '@renderer/components/modules/settings/hooks'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { handlers } from '@renderer/lib/client'
import { getStorageNS } from '@renderer/lib/ns'
import { RouteName } from '@renderer/router'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'

export const IpcListener = () => {
  const showModal = useSettingModal()
  const navigation = useNavigate()
  useEffect(() => {
    const unlisten = [
      handlers?.showSetting.listen((section) => {
        // 防止关闭窗口过程中，再次打开窗口，导致窗口无法打开
        const timeoutId = setTimeout(() => {
          showModal(section)
        }, 10)
        return () => clearTimeout(timeoutId)
      }),

      handlers?.importAnime.listen((params) => {
        navigation(RouteName.PLAYER)
        // 通过 service 加载视频
        getPlayerLoadingService().loadFromPath(params?.path ?? '')
      }),
      handlers?.updateProgress.listen((params) => {
        jotaiStore.set(updateProgressAtom, { progress: params.progress, status: params.status })
      }),
      handlers?.getReleaseNotes.listen((text) => {
        try {
          const appDataString = localStorage.getItem(getStorageNS('app'))
          const appData = appDataString
            ? (JSON.parse(appDataString) as ReturnType<typeof useAppSettingsValue>)
            : null

          if (appData?.showUpdateNote) {
            toast({
              title: '更新成功 🎉',
              description: (
                <div className="mt-2 space-y-2">
                  {text.split('\n').map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ),
              duration: 10000,
            })
            jotaiStore.set(appSettingAtom, { ...appData, showUpdateNote: false })
          }
        } catch (error) {
          console.error(error)
        }
      }),
      handlers?.windowAction.listen((action) => {
        switch (action) {
          case 'enter-full-screen': {
            jotaiStore.set(windowFullscreenAtom, true)
            break
          }
          case 'leave-full-screen': {
            jotaiStore.set(windowFullscreenAtom, false)
            break
          }
          case 'maximize': {
            jotaiStore.set(windowStateAtom, WindowState.MAXIMIZED)
            break
          }
          case 'unmaximize': {
            jotaiStore.set(windowStateAtom, WindowState.NORMAL)
            break
          }
        }
      }),
    ]

    return () => {
      unlisten?.forEach((fn) => fn?.())
    }
  }, [showModal])
  return null
}
