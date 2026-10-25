import type { VideoInfo } from '@marchen/player-loading'
import type { MediaSourceKind } from '@marchen/shared/media-sources'
import { providerHistoryKey } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { db } from '@renderer/database/db'
import { openProviderSource } from '@renderer/services/media/provider-source'
import { telemetry } from '@renderer/services/telemetry/client'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { importRangedVideo } from './ranged-import'

/**
 * 打开媒体源条目。记录主键由「来源 + 条目」确定，再次打开直接命中原记录。
 *
 * 与 HTTP 直链不同：条目身份由路径决定，服务器上文件被替换属于正常情况，
 * 所以指纹或大小不一致时清空旧记录（进度、匹配、弹幕）并提示，而不是拒绝播放。
 */
export async function importProviderVideo(
  sourceId: string,
  itemRef: string,
  signal = new AbortController().signal,
): Promise<VideoInfo> {
  const hash = providerHistoryKey(sourceId, itemRef)
  let provider: MediaSourceKind | undefined
  let restoring = false
  return importRangedVideo({
    signal,
    async open(lifetime, onProgress) {
      const resource = await openProviderSource(sourceId, itemRef, lifetime, onProgress)
      provider = resource.kind
      return resource
    },
    async createSource(range, matchHash) {
      const previous = await db.history.get(hash)
      signal.throwIfAborted()
      restoring = Boolean(previous)
      const old = previous?.source?.kind === 'provider-item' ? previous.source : undefined
      const changed =
        old &&
        (old.size !== range.size ||
          (matchHash !== undefined &&
            old.fingerprint !== undefined &&
            old.fingerprint.value !== matchHash))
      if (changed) {
        await db.history.delete(hash)
        restoring = false
        void notifyContentChanged()
      }
      return {
        kind: 'provider-item' as const,
        hash,
        sourceId,
        provider: provider!,
        itemRef,
        size: range.size,
        name: range.name,
        // 内容已变化时旧指纹属于旧文件，不能沿用；否则这次没读到指纹，下次读到时会再判一次变化并误删新进度
        fingerprint: matchHash
          ? { algorithm: 'md5-prefix-16m' as const, value: matchHash }
          : changed
            ? undefined
            : old?.fingerprint,
      }
    },
    report: (outcome) => {
      // 用户取消（切走、关闭）不算失败；错误码来自 MediaSourceError.code，作为稳定 fingerprint
      if (outcome.result === 'failed')
        reportOperationalError('ipc', 'media_source_open', outcome.error)
      void (async () => {
        // 打开租约就失败时还不知道来源类型，从来源列表补查；查不到（已移除）则不上报
        const kind = provider ?? (await lookupKind(sourceId))
        if (!kind) return
        telemetry.capture('media_source_open_result', {
          provider: kind,
          result: outcome.result,
          duration_ms: outcome.durationMs,
          fingerprint: outcome.fingerprint,
          restoring,
          received_bytes: outcome.receivedBytes,
          ...(outcome.result === 'failed'
            ? {
                error_code:
                  outcome.error instanceof MediaSourceError
                    ? outcome.error.code
                    : 'invalid_response',
              }
            : {}),
        })
      })()
    },
  })
}

async function lookupKind(sourceId: string): Promise<MediaSourceKind | undefined> {
  try {
    const { ipcClient } = await import('@renderer/lib/client')
    const result = await ipcClient?.mediaSources.list()
    return result?.ok ? result.value.find((source) => source.id === sourceId)?.kind : undefined
  } catch {
    return undefined
  }
}

/** 加载层不直接依赖 UI；按需加载 toast，失败也不影响播放 */
async function notifyContentChanged() {
  try {
    const { toast } = await import('@renderer/components/ui/toast')
    toast({ title: '视频内容已变化', description: '已作为新视频重新匹配弹幕，旧进度已清除' })
  } catch {
    /* 提示失败不影响加载 */
  }
}
