import type {
  ClientPlaybackProfile,
  ContainerCapabilityProfile,
  MediaAudioStream,
  MediaProbeResult,
  MediaVideoStream,
  VideoAudioCapabilityProfile,
  VideoCapabilityProfile,
  WebClientPlaybackProfile,
} from '@marchen/shared/media'
import type { MediaCapabilitiesProbeDependencies } from './media-capabilities'
import { CLIENT_PLAYBACK_PROFILE_SCHEMA_VERSION } from '@marchen/shared/media'
import {
  probeContainerCapabilityEvidence,
  probeFmp4HlsCapabilityEvidence,
  primaryAudio,
  primaryVideo,
  probeVideoAudioCapability,
  probeVideoCapability,
  resolveContainerMimeType,
  resolveMediaCapabilitiesProbeDependencies,
} from './media-capabilities'

export interface TargetCodecOverrides {
  videoCodecString?: string
  audioCodecString?: string
}

export type ClientPlaybackRuntimeIdentity =
  | {
      environment: 'electron'
      platform: string
      electronVersion: string
      chromiumVersion: string
    }
  | { environment: 'web'; platform: string; chromiumVersion: string }

export const createClientPlaybackRuntimeKey = (identity: ClientPlaybackRuntimeIdentity): string =>
  identity.environment === 'electron'
    ? `electron:${identity.electronVersion}:chromium:${identity.chromiumVersion}:${identity.platform}`
    : `web:chromium:${identity.chromiumVersion}:${identity.platform}`

const withVideoCodecString = (
  video: MediaVideoStream,
  overrides: TargetCodecOverrides,
): MediaVideoStream =>
  overrides.videoCodecString ? { ...video, codecString: overrides.videoCodecString } : video

const withAudioCodecString = (
  audio: MediaAudioStream,
  overrides: TargetCodecOverrides,
): MediaAudioStream =>
  overrides.audioCodecString ? { ...audio, codecString: overrides.audioCodecString } : audio

const withTargetCodecOverrides = (
  probe: MediaProbeResult,
  overrides: TargetCodecOverrides,
): MediaProbeResult => ({
  ...probe,
  streams: probe.streams.map((stream) => {
    if (stream.type === 'video' && stream.index === probe.primaryVideoStreamIndex) {
      return withVideoCodecString(stream, overrides)
    }
    if (stream.type === 'audio' && stream.index === probe.primaryAudioStreamIndex) {
      return withAudioCodecString(stream, overrides)
    }
    return stream
  }),
})

export const queryMediaTrackCapabilityProfiles = async (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies,
  overrides: TargetCodecOverrides = {},
  transport: MediaDecodingType = 'file',
): Promise<{ video?: VideoCapabilityProfile; audio?: VideoAudioCapabilityProfile }> => {
  const inputVideo = primaryVideo(probe)
  const inputAudio = primaryAudio(probe)
  const video = inputVideo ? withVideoCodecString(inputVideo, overrides) : undefined
  const audio = inputAudio ? withAudioCodecString(inputAudio, overrides) : undefined
  const [videoDecode, audioDecode] = await Promise.all([
    video ? probeVideoCapability(probe, video, dependencies, transport) : undefined,
    audio ? probeVideoAudioCapability(audio, dependencies, transport) : undefined,
  ])

  return {
    video:
      video && videoDecode
        ? {
            conditions: {
              codecName: video.codecName,
              codecString: video.codecString,
              profile: video.profile,
              level: video.level,
              bitDepth: video.bitDepth,
              dynamicRange: video.dynamicRange,
              width: video.width,
              height: video.height,
              frameRate: video.averageFrameRate ?? video.frameRate,
            },
            decode: videoDecode,
          }
        : undefined,
    audio:
      audio && audioDecode
        ? {
            conditions: {
              codecName: audio.codecName,
              codecString: audio.codecString,
              profile: audio.profile,
              channels: audio.channels,
              sampleRate: audio.sampleRate,
              bitDepth: audio.bitDepth,
            },
            decode: audioDecode,
          }
        : undefined,
  }
}

const containerProfile = (
  probe: MediaProbeResult,
  mimeType: string | undefined,
  evidence: ReturnType<typeof probeContainerCapabilityEvidence>,
): ContainerCapabilityProfile => ({
  containerNames: [...probe.formatNames],
  mimeType,
  ...evidence,
})

const subtitleProfiles = (probe: MediaProbeResult) =>
  probe.streams
    .filter((stream) => stream.type === 'subtitle')
    .map((stream) => {
      const codec = stream.codecName.toLowerCase()
      const supported = ['ass', 'ssa', 'subrip', 'srt', 'webvtt', 'mov_text'].includes(codec)
      return {
        codecName: stream.codecName,
        delivery: supported ? ('external-render' as const) : ('drop' as const),
        supported,
        smooth: 'unknown' as const,
        powerEfficient: 'unknown' as const,
        source: 'platform-rule' as const,
      }
    })

