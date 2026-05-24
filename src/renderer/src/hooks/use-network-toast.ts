import { toast } from '@renderer/components/ui/toast/use-toast'
import { isWeb } from '@renderer/lib/utils'
import { useEffect, useRef } from 'react'

import { useNetworkStatus } from './use-network-status'

/**
 * 全局网络状态 toast 适配器。
 *
 * 替代旧 sidebar 内 `NetWorkCheck` 的固定 Alert。
 *
 * 行为：
 *  - 网络从在线变为离线：弹一条 destructive 持续 toast「网络异常」
 *    （持续时间用 `useToast` 内的 TOAST_REMOVE_DELAY 默认 1000000ms 兜底，
 *     实际上靠 `dismiss()` 主动清除）
 *  - 网络恢复在线：主动 dismiss 上一条 toast，不弹「已恢复」避免打扰
 *  - 仅在 Electron 桌面端挂载；Web 端有浏览器原生离线提示，不重复
 *
 * 应在应用根级挂载一次（与 IpcListener 同位置）。
 */
export function useNetworkToast() {
  const online = useNetworkStatus()
  // 保存当前 toast 的 dismiss 句柄。null 表示当前没有显示中的离线 toast。
  const dismissRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (isWeb) return

    if (!online) {
      // 已经在显示则不重复弹（避免 useNetworkStatus 重复触发）
      if (dismissRef.current) return
      const t = toast({
        title: '网络异常',
        description: '请检查网络连接',
        variant: 'destructive',
        // 不传 duration，让 toast 持续显示到 dismiss 主动清除
      })
      dismissRef.current = t.dismiss
    } else {
      dismissRef.current?.()
      dismissRef.current = null
    }
  }, [online])

  // 卸载时清理残留 toast，避免热重载残留
  useEffect(() => {
    return () => {
      dismissRef.current?.()
      dismissRef.current = null
    }
  }, [])
}
