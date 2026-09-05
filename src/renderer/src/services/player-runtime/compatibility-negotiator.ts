import type {
  ClientPlaybackProfile,
  CompatibilityReason,
  DevelopmentPlaybackOverride,
  FfmpegNegotiationCapabilities,
  InputMediaFacts,
  MediaAudioStream,
  MediaCompatError,
  MediaVideoStream,
  PlaybackDecision,
} from '@marchen/shared/media'
import { sortCompatibilityReasons } from '@marchen/shared/media'

export interface CompatibilityNegotiationInput {
  facts: InputMediaFacts
  client: ClientPlaybackProfile
  ffmpeg: FfmpegNegotiationCapabilities
  override?: DevelopmentPlaybackOverride
  selectedSubtitleStreamIndex?: number
}

export type CompatibilityNegotiationResult =
  { ok: true; decision: PlaybackDecision } | { ok: false; error: MediaCompatError }

const planningFailure = (
  code: MediaCompatError['code'],
  message: string,
  compatibilityReason?: MediaCompatError['compatibilityReason'],
): CompatibilityNegotiationResult => ({
  ok: false,
  error: {
    code,
    stage: 'planning',
    message,
    recoverable: false,
    compatibilityReason,
  },
})

const primaryVideo = (facts: InputMediaFacts) =>
  facts.streams.find(
    (stream): stream is MediaVideoStream =>
      stream.type === 'video' && stream.index === facts.primaryVideoStreamIndex,
  )

const primaryAudio = (facts: InputMediaFacts) =>
  facts.streams.find(
    (stream): stream is MediaAudioStream =>
      stream.type === 'audio' && stream.index === facts.primaryAudioStreamIndex,
  )

type TransportProfile = ClientPlaybackProfile['direct'] | ClientPlaybackProfile['fmp4Hls']

const selectedSubtitle = (input: CompatibilityNegotiationInput) =>
  input.selectedSubtitleStreamIndex === undefined
    ? undefined
    : input.facts.streams.find(
        (stream) =>
          stream.type === 'subtitle' && stream.index === input.selectedSubtitleStreamIndex,
      )

const subtitleAction = (input: CompatibilityNegotiationInput, profile: TransportProfile) => {
  const stream = selectedSubtitle(input)
  if (!stream) return { supported: true, action: { action: 'external-render' as const } }
  const capability = profile.subtitles.find(
    (subtitle) => subtitle.codecName.toLowerCase() === stream.codecName.toLowerCase(),
  )
  const supported = capability?.supported === true && capability.delivery !== 'drop'
  return {
    supported,
    action: supported
      ? { action: 'external-render' as const, streamIndex: stream.index }
      : { action: 'drop' as const, streamIndex: stream.index },
  }
}

const matchesVideoProfile = (
  video: MediaVideoStream,
  profile: ClientPlaybackProfile['direct']['video'],
): boolean =>
  Boolean(
    profile &&
    profile.conditions.codecName.toLowerCase() === video.codecName.toLowerCase() &&
    (profile.conditions.profile === undefined || profile.conditions.profile === video.profile) &&
    (profile.conditions.level === undefined || profile.conditions.level === video.level) &&
    (profile.conditions.bitDepth === undefined || profile.conditions.bitDepth === video.bitDepth) &&
    profile.conditions.dynamicRange === video.dynamicRange &&
    profile.conditions.width === video.width &&
    profile.conditions.height === video.height &&
    (profile.conditions.frameRate === undefined ||
      profile.conditions.frameRate === (video.averageFrameRate ?? video.frameRate)),
  )

const matchesAudioProfile = (
  audio: MediaAudioStream,
  profile: ClientPlaybackProfile['direct']['audio'],
): boolean =>
  Boolean(
    profile &&
    profile.conditions.codecName.toLowerCase() === audio.codecName.toLowerCase() &&
    (profile.conditions.profile === undefined || profile.conditions.profile === audio.profile) &&
    (profile.conditions.bitDepth === undefined || profile.conditions.bitDepth === audio.bitDepth) &&
    (profile.conditions.channels === undefined || profile.conditions.channels === audio.channels) &&
    (profile.conditions.sampleRate === undefined ||
      profile.conditions.sampleRate === audio.sampleRate),
  )

