import type { VideoInfo } from '@marchen/player-loading'
import { db } from '@renderer/database/db'
import { openRemoteSource } from '@renderer/services/media/remote-source'
import { telemetry } from '@renderer/services/telemetry/client'
import { importRangedVideo } from './ranged-import'

/** 先核对候选，成功前不更改旧历史来源。 */
export async function importRemoteVideo(
  url: string,
  recordId?: string,
  signal = new AbortController().signal,
): Promise<VideoInfo> {
  return importRangedVideo({
    signal,
    open: (lifetime, onProgress) => openRemoteSource(url, lifetime, onProgress),
    async createSource(range, matchHash) {
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
      return {
        kind: 'remote-url' as const,
        hash: recordId ?? `remote:${crypto.randomUUID()}`,
        url,
        size: range.size,
        name: range.name,
        fingerprint: matchHash
          ? { algorithm: 'md5-prefix-16m' as const, value: matchHash }
          : undefined,
      }
    },
    report: (outcome) =>
      telemetry.capture('remote_import_result', {
        result: outcome.result,
        duration_ms: outcome.durationMs,
        fingerprint: outcome.fingerprint,
        restoring: Boolean(recordId),
        received_bytes: outcome.receivedBytes,
        ...(outcome.result === 'failed' ? { error_code: 'remote_import_failed' as const } : {}),
      }),
  })
}
