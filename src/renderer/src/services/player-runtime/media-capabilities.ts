import type {
  BrowserMediaCapabilities,
  DecodeCapabilityFact,
  MediaAudioStream,
  MediaProbeResult,
  MediaVideoStream,
} from '@marchen/shared/media'

interface MediaCapabilitiesProbeDependencies {
  decodingInfo?: (
    configuration: MediaDecodingConfiguration,
  ) => Promise<MediaCapabilitiesDecodingInfo>
  canPlayType?: (type: string) => CanPlayTypeResult
}

const containerMimeType = (probe: MediaProbeResult) => {
  if (probe.formatNames.some((name) => ['mp4', 'mov', 'm4a', '3gp', '3g2', 'mj2'].includes(name))) {
    return 'video/mp4'
  }
  if (probe.formatNames.some((name) => ['matroska', 'mkv'].includes(name))) {
    const videoCodec = probe.streams.find(
      (stream) => stream.type === 'video' && stream.index === probe.primaryVideoStreamIndex,
    )?.codecName
    return videoCodec && ['av1', 'vp8', 'vp9'].includes(videoCodec)
      ? 'video/webm'
      : 'video/x-matroska'
  }
  if (probe.formatNames.includes('webm')) return 'video/webm'
  return undefined
}

const contentType = (mimeType: string, codecString: string) =>
  `${mimeType}; codecs="${codecString}"`

const canPlayFact = (
  codecString: string,
  type: string,
  canPlayType?: MediaCapabilitiesProbeDependencies['canPlayType'],
): DecodeCapabilityFact => {
  if (!canPlayType) {
    return {
      codecString,
      supported: 'unknown',
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'unknown',
    }
  }
  const result = canPlayType(type)
  return {
    codecString,
    supported: result === 'probably' || result === 'maybe',
    smooth: 'unknown',
    powerEfficient: 'unknown',
    source: 'can-play-type',
  }
}

const unknownCodecFact = (): DecodeCapabilityFact => ({
  supported: 'unknown',
  smooth: 'unknown',
  powerEfficient: 'unknown',
  source: 'unknown',
})

const queryFact = async (
  codecString: string,
  contentTypeValue: string,
  configuration: Omit<MediaDecodingConfiguration, 'type'>,
  dependencies: MediaCapabilitiesProbeDependencies,
): Promise<DecodeCapabilityFact> => {
  if (dependencies.decodingInfo) {
    try {
      const result = await dependencies.decodingInfo({ type: 'file', ...configuration })
      return {
        codecString,
        supported: result.supported,
        smooth: result.smooth,
        powerEfficient: result.powerEfficient,
        source: 'media-capabilities',
      }
    } catch {}
  }
  return canPlayFact(codecString, contentTypeValue, dependencies.canPlayType)
}

const primaryVideo = (probe: MediaProbeResult) =>
  probe.streams.find(
    (stream): stream is MediaVideoStream =>
      stream.type === 'video' && stream.index === probe.primaryVideoStreamIndex,
  )

const primaryAudio = (probe: MediaProbeResult) =>
  probe.streams.find(
    (stream): stream is MediaAudioStream =>
      stream.type === 'audio' && stream.index === probe.primaryAudioStreamIndex,
  )

export const queryBrowserMediaCapabilities = async (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies = {},
): Promise<BrowserMediaCapabilities> => {
  const mimeType = containerMimeType(probe)
  const video = primaryVideo(probe)
  const audio = primaryAudio(probe)
  const decodingInfo =
    dependencies.decodingInfo ??
    (typeof navigator === 'undefined'
      ? undefined
      : navigator.mediaCapabilities?.decodingInfo?.bind(navigator.mediaCapabilities))
  const videoElement =
    dependencies.canPlayType || typeof document === 'undefined'
      ? undefined
      : document.createElement('video')
  const canPlayType = dependencies.canPlayType ?? videoElement?.canPlayType.bind(videoElement)
  const resolvedDependencies = { decodingInfo, canPlayType }
  if (!mimeType) {
    return {
      containerSupported: 'unknown',
      targetContainer: 'video/mp4',
      targetContainerSupported: 'unknown',
      ...(video ? { video: unknownCodecFact() } : {}),
      ...(audio ? { audio: unknownCodecFact() } : {}),
    }
  }

  const codecStrings = [video?.codecString, audio?.codecString].filter((value): value is string =>
    Boolean(value),
  )
  const combinedType =
    codecStrings.length > 0 ? contentType(mimeType, codecStrings.join(',')) : mimeType
  const containerResult = canPlayType?.(combinedType)
  const hasCompleteSourceCodecFacts = (!video || video.codecString) && (!audio || audio.codecString)
  const targetCodecType =
    codecStrings.length > 0 ? contentType('video/mp4', codecStrings.join(',')) : 'video/mp4'
  const targetContainerResult = hasCompleteSourceCodecFacts
    ? canPlayType?.(targetCodecType)
    : undefined
  const result: BrowserMediaCapabilities = {
    containerSupported:
      containerResult === undefined || !hasCompleteSourceCodecFacts
        ? 'unknown'
        : containerResult === 'probably' || containerResult === 'maybe',
    targetContainer: 'video/mp4',
    targetContainerSupported:
      targetContainerResult === undefined
        ? 'unknown'
        : targetContainerResult === 'probably' || targetContainerResult === 'maybe',
  }

  // 容器能力与轨道解码能力必须分开判断。兼容输出固定使用 fMP4，
  // 因此轨道能力始终针对 video/mp4/audio/mp4，而不是输入 MKV/WebM 容器。
  const elementaryMimeType = 'video/mp4'

  if (video?.codecString) {
    const type = contentType(elementaryMimeType, video.codecString)
    result.video = await queryFact(
      video.codecString,
      type,
      {
        video: {
          contentType: type,
          width: video.width,
          height: video.height,
          bitrate: Math.max(1, probe.bitRate ?? 5_000_000),
          framerate: video.averageFrameRate ?? video.frameRate ?? 30,
        },
      },
      resolvedDependencies,
    )
  } else if (video) {
    result.video = unknownCodecFact()
  }
  if (audio?.codecString) {
    const audioMimeType = elementaryMimeType.replace(/^video\//, 'audio/')
    const type = contentType(audioMimeType, audio.codecString)
    result.audio = await queryFact(
      audio.codecString,
      type,
      {
        audio: {
          contentType: type,
          channels: String(audio.channels ?? 2),
          bitrate: Math.max(1, audio.bitRate ?? 192_000),
          samplerate: audio.sampleRate ?? 48_000,
        },
      },
      resolvedDependencies,
    )
  } else if (audio) {
    result.audio = unknownCodecFact()
  }
  return result
}