const reason = (
  code: CompatibilityReason['code'],
  domain: CompatibilityReason['domain'],
  source: CompatibilityReason['source'],
  streamIndex?: number,
  inputValue?: CompatibilityReason['inputValue'],
  supportedValue?: CompatibilityReason['supportedValue'],
): CompatibilityReason => ({
  code,
  domain,
  source,
  streamIndex,
  inputValue,
  supportedValue,
})

const videoReasons = (
  video: MediaVideoStream,
  profile: ClientPlaybackProfile['direct']['video'],
): CompatibilityReason[] => {
  if (!profile || profile.decode.supported === false) {
    return [
      reason('video-codec-not-supported', 'video', 'client-profile', video.index, video.codecName),
    ]
  }
  const conditions = profile.conditions
  const reasons: CompatibilityReason[] = []
  if (conditions.codecName.toLowerCase() !== video.codecName.toLowerCase()) {
    reasons.push(
      reason(
        'video-codec-not-supported',
        'video',
        'client-profile',
        video.index,
        video.codecName,
        conditions.codecName,
      ),
    )
  }
  if (conditions.profile !== undefined && conditions.profile !== video.profile) {
    reasons.push(
      reason(
        'video-profile-not-supported',
        'video',
        'client-profile',
        video.index,
        video.profile,
        conditions.profile,
      ),
    )
  }
  if (conditions.level !== undefined && conditions.level !== video.level) {
    reasons.push(
      reason(
        'video-level-not-supported',
        'video',
        'client-profile',
        video.index,
        video.level,
        conditions.level,
      ),
    )
  }
  if (conditions.bitDepth !== undefined && conditions.bitDepth !== video.bitDepth) {
    reasons.push(
      reason(
        'video-bit-depth-not-supported',
        'video',
        'client-profile',
        video.index,
        video.bitDepth,
        conditions.bitDepth,
      ),
    )
  }
  if (conditions.dynamicRange !== video.dynamicRange) {
    reasons.push(
      reason(
        'video-range-not-supported',
        'video',
        'client-profile',
        video.index,
        video.dynamicRange,
        conditions.dynamicRange,
      ),
    )
  }
  if (
    conditions.frameRate !== undefined &&
    conditions.frameRate !== (video.averageFrameRate ?? video.frameRate)
  ) {
    reasons.push(
      reason(
        'video-framerate-not-supported',
        'video',
        'client-profile',
        video.index,
        video.averageFrameRate ?? video.frameRate,
        conditions.frameRate,
      ),
    )
  }
  if (conditions.width !== video.width || conditions.height !== video.height) {
    reasons.push(
      reason(
        'video-resolution-not-supported',
        'video',
        'client-profile',
        video.index,
        `${video.width}x${video.height}`,
        `${conditions.width}x${conditions.height}`,
      ),
    )
  }
  return reasons
}

const audioReasons = (
  audio: MediaAudioStream,
  profile: ClientPlaybackProfile['direct']['audio'],
): CompatibilityReason[] => {
  if (!profile || profile.decode.supported === false) {
    return [
      reason('audio-codec-not-supported', 'audio', 'client-profile', audio.index, audio.codecName),
    ]
  }
  const conditions = profile.conditions
  const reasons: CompatibilityReason[] = []
  if (conditions.codecName.toLowerCase() !== audio.codecName.toLowerCase()) {
    reasons.push(
      reason(
        'audio-codec-not-supported',
        'audio',
        'client-profile',
        audio.index,
        audio.codecName,
        conditions.codecName,
      ),
    )
  }
  if (conditions.profile !== undefined && conditions.profile !== audio.profile) {
    reasons.push(
      reason(
        'audio-profile-not-supported',
        'audio',
        'client-profile',
        audio.index,
        audio.profile,
        conditions.profile,
      ),
    )
  }
  if (conditions.channels !== undefined && conditions.channels !== audio.channels) {
    reasons.push(
      reason(
        'audio-channels-not-supported',
        'audio',
        'client-profile',
        audio.index,
        audio.channels,
        conditions.channels,
      ),
    )
  }
  if (conditions.sampleRate !== undefined && conditions.sampleRate !== audio.sampleRate) {
    reasons.push(
      reason(
        'audio-sample-rate-not-supported',
        'audio',
        'client-profile',
        audio.index,
        audio.sampleRate,
        conditions.sampleRate,
      ),
    )
  }
  if (conditions.bitDepth !== undefined && conditions.bitDepth !== audio.bitDepth) {
    reasons.push(
      reason(
        'audio-bit-depth-not-supported',
        'audio',
        'client-profile',
        audio.index,
        audio.bitDepth,
        conditions.bitDepth,
      ),
    )
  }
  return reasons
}

