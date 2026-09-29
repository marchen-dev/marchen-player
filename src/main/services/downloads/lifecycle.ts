import { app, dialog } from 'electron'
import { existingDownloads, getDownloads } from './service'
export function initializeDownloads() {
  getDownloads()
  let allowed = false
  let stopping = false
  app.on('before-quit', (event) => {
    if (allowed) return
    event.preventDefault()
    if (stopping) return
    stopping = true
    void (async () => {
      try {
        const service = existingDownloads()
        if (service?.hasActive()) {
          const answer = await dialog.showMessageBox({
            type: 'question',
            message: '还有下载或做种任务，退出后将停止，重新打开可恢复。',
            buttons: ['取消', '退出'],
            defaultId: 0,
            cancelId: 0,
          })
          if (answer.response !== 1) return
        }
        await service?.shutdown()
        allowed = true
        app.quit()
      } catch {
        await dialog.showMessageBox({
          type: 'error',
          message: '下载任务保存失败，暂未退出，请检查磁盘后重试。',
        })
      } finally {
        stopping = false
      }
    })()
  })
}
