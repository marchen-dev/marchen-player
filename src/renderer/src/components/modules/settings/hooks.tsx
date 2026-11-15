import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import { resolveAppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import { jotaiStore } from '@renderer/atoms/store'
import { modalStackAtom, useModalStack } from '@renderer/components/ui/modal'
import { t } from '@renderer/lib/i18n'

import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useCallback, useRef } from 'react'
import { SettingModal } from '.'
import { AppSettingsDialogShell } from './AppSettingsDialogShell'
import { setCurrentSetting } from './provider'

export const useOpenAppSettings = () => {
  const { present } = useModalStack()
  const returnFocusRef = useRef<HTMLElement | null>(null)
  return useCallback(
    (target?: AppSettingsSection | string) => {
      const section = resolveAppSettingsSection(target)
      captureFeatureUsed('settings', 'open', section)
      const isAlreadyOpen = jotaiStore.get(modalStackAtom).some((modal) => modal.id === 'SETTING')
      if (!isAlreadyOpen && document.activeElement instanceof HTMLElement) {
        returnFocusRef.current = document.activeElement
      }
      // 先切换分类，已存在的固定 ID 弹窗只会被移到栈顶，不会重复创建。
      setCurrentSetting(section)
      present({
        id: 'SETTING',
        // 打开时按当时的语言取；弹窗内可见的标题由 SettingModal 自己渲染并随语言更新
        title: t('settings:dialog.title'),
        description: t('settings:dialog.description'),
        returnFocusRef,
        overlay: false,
        CustomModalComponent: AppSettingsDialogShell,
        content: () => <SettingModal />,
      })
      return 'SETTING'
    },
    [present],
  )
}

/** 兼容现有入口，后续调用统一使用稳定分类 ID。 */
export const useSettingModal = useOpenAppSettings
