import type { DownloadInput, DownloadResult, DownloadSettings } from '@marchen/shared/downloads'
import { tipc } from '@marchen/electron-ipc/main'
import { toFailureResult } from '@marchen/shared/errors'
import { dialog, shell } from 'electron'
import { t as translate } from '../lib/i18n'
import { isMediaPathInUse } from '../lib/media-protocol'
import { DOWNLOAD_FAILURE_FALLBACK } from '../services/downloads/engine-port'
import { getDownloads } from '../services/downloads/service'
import { getMainWindow } from '../windows/main'
const t = tipc.create()
async function run<T>(
  sender: Electron.WebContents,
  action: () => Promise<T>,
): Promise<DownloadResult<T>> {
  if (getMainWindow()?.webContents !== sender)
    return toFailureResult(new Error('下载请求来源无效'), DOWNLOAD_FAILURE_FALLBACK)
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    // 用户错误带上错误码与参数，页面按界面语言显示；其余只有中文说明，英文界面显示概括
    return toFailureResult(error, DOWNLOAD_FAILURE_FALLBACK)
  }
}
export const downloadsGroup = {
  list: t.procedure.action(({ context }) => run(context.sender, () => getDownloads().list())),
  addHttp: t.procedure
    .input<{ url: string; directory: string }>()
    .action(({ context, input }) =>
      run(context.sender, () => getDownloads().addHttp(input.url, input.directory)),
    ),
  prepare: t.procedure
    .input<{ id: string; source: DownloadInput }>()
    .action(({ context, input }) =>
      run(context.sender, () => getDownloads().prepare(input.id, input.source)),
    ),
  cancelDraft: t.procedure
    .input<{ id: string }>()
    .action(({ context, input }) => run(context.sender, () => getDownloads().cancel(input.id))),
  confirm: t.procedure
    .input<{ id: string; selected: number[]; directory: string }>()
    .action(({ context, input }) =>
      run(context.sender, () => getDownloads().confirm(input.id, input.selected, input.directory)),
    ),
  peers: t.procedure
    .input<{ id: string }>()
    .action(({ context, input }) => run(context.sender, () => getDownloads().peers(input.id))),
  selectFiles: t.procedure
    .input<{ id: string; selected: number[] }>()
    .action(({ context, input }) =>
      run(context.sender, () => getDownloads().selectFiles(input.id, input.selected)),
    ),
  pause: t.procedure
    .input<{ id: string }>()
    .action(({ context, input }) => run(context.sender, () => getDownloads().pause(input.id))),
  resume: t.procedure
    .input<{ id: string }>()
    .action(({ context, input }) => run(context.sender, () => getDownloads().resume(input.id))),
  remove: t.procedure
    .input<{ id: string; deleteFiles: boolean }>()
    .action(({ context, input }) =>
      run(context.sender, () =>
        getDownloads().remove(input.id, input.deleteFiles, isMediaPathInUse),
      ),
    ),
  play: t.procedure
    .input<{ id: string; index: number }>()
    .action(({ context, input }) =>
      run(context.sender, () => getDownloads().filePath(input.id, input.index)),
    ),
  openFolder: t.procedure.input<{ id: string }>().action(({ context, input }) =>
    run(context.sender, async () => {
      const error = await shell.openPath(await getDownloads().directory(input.id))
      if (error) throw new Error(error)
    }),
  ),
  settings: t.procedure
    .input<DownloadSettings>()
    .action(({ context, input }) => run(context.sender, () => getDownloads().setSettings(input))),
  selectTorrent: t.procedure.action(({ context }) =>
    run(context.sender, async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: translate('main:fileDialog.torrent'), extensions: ['torrent'] }],
      })
      return result.canceled ? null : result.filePaths[0]
    }),
  ),
  selectDirectory: t.procedure.action(({ context }) =>
    run(context.sender, async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      })
      return result.canceled ? null : result.filePaths[0]
    }),
  ),
}