export interface BuildClientPlaybackProfileOptions {
  runtime: ClientPlaybackRuntimeIdentity
  localCompatibilityAvailable: boolean
  dependencies?: MediaCapabilitiesProbeDependencies
  overrides?: TargetCodecOverrides
}

export interface BuildWebClientPlaybackProfileOptions {
  platform: string
  chromiumVersion: string
  dependencies?: MediaCapabilitiesProbeDependencies
  overrides?: TargetCodecOverrides
}

export const buildClientPlaybackProfile = async (
  probe: MediaProbeResult,
  options: BuildClientPlaybackProfileOptions,
): Promise<ClientPlaybackProfile> => {
  const dependencies = resolveMediaCapabilitiesProbeDependencies(options.dependencies)
  const capabilityProbe = withTargetCodecOverrides(probe, options.overrides ?? {})
  const [tracks, mseTracks] = await Promise.all([
    queryMediaTrackCapabilityProfiles(probe, dependencies),
    queryMediaTrackCapabilityProfiles(capabilityProbe, dependencies, {}, 'media-source'),
  ])
  const directEvidence = probeContainerCapabilityEvidence(probe, dependencies)
  const fmp4Evidence = probeFmp4HlsCapabilityEvidence(capabilityProbe, dependencies)
  const subtitles = subtitleProfiles(probe)
  const base = {
    schemaVersion: CLIENT_PLAYBACK_PROFILE_SCHEMA_VERSION,
    runtimeKey: createClientPlaybackRuntimeKey(options.runtime),
    direct: {
      kind: 'direct' as const,
      container: containerProfile(probe, resolveContainerMimeType(probe), directEvidence),
      video: tracks.video,
      audio: tracks.audio,
      subtitles: subtitles.map((subtitle) => ({ ...subtitle })),
    },
    fmp4Hls: {
      kind: 'fmp4-hls' as const,
      container: {
        containerNames: ['mp4'],
        mimeType: 'video/mp4' as const,
        ...fmp4Evidence,
      },
      mediaSourceSupported: fmp4Evidence.supported,
      video: mseTracks.video,
      audio: mseTracks.audio,
      subtitles: subtitles.map((subtitle) => ({ ...subtitle })),
    },
  }
  return options.runtime.environment === 'electron'
    ? {
        ...base,
        environment: 'electron',
        localCompatibilityAvailable: options.localCompatibilityAvailable,
      }
    : { ...base, environment: 'web', localCompatibilityAvailable: false }
}

/** Web 专用入口不接受 localCompatibilityAvailable，类型和实现都无法声明本地后端。 */
export const buildWebClientPlaybackProfile = async (
  probe: MediaProbeResult,
  options: BuildWebClientPlaybackProfileOptions,
): Promise<WebClientPlaybackProfile> => {
  const profile = await buildClientPlaybackProfile(probe, {
    runtime: {
      environment: 'web',
      platform: options.platform,
      chromiumVersion: options.chromiumVersion,
    },
    localCompatibilityAvailable: false,
    dependencies: options.dependencies,
    overrides: options.overrides,
  })
  if (profile.environment !== 'web') throw new Error('Web Profile 环境判别无效')
  return profile
}

const mediaCapabilityCacheKey = (
  probe: MediaProbeResult,
  options: BuildClientPlaybackProfileOptions,
): string => {
  const video = primaryVideo(probe)
  const audio = primaryAudio(probe)
  return JSON.stringify({
    runtime: createClientPlaybackRuntimeKey(options.runtime),
    local: options.runtime.environment === 'electron' && options.localCompatibilityAvailable,
    formats: [...probe.formatNames].sort(),
    bitRate: probe.bitRate,
    video: video
      ? {
          codec: video.codecName,
          codecString: options.overrides?.videoCodecString ?? video.codecString,
          profile: video.profile,
          level: video.level,
          bitDepth: video.bitDepth,
          dynamicRange: video.dynamicRange,
          width: video.width,
          height: video.height,
          frameRate: video.averageFrameRate ?? video.frameRate,
        }
      : undefined,
    audio: audio
      ? {
          codec: audio.codecName,
          codecString: options.overrides?.audioCodecString ?? audio.codecString,
          profile: audio.profile,
          bitDepth: audio.bitDepth,
          channels: audio.channels,
          sampleRate: audio.sampleRate,
          bitRate: audio.bitRate,
        }
      : undefined,
  })
}

/** 只在当前 Renderer 进程内缓存，不持久化设备能力或媒体路径。 */
export class ClientPlaybackProfileCache {
  readonly #profiles = new Map<string, Promise<ClientPlaybackProfile>>()

  getOrCreate(
    probe: MediaProbeResult,
    options: BuildClientPlaybackProfileOptions,
  ): Promise<ClientPlaybackProfile> {
    const key = mediaCapabilityCacheKey(probe, options)
    const cached = this.#profiles.get(key)
    if (cached) return cached
    const pending = buildClientPlaybackProfile(probe, options).catch((error) => {
      if (this.#profiles.get(key) === pending) this.#profiles.delete(key)
      throw error
    })
    this.#profiles.set(key, pending)
    return pending
  }

  clear(): void {
    this.#profiles.clear()
  }
}
