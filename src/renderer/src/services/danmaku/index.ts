import { handlers, ipcClient } from '@renderer/lib/client'
import { getPlayerLoadingService } from '../player-loading'
import { LinkImportController } from './link-import'

let instance: LinkImportController | undefined
export function getLinkImportController() {
  if (!ipcClient || !handlers) throw new Error('链接导入仅支持桌面端')
  const ipc = ipcClient.danmaku
  const events = handlers.danmakuImportProgress
  instance ??= new LinkImportController(getPlayerLoadingService(), {
    identify: (url) => ipc.identify({ url }),
    fetch: (requestId, url) => ipc.importLink({ requestId, url }),
    cancel: (requestId) => ipc.cancelImport({ requestId }),
    listen: (callback) => events.listen(callback),
  })
  return instance
}
if (import.meta.hot) import.meta.hot.dispose(() => instance?.dispose())
