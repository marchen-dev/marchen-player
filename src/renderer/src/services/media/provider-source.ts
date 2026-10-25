import { MediaSourceError } from '@marchen/shared/media-sources'
import { openRangeSource } from './range-source'

/**
 * 打开媒体源条目：主进程用来源凭证创建租约，renderer 只拿到 marchen://media 地址。
 * 错误保留稳定错误码，界面据此区分重新登录、来源已移除、不支持范围读取等提示。
 */
export async function openProviderSource(
  sourceId: string,
  itemRef: string,
  signal: AbortSignal,
  onProgress?: (received: number, total: number) => void,
) {
  const { ipcClient } = await import('@renderer/lib/client')
  if (!ipcClient) throw new MediaSourceError('invalid_input', '网页版不支持媒体源，请使用桌面版')
  const id = crypto.randomUUID()
  const close = () => {
    void ipcClient?.player.releaseMediaLease({ id })
  }
  signal.addEventListener('abort', close, { once: true })
  try {
    signal.throwIfAborted()
    const lease = await ipcClient.mediaSources.createMediaLease({ sourceId, itemRef, id })
    if (!lease.ok) throw new MediaSourceError(lease.code, lease.message)
    signal.throwIfAborted()
    const range = await openRangeSource(lease.value.url, signal, onProgress)
    return {
      ...range,
      name: lease.value.name,
      kind: lease.value.kind,
      nativeUrl: lease.value.url,
      internal: true,
      close: () => {
        signal.removeEventListener('abort', close)
        close()
      },
    }
  } catch (error) {
    signal.removeEventListener('abort', close)
    close()
    throw error
  }
}
