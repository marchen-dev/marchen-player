import type { MediaPresentation } from '@marchen/playback-core'

export interface PlaybackInfoRow {
  label: string
  value: string
}
export const createPlaybackInfoRows = (info: MediaPresentation | undefined): PlaybackInfoRow[] => {
  if (!info) return []
  const backend = {
    native: '浏览器原生',
    webcodecs: 'WebCodecs',
    'hevc-wasm': 'HEVC 软件解码',
    unknown: '准备中',
  }[info.backend]
  const rows = [{ label: '视频解码', value: backend }]
  if (info.width && info.height)
    rows.push({ label: '画面尺寸', value: `${info.width} × ${info.height}` })
  if (info.videoFrameRate && Number.isFinite(info.videoFrameRate) && info.videoFrameRate > 0)
    rows.push({
      label: '视频帧率',
      value: `约 ${Number(info.videoFrameRate.toFixed(3))} fps`,
    })
  rows.push({
    label: '实时解码 FPS',
    value:
      info.decodeFps !== undefined && Number.isFinite(info.decodeFps) && info.decodeFps >= 0
        ? `${info.decodeFps.toFixed(1)} fps`
        : '暂无数据',
  })
  if (info.colorOutput)
    rows.push({ label: '颜色输出', value: info.colorOutput === 'hdr-to-sdr' ? 'HDR → SDR' : 'SDR' })
  if (info.decodeThreads) rows.push({ label: '解码线程', value: String(info.decodeThreads) })
  if (info.decoderWorkerCount)
    rows.push({ label: '工作线程池', value: `${info.decoderWorkerCount}（含调度线程）` })
  if (info.linearMemoryBytes)
    rows.push({
      label: 'WASM 线性内存',
      value: `${(info.linearMemoryBytes / 1024 / 1024).toFixed(1)} MiB`,
    })
  if (info.fallbackReason) rows.push({ label: '解码说明', value: info.fallbackReason })
  return rows
}
