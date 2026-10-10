import { appSettingAtom } from '@renderer/atoms/settings/app'
import { jotaiStore } from '@renderer/atoms/store'
import { telemetry } from '@renderer/services/telemetry'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { atom } from 'jotai'
import { ApiRouteClient } from './api-route-client'

/** 设置是持久化的；实际线路和冷却时间仅属于本次运行。 */
const apiRouteClient = new ApiRouteClient('auto', {
  changed: (change) => telemetry.capture('api_route_changed', change),
  completed: (result) => telemetry.capture('api_request_completed', result),
  recovered: (error) => reportOperationalError('player', 'api.request', error, true),
  failed: (error, result) =>
    telemetry.captureException(error, {
      handled: true,
      mechanism: 'api.request',
      errorCode: result.attempts.at(-1)?.error_code ?? 'api_request_failed',
      fingerprint: [
        'api_request_failed',
        result.endpoint,
        result.attempts.at(-1)?.error_code ?? 'unknown',
      ],
      contexts: { api_request: result },
    }),
})

export const apiPreferredRouteAtom = atom(apiRouteClient.getPreferred())
apiRouteClient.subscribe(() => jotaiStore.set(apiPreferredRouteAtom, apiRouteClient.getPreferred()))
let initialized = false
export const getApiRouteClient = () => {
  // 设置 helper 还依赖数据库和 UI，延迟读取以避开模块初始化的循环依赖。
  if (!initialized) {
    initialized = true
    apiRouteClient.setMode(jotaiStore.get(appSettingAtom).apiRouteMode)
    jotaiStore.sub(appSettingAtom, () => {
      apiRouteClient.setMode(jotaiStore.get(appSettingAtom).apiRouteMode)
    })
  }
  return apiRouteClient
}
