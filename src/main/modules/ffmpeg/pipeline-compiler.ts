import type {
  PlaybackDecision,
  PlaybackPlanReason,
  RemuxPlaybackPlan,
  TranscodeAudioPlaybackPlan,
  TranscodeVideoPlaybackPlan,
} from '@marchen/shared/media'

export type CompiledMediaPipeline =
  | { kind: 'direct' }
  | { kind: 'remux'; plan: RemuxPlaybackPlan }
  | { kind: 'audio-compatible'; plan: TranscodeAudioPlaybackPlan }
  | { kind: 'video-compatible'; plan: TranscodeVideoPlaybackPlan }
  | { kind: 'hdr-compatible'; plan: TranscodeVideoPlaybackPlan }

const legacyReason = (decision: PlaybackDecision): PlaybackPlanReason => {
  if (decision.method === 'direct-play') return 'native-compatible'
  if (decision.method === 'transcode') return 'video-incompatible'
  return decision.audio?.action === 'transcode' ? 'audio-incompatible' : 'container-incompatible'
}

const aacPlan = (
  audio: Extract<NonNullable<PlaybackDecision['audio']>, { action: 'transcode' }>,
) => ({
  codec: 'aac' as const,
  profile: 'aac_low' as const,
  sampleRate: audio.sampleRate,
  channels: audio.channels,
})

export const compilePlaybackDecision = (decision: PlaybackDecision): CompiledMediaPipeline => {
  if (decision.method === 'direct-play') return { kind: 'direct' }
  const reason = legacyReason(decision)
  if (decision.method === 'direct-stream') {
    if (!decision.audio || decision.audio.action === 'copy') {
      return {
        kind: 'remux',
        plan: {
          kind: 'remux',
          reason,
          videoStreamIndex: decision.video.streamIndex,
          audioStreamIndex: decision.audio?.streamIndex,
          video: 'copy',
          audio: 'copy',
        },
      }
    }
    return {
      kind: 'audio-compatible',
      plan: {
        kind: 'transcode-audio',
        reason,
        videoStreamIndex: decision.video.streamIndex,
        audioStreamIndex: decision.audio.streamIndex,
        video: 'copy',
        audio: aacPlan(decision.audio),
      },
    }
  }

  const audio =
    !decision.audio || decision.audio.action === 'copy' ? 'copy' : aacPlan(decision.audio)
  const plan: TranscodeVideoPlaybackPlan = {
    kind: 'transcode-video',
    reason,
    videoStreamIndex: decision.video.streamIndex,
    audioStreamIndex: decision.audio?.streamIndex,
    video: {
      codec: 'h264',
      toneMapToSdr: decision.video.toneMap === 'hdr-to-sdr',
    },
    audio,
  }
  return decision.video.toneMap === 'hdr-to-sdr'
    ? { kind: 'hdr-compatible', plan }
    : { kind: 'video-compatible', plan }
}
