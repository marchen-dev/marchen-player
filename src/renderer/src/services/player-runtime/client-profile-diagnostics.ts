import type {
  ClientPlaybackProfile,
  ContainerCapabilityProfile,
  SubtitleCapabilityProfile,
  VideoAudioCapabilityProfile,
  VideoCapabilityProfile,
} from '@marchen/shared/media'

const safeText = (value: string | undefined): string | undefined =>
  value
    ?.replace(/(\/v\d+\/media\/)[^/\s"']+/gi, '$1<token>')
    .replace(/\b[A-Za-z]:\\(?:[^\s"']+\\)*[^\s"']+/g, '<local-path>')
    .replace(/\/(?:Users|Volumes|private|var|tmp)\/(?:[^\s"']+\/?)+/g, '<local-path>')

const copyContainer = (container: ContainerCapabilityProfile): ContainerCapabilityProfile => ({
  containerNames: container.containerNames.map((name) => safeText(name) ?? 'unknown'),
  mimeType: safeText(container.mimeType),
  contentType: safeText(container.contentType),
  supported: container.supported,
  smooth: container.smooth,
  powerEfficient: container.powerEfficient,
  source: container.source,
})

const copyVideo = (
  video: VideoCapabilityProfile | undefined,
): VideoCapabilityProfile | undefined =>
  video
    ? {
        conditions: {
          codecName: safeText(video.conditions.codecName) ?? 'unknown',
          codecString: safeText(video.conditions.codecString),
          profile: safeText(video.conditions.profile),
          level: video.conditions.level,
          bitDepth: video.conditions.bitDepth,
          dynamicRange: video.conditions.dynamicRange,
          width: video.conditions.width,
          height: video.conditions.height,
          frameRate: video.conditions.frameRate,
        },
        decode: {
          codecString: safeText(video.decode.codecString),
          supported: video.decode.supported,
          smooth: video.decode.smooth,
          powerEfficient: video.decode.powerEfficient,
          source: video.decode.source,
        },
      }
    : undefined

const copyAudio = (
  audio: VideoAudioCapabilityProfile | undefined,
): VideoAudioCapabilityProfile | undefined =>
  audio
    ? {
        conditions: {
          codecName: safeText(audio.conditions.codecName) ?? 'unknown',
          codecString: safeText(audio.conditions.codecString),
          profile: safeText(audio.conditions.profile),
          channels: audio.conditions.channels,
          sampleRate: audio.conditions.sampleRate,
          bitDepth: audio.conditions.bitDepth,
        },
        decode: {
          codecString: safeText(audio.decode.codecString),
          supported: audio.decode.supported,
          smooth: audio.decode.smooth,
          powerEfficient: audio.decode.powerEfficient,
          source: audio.decode.source,
        },
      }
    : undefined

const copySubtitles = (subtitles: SubtitleCapabilityProfile[]): SubtitleCapabilityProfile[] =>
  subtitles.map((subtitle) => ({
    codecName: safeText(subtitle.codecName) ?? 'unknown',
    delivery: subtitle.delivery,
    supported: subtitle.supported,
    smooth: subtitle.smooth,
    powerEfficient: subtitle.powerEfficient,
    source: subtitle.source,
  }))

/** 诊断 UI 只接收白名单副本，运行时额外挂载的 path/token/key 不会被展开。 */
export const toClientPlaybackProfileDiagnostic = (
  profile: ClientPlaybackProfile,
): ClientPlaybackProfile => {
  const base = {
    schemaVersion: profile.schemaVersion,
    runtimeKey: safeText(profile.runtimeKey) ?? 'unknown-runtime',
    direct: {
      kind: 'direct' as const,
      container: copyContainer(profile.direct.container),
      video: copyVideo(profile.direct.video),
      audio: copyAudio(profile.direct.audio),
      subtitles: copySubtitles(profile.direct.subtitles),
    },
    fmp4Hls: {
      kind: 'fmp4-hls' as const,
      container: {
        ...copyContainer(profile.fmp4Hls.container),
        mimeType: 'video/mp4' as const,
      },
      mediaSourceSupported: profile.fmp4Hls.mediaSourceSupported,
      video: copyVideo(profile.fmp4Hls.video),
      audio: copyAudio(profile.fmp4Hls.audio),
      subtitles: copySubtitles(profile.fmp4Hls.subtitles),
    },
  }
  return profile.environment === 'electron'
    ? {
        ...base,
        environment: 'electron',
        localCompatibilityAvailable: profile.localCompatibilityAvailable,
      }
    : { ...base, environment: 'web', localCompatibilityAvailable: false }
}