const processingReasons = (
  input: CompatibilityNegotiationInput,
  video: MediaVideoStream,
  audio: MediaAudioStream | undefined,
  method: 'direct-stream' | 'transcode',
  compatibleSubtitle: ReturnType<typeof subtitleAction>,
): CompatibilityReason[] => {
  const reasons: CompatibilityReason[] = []
  if (method === 'transcode') reasons.push(...videoReasons(video, input.client.fmp4Hls.video))
  if (audio) {
    const canCopy =
      input.client.fmp4Hls.audio?.decode.supported === true &&
      matchesAudioProfile(audio, input.client.fmp4Hls.audio)
    if (!canCopy) reasons.push(...audioReasons(audio, input.client.fmp4Hls.audio))
  }
  const subtitle = selectedSubtitle(input)
  if (subtitle && !compatibleSubtitle.supported) {
    reasons.push(
      reason(
        'subtitle-not-supported',
        'subtitle',
        'client-profile',
        subtitle.index,
        subtitle.codecName,
      ),
    )
  }
  if (input.client.direct.container.supported !== true) {
    reasons.push(reason('container-remux-required', 'container', 'client-profile'))
  }
  if (input.override) {
    reasons.push(reason('development-override', 'runtime', 'development-override'))
  }
  return sortCompatibilityReasons(reasons)
}

const audioTranscodeAction = (audio: MediaAudioStream, override?: DevelopmentPlaybackOverride) => ({
  action: 'transcode' as const,
  streamIndex: audio.index,
  sourceCodec: audio.codecName,
  targetCodec: 'aac' as const,
  profile: 'aac-low-complexity' as const,
  sampleRate: 48_000 as const,
  channels: (audio.channels === 1 ? 1 : 2) as 1 | 2,
  encoderMode: override?.audioEncoderMode,
})

/**
 * 纯协商入口。后续任务逐项扩展条件与原因；这里先固定无副作用的数据流和合法决策形态。
 */
