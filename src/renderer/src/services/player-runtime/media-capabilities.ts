import type {
  BrowserMediaCapabilities,
  CapabilityEvidence,
  CapabilityVerdict,
  DecodeCapabilityFact,
  MediaAudioStream,
  MediaProbeResult,
  MediaVideoStream,
} from '@marchen/shared/media'

export interface MediaCapabilitiesProbeDependencies {
  decodingInfo?: (
    configuration: MediaDecodingConfiguration,
  ) => Promise<MediaCapabilitiesDecodingInfo>
  canPlayType?: (type: string) => CanPlayTypeResult
  mediaSourceIsTypeSupported?: (type: string) => boolean
}

export const resolveContainerMimeType = (probe: MediaProbeResult) => {
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

export const mediaContentType = (mimeType: string, codecString: string) =>
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

export const unknownCodecFact = (): DecodeCapabilityFact => ({
  supported: 'unknown',
  smooth: 'unknown',
  powerEfficient: 'unknown',
  source: 'unknown',
})

export const unknownCapabilityEvidence = (): CapabilityEvidence => ({
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
  transport: MediaDecodingType = 'file',
): Promise<DecodeCapabilityFact> => {
  if (transport === 'media-source') {
    // 文件解码能力不证明可 append；MSE 明确拒绝时优先保留该结果。
    try {
      if (dependencies.mediaSourceIsTypeSupported?.(contentTypeValue) === false) {
        return { ...unknownCodecFact(), codecString, supported: false, source: 'media-source' }
      }
    } catch {}
  }
  if (dependencies.decodingInfo) {
    try {
      const result = await dependencies.decodingInfo({ type: transport, ...configuration })
      return {
        codecString,
        supported: result.supported,
        smooth: result.smooth,
        powerEfficient: result.powerEfficient,
        source: 'media-capabilities',
      }
    } catch {}
  }
  if (transport === 'media-source') {
    try {
      const supported = dependencies.mediaSourceIsTypeSupported?.(contentTypeValue)
      if (supported !== undefined) {
        return { ...unknownCodecFact(), codecString, supported, source: 'media-source' }
      }
    } catch {}
    return { ...unknownCodecFact(), codecString }
  }
  return canPlayFact(codecString, contentTypeValue, dependencies.canPlayType)
}

export const primaryVideo = (probe: MediaProbeResult) =>
  probe.streams.find(
    (stream): stream is MediaVideoStream =>
      stream.type === 'video' && stream.index === probe.primaryVideoStreamIndex,
  )

export const primaryAudio = (probe: MediaProbeResult) =>
  probe.streams.find(
    (stream): stream is MediaAudioStream =>
      stream.type === 'audio' && stream.index === probe.primaryAudioStreamIndex,
  )

const verdictForCanPlayType = (result: CanPlayTypeResult | undefined): CapabilityVerdict =>
  result === undefined ? 'unknown' : result === 'probably' || result === 'maybe'

export const resolveMediaCapabilitiesProbeDependencies = (
  dependencies: MediaCapabilitiesProbeDependencies = {},
): MediaCapabilitiesProbeDependencies => {
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
  const mediaSourceIsTypeSupported =
    dependencies.mediaSourceIsTypeSupported ??
    (typeof MediaSource === 'undefined' ? undefined : MediaSource.isTypeSupported.bind(MediaSource))
  return { decodingInfo, canPlayType, mediaSourceIsTypeSupported }
}

const combinedCodecType = (
  probe: MediaProbeResult,
  mimeType: string,
): { complete: boolean; type: string } => {
  const video = primaryVideo(probe)
  const audio = primaryAudio(probe)
  const codecStrings = [video?.codecString, audio?.codecString].filter((value): value is string =>
    Boolean(value),
  )
  const hasCompleteSourceCodecFacts = (!video || video.codecString) && (!audio || audio.codecString)
  return {
    complete: Boolean(hasCompleteSourceCodecFacts),
    type: codecStrings.length > 0 ? mediaContentType(mimeType, codecStrings.join(',')) : mimeType,
  }
}

export const probeContainerCapability = (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies,
): CapabilityVerdict => probeContainerCapabilityEvidence(probe, dependencies).supported

export const probeContainerCapabilityEvidence = (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies,
): CapabilityEvidence => {
  const mimeType = resolveContainerMimeType(probe)
  if (!mimeType) return unknownCapabilityEvidence()
  const combined = combinedCodecType(probe, mimeType)
  if (!combined.complete) return unknownCapabilityEvidence()
  const result = dependencies.canPlayType?.(combined.type)
  return result === undefined
    ? unknownCapabilityEvidence()
    : {
        supported: verdictForCanPlayType(result),
        smooth: 'unknown',
        powerEfficient: 'unknown',
        source: 'can-play-type',
      }
}

export const probeFmp4HlsCapability = (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies,
): CapabilityVerdict => probeFmp4HlsCapabilityEvidence(probe, dependencies).supported

export const probeFmp4HlsCapabilityEvidence = (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies,
): CapabilityEvidence => {
  const videoCodecString = primaryVideo(probe)?.codecString
  if (!videoCodecString) return unknownCapabilityEvidence()
  // fMP4/MSE 容器门禁只验证候选复制的视频轨。音频能力在独立轨道
  // probe 中决定 copy/transcode；若把 EAC-3 拼进组合 MIME，会把“HEVC copy + AAC”
  // 误判为整个 fMP4 不支持，导致不必要的全视频转码。
  const videoType = mediaContentType('video/mp4', videoCodecString)
  const mse = dependencies.mediaSourceIsTypeSupported?.(videoType)
  if (mse !== undefined) {
    return {
      supported: mse,
      smooth: 'unknown',
      powerEfficient: 'unknown',
      source: 'media-source',
    }
  }
  return unknownCapabilityEvidence()
}

/** Producer 的实际目标事实用于最终组合门禁，不能拿输入 EAC-3 代替输出 AAC。 */
export const probeFmp4OutputCapability = (
  output: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies,
): CapabilityEvidence => {
  const combined = combinedCodecType(output, 'video/mp4')
  if (!combined.complete) return unknownCapabilityEvidence()
  try {
    const supported = dependencies.mediaSourceIsTypeSupported?.(combined.type)
    return supported === undefined
      ? unknownCapabilityEvidence()
      : { ...unknownCapabilityEvidence(), supported, source: 'media-source' }
  } catch {
    return unknownCapabilityEvidence()
  }
}

export const probeVideoCapability = async (
  probe: MediaProbeResult,
  video: MediaVideoStream,
  dependencies: MediaCapabilitiesProbeDependencies,
  transport: MediaDecodingType = 'file',
): Promise<DecodeCapabilityFact> => {
  if (!video.codecString) return unknownCodecFact()
  const type = mediaContentType('video/mp4', video.codecString)
  return queryFact(
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
    dependencies,
    transport,
  )
}

export const probeVideoAudioCapability = async (
  audio: MediaAudioStream,
  dependencies: MediaCapabilitiesProbeDependencies,
  transport: MediaDecodingType = 'file',
): Promise<DecodeCapabilityFact> => {
  if (!audio.codecString) return unknownCodecFact()
  const type = mediaContentType('audio/mp4', audio.codecString)
  return queryFact(
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
    dependencies,
    transport,
  )
}

export const queryBrowserMediaCapabilities = async (
  probe: MediaProbeResult,
  dependencies: MediaCapabilitiesProbeDependencies = {},
): Promise<BrowserMediaCapabilities> => {
  const video = primaryVideo(probe)
  const audio = primaryAudio(probe)
  const resolvedDependencies = resolveMediaCapabilitiesProbeDependencies(dependencies)
  const result: BrowserMediaCapabilities = {
    containerSupported: probeContainerCapability(probe, resolvedDependencies),
    targetContainer: 'video/mp4',
    targetContainerSupported: probeFmp4HlsCapability(probe, resolvedDependencies),
  }

  if (video) result.video = await probeVideoCapability(probe, video, resolvedDependencies)
  if (audio) result.audio = await probeVideoAudioCapability(audio, resolvedDependencies)
  return result
}
