import { app, dialog } from 'electron'
import { t } from '../../lib/i18n'
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
            message: t('main:dialog.downloadsQuitConfirm'),
            buttons: [t('common:action.cancel'), t('main:dialog.quit')],
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
          message: t('main:dialog.downloadsSaveFailed'),
        })
      } finally {
        stopping = false
      }
    })()
  })
}
