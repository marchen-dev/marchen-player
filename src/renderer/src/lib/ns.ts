import { toast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { telemetry } from '@renderer/services/telemetry'
import { opfsAssetStore } from '@renderer/services/translation/assets/store'

import { ipcClient } from './client'
import { isWeb } from './utils'

const ns = 'marchen'
export const getStorageNS = (key: string) => `${ns}:${key}`

export const clearStorage = () => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(ns)) {
      localStorage.removeItem(key)
    }
  }
}

export const resetApp = async () => {
  await telemetry.reset()
  // 弹幕翻译的引擎与模型存在浏览器私有文件系统里，不随 localStorage / IndexedDB 一起清掉，
  // 两端都在这里显式删除；失败不阻断重置。
  await opfsAssetStore.clear().catch(() => {})
  if (isWeb) {
    localStorage.clear()
    await db.deleteDatabase()
    toast({
      title: '重置成功',
      description: '网页将在 3 秒后重新加载',
    })
    setTimeout(() => {
      window.location.reload()
    }, 3000)
    return
  }
  ipcClient?.app.windowAction({ action: 'reset' })
}
