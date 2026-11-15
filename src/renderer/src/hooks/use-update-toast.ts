import { desktopUpdateAtom } from '@renderer/atoms/progress'
import { useSettingModal } from '@renderer/components/modules/settings/hooks'
import { ToastAction } from '@renderer/components/ui/toast/toast'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { t } from '@renderer/lib/i18n'
import { useAtomValue } from 'jotai'
import { createElement, useEffect, useRef } from 'react'

/** Mac 使用官方窗口；Windows / Linux AppImage 就绪时仅提示一次，完整状态留在关于页。 */
export function useUpdateToast() {
  const state = useAtomValue(desktopUpdateAtom)
  const notifiedRef = useRef<string | undefined>(undefined)
  const showSettings = useSettingModal()
  useEffect(() => {
    if (
      (state?.platform !== 'windows' && state?.platform !== 'linux') ||
      state.phase !== 'ready' ||
      notifiedRef.current === state.version
    )
      return
    notifiedRef.current = state.version
    toast({
      title: t('app:update.readyTitle'),
      description: t('app:update.readyDescription'),
      action: createElement(
        ToastAction,
        { altText: t('app:update.view'), onClick: () => showSettings('about') },
        t('app:update.view'),
      ),
    })
  }, [state, showSettings])
}
