import { RELEASE_REPOSITORY } from '@marchen/shared/update-policy'
import { desktopUpdateAtom } from '@renderer/atoms/progress'
import { jotaiStore } from '@renderer/atoms/store'
import { windowFullscreenAtom, WindowState, windowStateAtom } from '@renderer/atoms/window'
import { useSettingModal } from '@renderer/components/modules/settings/hooks'
import { ToastAction } from '@renderer/components/ui/toast/toast'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { handlers, ipcClient } from '@renderer/lib/client'
import { DownloadObserver } from '@renderer/page/downloads/observer'
import { RouteName } from '@renderer/router'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { preparePlayerUpdate } from '@renderer/services/player-runtime/update-preparation'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'

export const IpcListener = () => {
  const showModal = useSettingModal()
  const navigation = useNavigate()
  useEffect(() => {
    const unlisten = [
      handlers?.prepareUpdate.listen((id) => {
        void preparePlayerUpdate()
          .then(
            () => ipcClient?.app.updateSaved({ id, success: true }),
            () =>
              ipcClient?.app.updateSaved({
                id,
                success: false,
                message: '播放进度保存失败，请重试',
              }),
          )
          .catch(console.error)
      }),
      handlers?.desktopUpdate.listen((state) => {
        const old = jotaiStore.get(desktopUpdateAtom)
        if (!old || state.revision > old.revision) jotaiStore.set(desktopUpdateAtom, state)
      }),
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

    // 所有监听注册完成后才领取系统文件打开请求。
    void ipcClient?.app.fileOpenReady().catch(console.error)

    void ipcClient?.app
      .getInstalledUpdate()
      .then((notice) => {
        if (notice)
          toast({
            title: `已更新至 ${notice.version}`,
            // 完整 Markdown 留在对应版本的发布页，避免长篇原文挤满通知。
            description: '当前已运行新版本。',
            action: (
              <ToastAction altText="在浏览器中查看此版本的更新内容" asChild>
                <a
                  href={`https://github.com/${RELEASE_REPOSITORY}/releases/tag/v${encodeURIComponent(notice.version)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看更新内容
                </a>
              </ToastAction>
            ),
            duration: 10000,
          })
      })
      .catch(console.error)
    void ipcClient?.app
      .getUpdateState()
      .then((state) => {
        const old = jotaiStore.get(desktopUpdateAtom)
        if (!old || state.revision > old.revision) jotaiStore.set(desktopUpdateAtom, state)
      })
      .catch(console.error)
    return () => {
      unlisten?.forEach((fn) => fn?.())
    }
  }, [showModal])
  return <DownloadObserver />
}
