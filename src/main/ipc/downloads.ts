import type { DownloadInput, DownloadResult, DownloadSettings } from '@marchen/shared/downloads'
import { tipc } from '@marchen/electron-ipc/main'
import { dialog, shell } from 'electron'
import { isMediaPathInUse } from '../lib/media-protocol'
import { getDownloads } from '../services/downloads/service'
import { getMainWindow } from '../windows/main'
const t = tipc.create()
async function run<T>(
  sender: Electron.WebContents,
  action: () => Promise<T>,
): Promise<DownloadResult<T>> {
  if (getMainWindow()?.webContents !== sender) return { ok: false, message: '下载请求来源无效' }
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '下载操作失败' }
  }
}
export const downloadsGroup = {
  list: t.procedure.action(({ context }) => run(context.sender, () => getDownloads().list())),
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
  policy: t.procedure
    .input<{ id: string; policy: DownloadSettings['policy'] }>()
    .action(({ context, input }) =>
      run(context.sender, () => getDownloads().setPolicy(input.id, input.policy)),
    ),
  selectTorrent: t.procedure.action(({ context }) =>
    run(context.sender, async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'BT 种子', extensions: ['torrent'] }],
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
