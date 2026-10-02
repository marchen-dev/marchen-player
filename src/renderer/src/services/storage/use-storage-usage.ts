import type { HistoryUsage } from './measure'
import { ipcClient } from '@renderer/lib/client'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useCallback, useEffect, useRef, useState } from 'react'

import { estimateHistoryUsage } from './usage'

/**
 * 设置页数据区的占用状态。
 * ready 中各字段独立降级：某一项统计失败或平台不支持时为 undefined，UI 隐藏该数值即可。
 */
export type StorageUsageState =
  | { status: 'loading' }
  | {
      status: 'ready'
      history?: HistoryUsage
      /** Electron session HTTP 缓存；Web 恒为 undefined */
      network?: number
    }

async function loadNetworkCacheSize(): Promise<number | undefined> {
  if (!ipcClient) return undefined
  try {
    return await ipcClient.app.getNetworkCacheSize()
  } catch (error) {
    reportOperationalError('ipc', 'settings.network_cache_size', error, true)
    return undefined
  }
}

async function loadHistoryUsage(): Promise<HistoryUsage | undefined> {
  try {
    return await estimateHistoryUsage()
  } catch (error) {
    reportOperationalError('player', 'settings.estimate_history_usage', error, true)
    return undefined
  }
}

/**
 * 挂载时异步统计本地数据占用，提供 refresh 供清除操作后刷新。
 * 刷新期间保留上一次结果，避免数值闪回「计算中…」。
 */
export function useStorageUsage() {
  const [state, setState] = useState<StorageUsageState>({ status: 'loading' })
  // 只采纳最近一次统计结果，防止连续清除时旧结果覆盖新结果
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    const [history, network] = await Promise.all([loadHistoryUsage(), loadNetworkCacheSize()])
    if (request !== requestRef.current) return
    setState({ status: 'ready', history, network })
  }, [])

  useEffect(() => {
    const requests = requestRef
    void refresh()
    // 卸载后让未完成的统计结果失效
    return () => {
      requests.current++
    }
  }, [refresh])

  return { state, refresh }
}
