import type { VideoInfo } from '@marchen/player-loading'
import type { ProviderMediaSource, RemoteMediaSource } from '@marchen/shared/media'
import type { openRemoteSource } from '@renderer/services/media/remote-source'
import { REMOTE_LIMITS } from '@marchen/shared/media/remote'
import { jotaiStore } from '@renderer/atoms/store'
import { retainRemoteImport } from '@renderer/services/media/remote-handoff'
import { remoteImportProgressAtom } from '@renderer/services/media/remote-progress'
import SparkMD5 from 'spark-md5'

export type RangedResource = Awaited<ReturnType<typeof openRemoteSource>>

export interface RangedImportResult {
  result: 'success' | 'failed' | 'cancelled'
  durationMs: number
  fingerprint: boolean
  receivedBytes: number
  /** 失败时的原始异常，供各来源映射自己的错误码 */
  error?: unknown
}

interface RangedImportOptions<S extends RemoteMediaSource | ProviderMediaSource> {
  open: (
    signal: AbortSignal,
    onProgress: (received: number, total: number) => void,
  ) => Promise<RangedResource>
  /** 读到识别前缀后决定记录身份；可在这里核对旧记录，失败时抛错且不移交租约 */
  createSource: (range: RangedResource, matchHash: string | undefined) => Promise<S>
  /** 每个来源类型各自上报结果事件 */
  report: (outcome: RangedImportResult) => void
  signal: AbortSignal
}

/**
 * 网络来源共用的导入流程：开租约 → 读 16MB 识别前缀算指纹 → 移交租约给加载会话 → 上报。
 * HTTP 直链与媒体源条目只在「怎么开租约」「怎么构造 source」上不同。
 */
export async function importRangedVideo<S extends RemoteMediaSource | ProviderMediaSource>({
  open,
  createSource,
  report,
  signal,
}: RangedImportOptions<S>): Promise<VideoInfo> {
  const lifetime = new AbortController()
  const cancel = () => lifetime.abort()
  signal.throwIfAborted()
  signal.addEventListener('abort', cancel, { once: true })
  let range: RangedResource | undefined
  let retained = false
  const startedAt = performance.now()
  let receivedBytes = 0
  let fingerprint = false
  let succeeded = false
  let importing = true
  const progressId = crypto.randomUUID()
  let lastProgress = 0
  let failure: unknown
  jotaiStore.set(remoteImportProgressAtom, {
    id: progressId,
    stage: 'connecting',
    received: 0,
    total: 0,
  })
  try {
    range = await open(lifetime.signal, (received, total) => {
      if (
        !importing ||
        signal.aborted ||
        jotaiStore.get(remoteImportProgressAtom)?.id !== progressId
      )
        return
      receivedBytes = received
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
      receivedBytes = bytes.byteLength
      matchHash = SparkMD5.ArrayBuffer.hash(bytes.buffer as ArrayBuffer)
      fingerprint = true
    } catch {
      signal.throwIfAborted() /* 指纹缺失不阻止首次播放。 */
    }
    const source = await createSource(range, matchHash)
    signal.throwIfAborted()
    // 导入成功后生命周期转给加载会话；跳过弹幕只取消匹配，不撤销媒体租约。
    retainRemoteImport(source, {
      ...range,
      close: () => {
        lifetime.abort()
        range!.close()
      },
    })
    retained = true
    succeeded = true
    return {
      source,
      hash: source.hash,
      matchHash,
      name: source.name,
      size: source.size,
      playList: [],
    }
  } catch (error) {
    failure = error
    throw error
  } finally {
    report({
      result: signal.aborted ? 'cancelled' : succeeded ? 'success' : 'failed',
      durationMs: Math.round(performance.now() - startedAt),
      fingerprint,
      receivedBytes,
      error: failure,
    })
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
