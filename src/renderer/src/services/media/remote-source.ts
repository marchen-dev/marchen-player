import { RemoteMediaError, validateRemoteUrl } from '@marchen/shared/media/remote'
import { openRangeSource } from './range-source'

/** 桌面远程读取必须经过受控媒体租约；Web 不发起远程视频请求。 */
export async function openRemoteSource(value: string, signal: AbortSignal) {
  const { ipcClient } = await import('@renderer/lib/client')
  if (!ipcClient) throw new Error('网页版不支持远程视频，请使用桌面版')
  const url = validateRemoteUrl(value)
  const id = crypto.randomUUID()
  const close = () => {
    void ipcClient?.player.releaseMediaLease({ id })
  }
  signal.addEventListener('abort', close, { once: true })
  try {
    signal.throwIfAborted()
    const lease = await ipcClient.player.createRemoteMediaLease({ url, id })
    signal.throwIfAborted()
    const range = await openRangeSource(lease.url, signal)
    return {
      ...range,
      name: lease.name,
      nativeUrl: lease.url,
      internal: true,
      close: () => {
        signal.removeEventListener('abort', close)
        close()
      },
    }
  } catch (error) {
    signal.removeEventListener('abort', close)
    close()
    throw new RemoteMediaError(
      'access',
      error instanceof Error ? error.message : '视频链接无法访问',
    )
  }
}
