import type {
  MediaSourceInput,
  MediaSourceResult,
  ProviderMediaLease,
} from '@marchen/shared/media-sources'
import { createProviderMediaLease } from '@main/lib/media-protocol'
import { tipc } from '@marchen/electron-ipc/main'
import { getMediaSources } from '../services/media-sources'
import { toMediaSourceError } from '../services/media-sources/errors'
import { getMainWindow } from '../windows/main'

const t = tipc.create()

/** Error 的自定义字段跨 IPC 会丢失，统一转为带稳定错误码的结果对象。 */
async function run<T>(
  sender: Electron.WebContents,
  action: () => Promise<T>,
): Promise<MediaSourceResult<T>> {
  if (getMainWindow()?.webContents !== sender)
    return { ok: false, code: 'invalid_input', message: '媒体源请求来源无效' }
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    const mapped = toMediaSourceError(error)
    return { ok: false, code: mapped.code, message: mapped.message }
  }
}

export const mediaSourcesGroup = {
  list: t.procedure.action(({ context }) => run(context.sender, () => getMediaSources().list())),
  add: t.procedure
    .input<MediaSourceInput>()
    .action(({ context, input }) => run(context.sender, () => getMediaSources().add(input))),
  update: t.procedure
    .input<{ id: string; input: MediaSourceInput }>()
    .action(({ context, input }) =>
      run(context.sender, () => getMediaSources().update(input.id, input.input)),
    ),
  relogin: t.procedure
    .input<{ id: string; password: string }>()
    .action(({ context, input }) =>
      run(context.sender, () => getMediaSources().relogin(input.id, input.password)),
    ),
  remove: t.procedure
    .input<{ id: string }>()
    .action(({ context, input }) => run(context.sender, () => getMediaSources().remove(input.id))),
  browse: t.procedure
    .input<{ sourceId: string; ref: string | null }>()
    .action(({ context, input }) =>
      run(context.sender, () =>
        getMediaSources().use(input.sourceId, (provider) => provider.browse(input.ref)),
      ),
    ),
  siblings: t.procedure
    .input<{ sourceId: string; itemRef: string }>()
    .action(({ context, input }) =>
      run(context.sender, () =>
        getMediaSources().use(input.sourceId, (provider) => provider.siblings(input.itemRef)),
      ),
    ),
  subtitles: t.procedure
    .input<{ sourceId: string; itemRef: string }>()
    .action(({ context, input }) =>
      run(context.sender, () =>
        getMediaSources().use(input.sourceId, (provider) => provider.subtitles(input.itemRef)),
      ),
    ),
  readSubtitle: t.procedure
    .input<{ sourceId: string; itemRef: string; subtitleId: string }>()
    .action(({ context, input }) =>
      run(context.sender, () =>
        getMediaSources().use(input.sourceId, (provider) =>
          provider.readSubtitle(input.itemRef, input.subtitleId),
        ),
      ),
    ),
  /** 上游地址与鉴权头只在主进程内使用；renderer 只拿到 marchen://media 租约地址 */
  createMediaLease: t.procedure
    .input<{ sourceId: string; itemRef: string; id: string }>()
    .action(({ context, input }) =>
      run(context.sender, async (): Promise<ProviderMediaLease> => {
        const registry = getMediaSources()
        const kind = await registry.kindOf(input.sourceId)
        const lease = await registry.use(input.sourceId, async (provider) => {
          const target = await provider.resolvePlayback(input.itemRef)
          return createProviderMediaLease(
            {
              ...target,
              headers: provider.authHeaders(),
              origin: provider.origin,
              sourceId: input.sourceId,
            },
            input.id,
            context.sender,
          )
        })
        return { ...lease, kind }
      }),
    ),
}