export const negotiateMediaCompatibility = (
  input: CompatibilityNegotiationInput,
): CompatibilityNegotiationResult => {
  const video = primaryVideo(input.facts)
  const audio = primaryAudio(input.facts)
  if (!video) {
    return {
      ok: false,
      error: {
        code: 'probe-failed',
        stage: 'planning',
        message: '媒体缺少可播放的主视频轨道',
        recoverable: false,
      },
    }
  }

  const directSubtitle = subtitleAction(input, input.client.direct)
  const compatibleSubtitle = subtitleAction(input, input.client.fmp4Hls)
  const directVideo = input.client.direct.video?.decode.supported
  const directAudio = input.client.direct.audio?.decode.supported
  const directConditionsMatch =
    matchesVideoProfile(video, input.client.direct.video) &&
    (!audio || matchesAudioProfile(audio, input.client.direct.audio)) &&
    directSubtitle.supported
  const directTrialEligible =
    input.override?.method === undefined &&
    input.client.direct.container.supported !== false &&
    directVideo !== false &&
    (!audio || directAudio !== false) &&
    directConditionsMatch
  if (directTrialEligible) {
    const trial =
      input.client.direct.container.supported !== true ||
      directVideo !== true ||
      Boolean(audio && directAudio !== true)
    return {
      ok: true,
      decision: {
        method: 'direct-play',
        trial,
        container: { action: 'direct' },
        video: { action: 'direct', streamIndex: video.index, sourceCodec: video.codecName },
        audio: audio
          ? { action: 'direct', streamIndex: audio.index, sourceCodec: audio.codecName }
          : undefined,
        subtitle: directSubtitle.action,
        reasons: [],
      },
    }
  }

  const fmp4Video = input.client.fmp4Hls.video?.decode.supported
  const fmp4Audio = input.client.fmp4Hls.audio?.decode.supported
  const canCopyVideo = fmp4Video === true && matchesVideoProfile(video, input.client.fmp4Hls.video)
  const canCopyAudio =
    !audio || (fmp4Audio === true && matchesAudioProfile(audio, input.client.fmp4Hls.audio))
  if (
    input.override?.method !== 'transcode' &&
    input.client.environment === 'electron' &&
    input.client.localCompatibilityAvailable &&
    input.ffmpeg.available &&
    input.ffmpeg.fmp4HlsOutput &&
    input.client.fmp4Hls.container.supported === true &&
    input.client.fmp4Hls.mediaSourceSupported === true &&
    canCopyVideo &&
    (canCopyAudio || input.ffmpeg.aacOutput)
  ) {
    return {
      ok: true,
      decision: {
        method: 'direct-stream',
        trial: false,
        container: { action: 'remux', target: 'fmp4-hls' },
        video: { action: 'copy', streamIndex: video.index, sourceCodec: video.codecName },
        audio: audio
          ? canCopyAudio
            ? { action: 'copy', streamIndex: audio.index, sourceCodec: audio.codecName }
            : audioTranscodeAction(audio, input.override)
          : undefined,
        subtitle: compatibleSubtitle.action,
        reasons: processingReasons(input, video, audio, 'direct-stream', compatibleSubtitle),
      },
    }
  }

  if (input.override?.method === 'direct-stream') {
    return planningFailure(
      'unsupported-video',
      '强制 Direct Stream 时当前视频/容器不满足可复制条件',
    )
  }

  const decodable = input.ffmpeg.decodableCodecs.includes(video.codecName.toLowerCase())
  if (!input.ffmpeg.available || !input.client.localCompatibilityAvailable) {
    return planningFailure('runtime-unavailable', '本地媒体兼容 runtime 当前不可用')
  }
  if (!input.ffmpeg.fmp4HlsOutput) {
    return planningFailure('ffmpeg-format-unavailable', '本地 runtime 缺少 fMP4 HLS 输出能力', {
      code: 'ffmpeg-format-unavailable',
      domain: 'runtime',
      source: 'ffmpeg-runtime',
      supportedValue: 'fmp4-hls',
    })
  }
  if (!input.ffmpeg.h264Output) {
    return planningFailure('ffmpeg-encoder-unavailable', '本地 runtime 缺少 H.264 输出 encoder', {
      code: 'ffmpeg-encoder-unavailable',
      domain: 'runtime',
      source: 'ffmpeg-runtime',
      supportedValue: 'h264',
    })
  }
  if (!decodable) {
    return planningFailure(
      'ffmpeg-decoder-unavailable',
      `本地 runtime 无法解码 ${video.codecName}`,
      {
        code: 'ffmpeg-decoder-unavailable',
        domain: 'video',
        source: 'ffmpeg-runtime',
        streamIndex: video.index,
        inputValue: video.codecName,
      },
    )
  }
  if (audio && !canCopyAudio && !input.ffmpeg.aacOutput) {
    return planningFailure('ffmpeg-encoder-unavailable', '音频不兼容且 runtime 缺少 AAC encoder', {
      code: 'ffmpeg-encoder-unavailable',
      domain: 'audio',
      source: 'ffmpeg-runtime',
      streamIndex: audio.index,
      inputValue: audio.codecName,
      supportedValue: 'aac',
    })
  }
  if (video.dynamicRange === 'dolby-vision') {
    return planningFailure(
      'video-range-not-supported',
      '当前兼容管线尚不能可靠处理 Dolby Vision 动态范围与元数据',
      {
        code: 'video-range-not-supported',
        domain: 'video',
        source: 'input-facts',
        streamIndex: video.index,
        inputValue: 'dolby-vision',
      },
    )
  }
  const explicitHdr = video.dynamicRange === 'hdr10' || video.dynamicRange === 'hlg'
  if (explicitHdr && !input.ffmpeg.toneMapToSdr) {
    return planningFailure(
      'tone-map-unavailable',
      '视频需要兼容转码，但当前 runtime 缺少 HDR→SDR 能力',
      {
        code: 'ffmpeg-filter-unavailable',
        domain: 'runtime',
        source: 'ffmpeg-runtime',
        supportedValue: 'hdr-to-sdr',
      },
    )
  }
  return {
    ok: true,
    decision: {
      method: 'transcode',
      trial: false,
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: video.index,
        sourceCodec: video.codecName,
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap: explicitHdr ? 'hdr-to-sdr' : 'none',
        decoderMode: input.override?.videoDecoderMode,
        encoderMode: input.override?.videoEncoderMode,
      },
      audio: audio
        ? canCopyAudio
          ? { action: 'copy', streamIndex: audio.index, sourceCodec: audio.codecName }
          : audioTranscodeAction(audio, input.override)
        : undefined,
      subtitle: compatibleSubtitle.action,
      reasons: processingReasons(input, video, audio, 'transcode', compatibleSubtitle),
    },
  }
}
