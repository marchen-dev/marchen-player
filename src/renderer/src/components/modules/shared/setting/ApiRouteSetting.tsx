import { useAppSettings } from '@renderer/atoms/settings/app'
import { SettingsRow } from '@renderer/components/modules/settings/components'
import { API_ROUTES } from '@renderer/lib/env'
import { apiPreferredRouteAtom, getApiRouteClient } from '@renderer/request/api-route'
import { normalizeApiRouteMode } from '@renderer/request/api-route-client'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { SettingSelect } from './SettingSelect'

const labels = { cloudflare: 'Cloudflare', edgeone: 'EdgeOne' }

/**
 * 用户偏好与实际线路分别展示：自动模式下的当前线路由实测结果决定（对冲胜出、时区初始猜测），
 * 标注"自动选择"，避免误认为是用户主动选择。
 */
export const ApiRouteSetting = () => {
  const [settings, setSettings] = useAppSettings()
  const route = useAtomValue(apiPreferredRouteAtom)
  useEffect(() => {
    getApiRouteClient()
  }, [])
  // 仅用于应用设置，使用标准设置行排版：当前线路作为说明排在标题下方
  return (
    <SettingsRow
      label="API 线路"
      labelId="api-route-label"
      descriptionId="api-route-description"
      description={
        <span role="status" title={API_ROUTES[route]}>
          当前线路：{labels[route]}
          {settings.apiRouteMode === 'auto' && '（自动选择）'}
        </span>
      }
    >
      <SettingSelect
        ariaLabel="API 线路"
        groups={[
          { value: 'auto', label: '自动（推荐）' },
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
