import type { VideoInfo } from '@marchen/player-loading'
import { REMOTE_LIMITS } from '@marchen/shared/media/remote'
import { jotaiStore } from '@renderer/atoms/store'
import { db } from '@renderer/database/db'
import { retainRemoteImport } from '@renderer/services/media/remote-handoff'
import { remoteImportProgressAtom } from '@renderer/services/media/remote-progress'
import { openRemoteSource } from '@renderer/services/media/remote-source'
import SparkMD5 from 'spark-md5'

/** 先核对候选，成功前不更改旧历史来源。 */
export async function importRemoteVideo(
  url: string,
  recordId?: string,
  signal = new AbortController().signal,
): Promise<VideoInfo> {
  const lifetime = new AbortController()
  const cancel = () => lifetime.abort()
  signal.throwIfAborted()
  signal.addEventListener('abort', cancel, { once: true })
  let range: Awaited<ReturnType<typeof openRemoteSource>> | undefined
  let retained = false
  let importing = true
  const progressId = crypto.randomUUID()
  let lastProgress = 0
  jotaiStore.set(remoteImportProgressAtom, {
    id: progressId,
    stage: 'connecting',
    received: 0,
    total: 0,
  })
  try {
    range = await openRemoteSource(url, lifetime.signal, (received, total) => {
      if (
        !importing ||
        signal.aborted ||
        jotaiStore.get(remoteImportProgressAtom)?.id !== progressId
      )
        return
      const now = performance.now()
      if (received !== 0 && received !== total && now - lastProgress < 250) return
      lastProgress = now
      jotaiStore.set(remoteImportProgressAtom, {
        id: progressId,
        stage: 'reading',
        received,
        total,
      })
    })
    let matchHash: string | undefined
    try {
      const bytes = await range.read(
        0,
        Math.min(range.size, 16 * 1024 * 1024),
        AbortSignal.any([signal, AbortSignal.timeout(REMOTE_LIMITS.fingerprintTimeout)]),
      )
      matchHash = SparkMD5.ArrayBuffer.hash(bytes.buffer as ArrayBuffer)
    } catch {
      signal.throwIfAborted() /* 指纹缺失不阻止首次播放。 */
    }
    const previous = recordId ? await db.history.get(recordId) : undefined
    signal.throwIfAborted()
    if (
      recordId &&
      (previous?.source?.kind !== 'remote-url' ||
        !matchHash ||
        previous.source.fingerprint?.value !== matchHash ||
        previous.source.size !== range.size)
    )
      throw new Error('无法确认与原视频内容一致，请作为新视频打开或更换链接')
    const hash = recordId ?? `remote:${crypto.randomUUID()}`
    const source = {
      kind: 'remote-url' as const,
      hash,
      url,
      size: range.size,
      name: range.name,
      fingerprint: matchHash
        ? { algorithm: 'md5-prefix-16m' as const, value: matchHash }
        : undefined,
    }
    // 导入成功后生命周期转给加载会话；跳过弹幕只取消匹配，不撤销媒体租约。
    retainRemoteImport(source, {
      ...range,
      close: () => {
        lifetime.abort()
        range!.close()
      },
    })
    retained = true
    return { source, hash, matchHash, name: source.name, size: source.size, playList: [] }
  } finally {
    importing = false
    if (jotaiStore.get(remoteImportProgressAtom)?.id === progressId)
      jotaiStore.set(remoteImportProgressAtom, null)
    signal.removeEventListener('abort', cancel)
    if (!retained) {
      lifetime.abort()
      range?.close()
    }
  }
}
