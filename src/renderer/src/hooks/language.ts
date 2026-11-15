import { normalizeLanguagePreference } from '@marchen/i18n'
import { useAppSettings } from '@renderer/atoms/settings/app'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useCallback } from 'react'

/**
 * 设置页用的语言偏好读写。这里只改偏好；实际切换语言、更新文档语言标记、通知主进程
 * 都由 initialize/i18n.ts 对设置的订阅完成，保证任何入口改了偏好都走同一条路径。
 */
export const useLanguagePreference = () => {
  const [settings, setSettings] = useAppSettings()
  const preference = settings.language
  const change = useCallback(
    (value: string) => {
      const next = normalizeLanguagePreference(value)
      if (next === preference) return
      setSettings((previous) => ({ ...previous, language: next }))
      captureFeatureUsed('app_language', 'change', next)
    },
    [preference, setSettings],
  )
  return { preference, change }
}
