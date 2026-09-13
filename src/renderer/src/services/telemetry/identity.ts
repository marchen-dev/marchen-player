import { nanoid } from 'nanoid'

const WEB_INSTALL_ID_KEY = 'marchen:telemetry-install-id'

interface IdentityStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export const getOrCreateWebInstallId = (storage: IdentityStorage): string => {
  const existing = storage.getItem(WEB_INSTALL_ID_KEY)
  if (existing) return existing
  const installId = nanoid()
  storage.setItem(WEB_INSTALL_ID_KEY, installId)
  return installId
}

export const resetWebInstallId = (storage: IdentityStorage): void => {
  storage.removeItem(WEB_INSTALL_ID_KEY)
}

export const getRendererTelemetryIdentity = async (): Promise<{
  installId: string
  appSessionId: string
  platform: string
  arch: string
}> => {
  // 避免测试和 Web 构建在模块求值阶段加载会读取 window 的 Electron IPC 客户端。
  if (typeof window !== 'undefined' && window.electron) {
    const { ipcClient } = await import('@renderer/lib/client')
    if (ipcClient) return ipcClient.app.getTelemetryIdentity()
  }
  return {
    installId: getOrCreateWebInstallId(localStorage),
    appSessionId: nanoid(),
    platform: navigator.platform || 'web',
    arch: 'browser',
  }
}
