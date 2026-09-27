import type { DurableMediaSource } from '@marchen/shared/media'
import type { openRemoteSource } from './remote-source'

type RemoteResource = Awaited<ReturnType<typeof openRemoteSource>>
/** 会话持有基础引用，主播放另取引用；宿主重新挂载不能提前释放已读前缀。 */
const pending = new WeakMap<
  DurableMediaSource,
  { resource: RemoteResource; release: () => void; acquire: () => () => void }
>()

export function retainRemoteImport(source: DurableMediaSource, resource: RemoteResource) {
  releaseRemoteImport(source)
  let references = 1
  const release = () => {
    if (--references === 0) resource.close()
  }
  pending.set(source, {
    resource,
    release,
    acquire: () => {
      references++
      return release
    },
  })
}

export function takeRemoteImport(source: DurableMediaSource, signal: AbortSignal) {
  signal.throwIfAborted()
  const entry = pending.get(source)
  if (!entry) return
  const release = entry.acquire()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    signal.removeEventListener('abort', close)
    release()
  }
  signal.addEventListener('abort', close, { once: true })
  return { ...entry.resource, close }
}

/** 加载取消、失败、换片和销毁释放会话引用；主播放仍独立管理自己的引用。 */
export function releaseRemoteImport(source: DurableMediaSource) {
  const entry = pending.get(source)
  pending.delete(source)
  entry?.release()
}
