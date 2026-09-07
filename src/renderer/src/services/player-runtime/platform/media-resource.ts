import type { DurableMediaSource } from '@marchen/shared/media'
import type { CanvasResource } from '../../media/canvas/media-adapter'
import { openRangeSource } from '../../media/range-source'
import { MediaSourceOwner } from '../../media/source-owner'

/** 原生 URL 与 Canvas 读取描述共用一份平台授权；关闭内核不提前撤销其他消费者的租约。 */
export async function openPlaybackResource(source: DurableMediaSource, signal: AbortSignal) {
  signal.throwIfAborted()
  let release: () => void
  let url: string
  let owner: MediaSourceOwner
  let canvasSource: CanvasResource['source']
  if (source.kind === 'web-file') {
    url = URL.createObjectURL(source.file)
    release = () => URL.revokeObjectURL(url)
    owner = new MediaSourceOwner({ kind: 'web', file: source.file })
    canvasSource = { kind: 'file', file: source.file }
  } else {
    const { ipcClient } = await import('@renderer/lib/client')
    const lease = await ipcClient?.player.createMediaLease({ path: source.path })
    if (!lease) throw new Error('本地文件访问不可用')
    url = lease.url
    release = () => {
      void ipcClient?.player.releaseMediaLease({ id: lease.id })
    }
    try {
      signal.throwIfAborted()
      const range = await openRangeSource(url, signal)
      owner = new MediaSourceOwner({ kind: 'electron', source: range, release })
    } catch (error) {
      release()
      throw error
    }
    canvasSource = { kind: 'url', url }
  }
  const primary = owner.acquire()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    signal.removeEventListener('abort', close)
    owner.close()
    if (source.kind === 'web-file') release()
  }
  signal.addEventListener('abort', close, { once: true })
  if (signal.aborted) {
    close()
    signal.throwIfAborted()
  }
  return {
    id: crypto.randomUUID(),
    url,
    metadata: primary.metadata,
    input: primary.input,
    acquire: () => owner.acquire(),
    canvas: (): CanvasResource => {
      const lease = owner.acquire()
      return {
        source: canvasSource,
        assetBase: new URL(`${import.meta.env.BASE_URL}wasm/libav/0.1.1/`, globalThis.location.href)
          .href,
        release: lease.release,
      }
    },
    close,
  }
}
export type PlaybackResource = Awaited<ReturnType<typeof openPlaybackResource>>
