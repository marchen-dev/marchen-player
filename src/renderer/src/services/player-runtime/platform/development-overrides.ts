import type { OutputProfileKind } from '@marchen/shared/media'

export interface PlaybackDevelopmentEnvironment {
  DEV: boolean
  VITE_FORCE_TRANSCODE_PROFILE?: string
  VITE_FORCE_VIDEO_TRANSCODE?: string
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
