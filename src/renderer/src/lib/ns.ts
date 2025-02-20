import { toast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'

import { tipcClient } from './client'
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
  tipcClient?.windowAction({ action: 'reset' })
}
