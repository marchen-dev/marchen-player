import type { PlaybackDecision, PlaybackPlan } from '@marchen/shared/media'

/** 迁移期 IPC 的档位投影；执行仍以 decision 的独立视频/音频动作编译。 */
export const decisionOutputProfile = (decision: PlaybackDecision): PlaybackPlan => {
  const streams = {
    videoStreamIndex: decision.video.streamIndex,
    audioStreamIndex: decision.audio?.streamIndex,
  }
  if (decision.method === 'direct-play')
    return { ...streams, kind: 'native', reason: 'native-compatible' }
  const audio =
    decision.audio?.action === 'transcode'
      ? {
          codec: 'aac' as const,
          profile: 'aac_low' as const,
          sampleRate: decision.audio.sampleRate,
          channels: decision.audio.channels,
        }
      : undefined
  if (decision.method === 'direct-stream')
    return {
      ...streams,
      kind: 'copy-video-aac',
      reason: audio ? 'audio-incompatible' : 'container-incompatible',
      video: 'copy',
      audio,
      startupDeadlineMs: 10_000,
    }
  return decision.video.toneMap === 'hdr-to-sdr'
    ? {
        ...streams,
        kind: 'hdr-to-sdr-h264-aac',
        reason: 'video-incompatible',
        video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: true },
        audio,
      }
    : {
        ...streams,
        kind: 'safe-h264-aac-sdr',
        reason: 'video-incompatible',
        video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: false },
        audio,
      }
}
