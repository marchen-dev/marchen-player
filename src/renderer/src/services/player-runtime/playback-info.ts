import type { MediaPresentation } from '@marchen/playback-core'
import { t } from '@renderer/lib/i18n'

/** 解码说明的原因码：多线程运行时不可用，退回单线程。兼容内核的适配层写入，这里负责显示 */
export const SINGLE_THREAD_FALLBACK = 'single-thread-fallback'

export interface PlaybackInfoRow {
  label: string
  value: string
}
export const createPlaybackInfoRows = (info: MediaPresentation | undefined): PlaybackInfoRow[] => {
  if (!info) return []
  // WebCodecs 是接口名，不翻译
  const backend =
    info.backend === 'webcodecs' ? 'WebCodecs' : t(`player:mediaInfo.backend.${info.backend}`)
  // t() 的返回类型是具体的文案字面量，这里显式标成普通字符串数组
  const rows: PlaybackInfoRow[] = [{ label: t('player:mediaInfo.decoder'), value: backend }]
  if (info.presenter) rows.push({ label: t('player:mediaInfo.presenter'), value: 'video' })
  if (info.sourceTransfer)
    rows.push({ label: t('player:mediaInfo.transfer'), value: info.sourceTransfer })
  if (info.width && info.height)
    rows.push({ label: t('player:mediaInfo.size'), value: `${info.width} × ${info.height}` })
  if (info.videoFrameRate && Number.isFinite(info.videoFrameRate) && info.videoFrameRate > 0)
    rows.push({
      label: t('player:mediaInfo.frameRate'),
      value: t('player:mediaInfo.frameRateValue', {
        fps: Number(info.videoFrameRate.toFixed(3)),
      }),
    })
  rows.push({
    label: t('player:mediaInfo.decodeFps'),
    value:
      info.decodeFps !== undefined && Number.isFinite(info.decodeFps) && info.decodeFps >= 0
        ? `${info.decodeFps.toFixed(1)} fps`
        : t('player:mediaInfo.noData'),
  })
  if (info.colorOutput)
    rows.push({
      label: t('player:mediaInfo.colorOutput'),
      value:
        info.colorOutput === 'browser-managed'
          ? t('player:mediaInfo.browserManaged')
          : info.colorOutput === 'hdr-to-sdr'
            ? 'HDR → SDR'
            : 'SDR',
    })
  if (info.decodeThreads)
    rows.push({ label: t('player:mediaInfo.threads'), value: String(info.decodeThreads) })
  if (info.decoderWorkerCount)
    rows.push({
      label: t('player:mediaInfo.workers'),
      value: t('player:mediaInfo.workersValue', { total: info.decoderWorkerCount }),
    })
  if (info.linearMemoryBytes)
    rows.push({
      label: t('player:mediaInfo.memory'),
      value: `${(info.linearMemoryBytes / 1024 / 1024).toFixed(1)} MiB`,
    })
  if (info.fallbackReason)
    rows.push({
      label: t('player:mediaInfo.note'),
      // 说明以原因码传递，在这里换成当前语言的文字；未知的原因码原样显示
      value:
        info.fallbackReason === SINGLE_THREAD_FALLBACK
          ? t('player:mediaInfo.singleThreadFallback')
          : info.fallbackReason,
    })
  return rows
}
