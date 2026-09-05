import type { DevelopmentPlaybackOverride, OutputProfileKind } from '@marchen/shared/media'

export interface PlaybackDevelopmentEnvironment {
  DEV: boolean
  VITE_FORCE_TRANSCODE_PROFILE?: string
  VITE_FORCE_VIDEO_TRANSCODE?: string
  VITE_MEDIA_FORCE_METHOD?: string
  VITE_MEDIA_FORCE_VIDEO_DECODER?: string
  VITE_MEDIA_FORCE_VIDEO_ENCODER?: string
  VITE_MEDIA_FORCE_AUDIO_ENCODER?: string
}

const profileByEnvironmentValue = {
  audio: 'copy-video-aac',
  safe: 'safe-h264-aac-sdr',
  'hdr-sdr': 'hdr-to-sdr-h264-aac',
} as const satisfies Record<string, Exclude<OutputProfileKind, 'native'>>

/** 开发验收开关必须同时满足 DEV，避免构建环境变量改变生产播放策略。 */
export const resolveForcedOutputProfile = (
  environment: PlaybackDevelopmentEnvironment,
): Exclude<OutputProfileKind, 'native'> | undefined => {
  if (!environment.DEV) return undefined
  const selected = environment.VITE_FORCE_TRANSCODE_PROFILE
  if (selected && selected in profileByEnvironmentValue) {
    return profileByEnvironmentValue[selected as keyof typeof profileByEnvironmentValue]
  }
  // 迁移期兼容旧开关；它必须选择确定的全视频安全档位，不能继续复制未知音频。
  return environment.VITE_FORCE_VIDEO_TRANSCODE === '1' ? 'safe-h264-aac-sdr' : undefined
}

/** @deprecated 使用 resolveForcedOutputProfile。 */
export const shouldForceVideoTranscode = (environment: PlaybackDevelopmentEnvironment) =>
  resolveForcedOutputProfile(environment) === 'safe-h264-aac-sdr'

const oneOf = <T extends string>(
  value: string | undefined,
  choices: readonly T[],
): T | undefined => (choices.includes(value as T) ? (value as T) : undefined)

/** 新通用 planner 的正交开发 override；生产构建与 Web 目标必须丢弃。 */
export const resolveDevelopmentPlaybackOverride = (
  environment: PlaybackDevelopmentEnvironment,
  target: 'electron' | 'web',
): DevelopmentPlaybackOverride | undefined => {
  if (!environment.DEV || target !== 'electron') return undefined
  const legacyProfile = resolveForcedOutputProfile(environment)
  const override: DevelopmentPlaybackOverride = {
    source: 'development-environment',
    method:
      oneOf(environment.VITE_MEDIA_FORCE_METHOD, ['direct-stream', 'transcode'] as const) ??
      (legacyProfile === 'copy-video-aac'
        ? 'direct-stream'
        : legacyProfile
          ? 'transcode'
          : undefined),
    videoDecoderMode: oneOf(environment.VITE_MEDIA_FORCE_VIDEO_DECODER, [
      'auto',
      'hardware',
      'software',
    ] as const),
    videoEncoderMode: oneOf(environment.VITE_MEDIA_FORCE_VIDEO_ENCODER, [
      'auto',
      'hardware',
      'software',
    ] as const),
    audioEncoderMode: oneOf(environment.VITE_MEDIA_FORCE_AUDIO_ENCODER, [
      'auto',
      'system',
      'software',
    ] as const),
  }
  return override.method ||
    override.videoDecoderMode ||
    override.videoEncoderMode ||
    override.audioEncoderMode
    ? override
    : undefined
}
