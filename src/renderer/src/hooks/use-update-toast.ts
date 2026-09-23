import { desktopUpdateAtom } from '@renderer/atoms/progress'
import { useSettingModal } from '@renderer/components/modules/settings/hooks'
import { ToastAction } from '@renderer/components/ui/toast/toast'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { useAtomValue } from 'jotai'
import { createElement, useEffect, useRef } from 'react'

/** Mac 使用官方窗口；Windows 就绪时仅提示一次，完整状态留在关于页。 */
export function useUpdateToast() {
  const state = useAtomValue(desktopUpdateAtom)
  const notifiedRef = useRef<string | undefined>(undefined)
  const showSettings = useSettingModal()
  useEffect(() => {
    if (
      state?.platform !== 'windows' ||
      state.phase !== 'ready' ||
      notifiedRef.current === state.version
    )
      return
    notifiedRef.current = state.version
    toast({
      title: '新版本已准备好',
      description: '可以在关于页查看更新并选择安装。',
      action: createElement(
        ToastAction,
        { altText: '查看更新', onClick: () => showSettings('about') },
        '查看更新',
      ),
    })
  }, [state, showSettings])
}
