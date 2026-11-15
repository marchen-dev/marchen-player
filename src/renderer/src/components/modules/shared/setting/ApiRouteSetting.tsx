import { useAppSettings } from '@renderer/atoms/settings/app'
import { SettingsRow } from '@renderer/components/modules/settings/components'
import { API_ROUTES } from '@renderer/lib/env'
import { apiPreferredRouteAtom, getApiRouteClient } from '@renderer/request/api-route'
import { normalizeApiRouteMode } from '@renderer/request/api-route-client'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingSelect } from './SettingSelect'

/** 线路名是服务商的名字，不翻译 */
const labels = { cloudflare: 'Cloudflare', edgeone: 'EdgeOne' }

/**
 * 用户偏好与实际线路分别展示：自动模式下的当前线路由实测结果决定（对冲胜出、时区初始猜测），
 * 标注"自动选择"，避免误认为是用户主动选择。
 */
export const ApiRouteSetting = () => {
  const [settings, setSettings] = useAppSettings()
  const route = useAtomValue(apiPreferredRouteAtom)
  const { t } = useTranslation('settings')
  useEffect(() => {
    getApiRouteClient()
  }, [])
  // 仅用于应用设置，使用标准设置行排版：当前线路作为说明排在标题下方
  return (
    <SettingsRow
      label={t('general.network.apiRoute.label')}
      labelId="api-route-label"
      descriptionId="api-route-description"
      description={
        <span role="status" title={API_ROUTES[route]}>
          {t(
            settings.apiRouteMode === 'auto'
              ? 'general.network.apiRoute.currentAuto'
              : 'general.network.apiRoute.current',
            { route: labels[route] },
          )}
        </span>
      }
    >
      <SettingSelect
        ariaLabel={t('general.network.apiRoute.label')}
        groups={[
          { value: 'auto', label: t('general.network.apiRoute.auto') },
          { value: 'cloudflare', label: 'Cloudflare' },
          { value: 'edgeone', label: 'EdgeOne' },
        ]}
        value={settings.apiRouteMode}
        onValueChange={(value) => {
          const mode = normalizeApiRouteMode(value)
          if (mode === settings.apiRouteMode) return
          setSettings((previous) => ({ ...previous, apiRouteMode: mode }))
          captureFeatureUsed('api_route', 'change', mode)
        }}
      />
    </SettingsRow>
  )
}
