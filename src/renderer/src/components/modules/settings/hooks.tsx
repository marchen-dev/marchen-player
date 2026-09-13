import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import { resolveAppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import { jotaiStore } from '@renderer/atoms/store'
import { modalStackAtom, useModalStack } from '@renderer/components/ui/modal'

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
        title: '设置',
        description: '管理 Marchen 的应用偏好、AI 服务与版本信息',
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
