import type { RoutePreferenceStore } from './api-route-client'
import { appSettingAtom } from '@renderer/atoms/settings/app'
import { jotaiStore } from '@renderer/atoms/store'
import { telemetry } from '@renderer/services/telemetry'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { atom } from 'jotai'
import { ApiRouteClient } from './api-route-client'

// 与 `getStorageNS('api-route-preference')` 相同；不引入 lib/ns，它经 telemetry / 数据库会绕回请求层形成循环依赖
const PREFERENCE_KEY = 'marchen:api-route-preference'

/**
 * 学到的首选线路属于运行时的网络状态，不是用户偏好，所以放在 localStorage 而不是设置里；
 * 同步读取保证第一个请求发出前就能确定线路。重置应用会随 localStorage 一起清除。
 */
const localPreferenceStore: RoutePreferenceStore = {
  load: () => {
    const raw = localStorage.getItem(PREFERENCE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as { v?: unknown; route?: unknown; updatedAt?: unknown }
    if (value.v !== 1) return null
    if (value.route !== 'cloudflare' && value.route !== 'edgeone') return null
    if (typeof value.updatedAt !== 'number') return null
    return { route: value.route, updatedAt: value.updatedAt }
  },
  save: ({ route, updatedAt }) => {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ v: 1, route, updatedAt }))
  },
}

const systemTimeZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone || undefined

/** 设置是持久化的用户偏好；实际首选线路由线路层按实测结果决定。 */
const apiRouteClient = new ApiRouteClient(
  'auto',
  {
    changed: (change) => telemetry.capture('api_route_changed', change),
    completed: (result) => telemetry.capture('api_request_completed', result),
    recovered: (error) => reportOperationalError('player', 'api.request', error, true),
    failed: (error, result) =>
      telemetry.captureException(error, {
        handled: true,
        mechanism: 'api.request',
        // 并行尝试时最后发起的未必决定结果，统一取本轮汇总里决定结果的错误码
        errorCode: result.error_code ?? 'api_request_failed',
        fingerprint: ['api_request_failed', result.endpoint, result.error_code ?? 'unknown'],
        contexts: { api_request: result },
      }),
  },
  { store: localPreferenceStore, timeZone: systemTimeZone },
)

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
