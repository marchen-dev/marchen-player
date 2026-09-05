import type { PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'

export interface PlaybackInfoRow {
  label: string
  value: string
}

const actionLabel = (action: string): string =>
  ({ direct: '直接播放', remux: '重封装', copy: '复制', transcode: '转码' })[action] ?? action

const methodLabel = (method: string): string =>
  ({ 'direct-play': 'Direct Play', 'direct-stream': 'Direct Stream', transcode: 'Full Transcode' })[
    method
  ] ?? method

const processor = (name: string, className: string): string => `${name} (${className})`

export const createPlaybackInfoRows = (
  lease: PlaybackSourceLeaseDescriptor | undefined,
): PlaybackInfoRow[] => {
  if (!lease) return []
  const rows: PlaybackInfoRow[] = [
    {
      label: '传输',
      value: `${lease.transport}${lease.hlsSessionMode ? ` / ${lease.hlsSessionMode}` : ''}`,
    },
  ]
  const decision = lease.decision
  if (decision) {
    rows.unshift({ label: '方式', value: methodLabel(decision.method) })
    rows.push({ label: '容器', value: actionLabel(decision.container.action) })
    const videoTarget =
      decision.video.action === 'transcode'
        ? decision.video.targetCodec
        : decision.video.sourceCodec
    rows.push({
      label: '视频',
      value: `${decision.video.sourceCodec} → ${videoTarget} / ${actionLabel(decision.video.action)}`,
    })
    if (decision.audio) {
      const audioTarget =
        decision.audio.action === 'transcode'
          ? decision.audio.targetCodec
          : decision.audio.sourceCodec
      rows.push({
        label: '音频',
        value: `${decision.audio.sourceCodec} → ${audioTarget} / ${actionLabel(decision.audio.action)}`,
      })
    }
    if (decision.video.action === 'transcode' && decision.video.toneMap === 'hdr-to-sdr') {
      rows.push({ label: 'HDR', value: 'HDR → SDR' })
    }
    if (decision.reasons.length > 0) {
      rows.push({
        label: '处理原因',
        value: decision.reasons.map((reason) => reason.code).join(', '),
      })
    }
  } else {
    rows.unshift({ label: '方式', value: lease.mode })
    if (lease.profile) rows.push({ label: '迁移档位', value: lease.profile })
  }
  const job = lease.job
  if (job?.runtime.videoDecoder) {
    rows.push({
      label: 'Video decoder',
      value: processor(job.runtime.videoDecoder.name, job.runtime.videoDecoder.class),
    })
  }
  rows.push(
    ...(job
      ? [
          {
            label: 'Video encoder',
            value: processor(job.runtime.videoEncoder.name, job.runtime.videoEncoder.class),
          },
        ]
      : []),
  )
  if (job?.runtime.audioEncoder) {
    rows.push({
      label: 'Audio encoder',
      value: processor(job.runtime.audioEncoder.name, job.runtime.audioEncoder.class),
    })
  }
  if (lease.attemptMethods?.length) {
    rows.push({ label: 'Attempt chain', value: lease.attemptMethods.map(methodLabel).join(' → ') })
  }
  return rows
}
