import type {
  CapabilityFacts,
  InputFacts,
  MediaAudioStream,
  MediaCompatError,
  MediaVideoStream,
  OutputProfile,
  OutputProfileKind,
} from '@marchen/shared/media'

export const DEFAULT_COPY_VIDEO_STARTUP_DEADLINE_MS = 8_000

export interface PlaybackPlannerCapabilities {
  toneMapToSdr: boolean
  /** 迁移期兼容旧开发开关；6.9 会收敛为 forceProfile。 */
  forceVideoTranscode?: boolean
  forceProfile?: Exclude<OutputProfileKind, 'native'>
}

export type PlaybackPlanningResult =
  { ok: true; plan: OutputProfile } | { ok: false; error: MediaCompatError }

const selectedVideo = (probe: InputFacts) =>
  probe.streams.find(
    (stream): stream is MediaVideoStream =>
      stream.type === 'video' && stream.index === probe.primaryVideoStreamIndex,
  )

const selectedAudio = (probe: InputFacts) =>
  probe.streams.find(
    (stream): stream is MediaAudioStream =>
      stream.type === 'audio' && stream.index === probe.primaryAudioStreamIndex,
  )

const audioOutput = (audio: MediaAudioStream | undefined) =>
  audio
    ? {
        codec: 'aac' as const,
        profile: 'aac_low' as const,
        sampleRate: 48_000 as const,
        channels: (audio.channels === 1 ? 1 : 2) as 1 | 2,
      }
    : undefined

const isExplicitHdr = (video: MediaVideoStream) =>
  video.dynamicRange === 'hdr10' || video.dynamicRange === 'hlg'

const compatibleVideoProfile = (
  video: MediaVideoStream,
  audio: MediaAudioStream | undefined,
  reason: OutputProfile['reason'],
  capabilities: PlaybackPlannerCapabilities,
): PlaybackPlanningResult => {
  if (video.dynamicRange === 'dolby-vision') {
    return {
      ok: false,
      error: {
        code: 'unsupported-video',
        stage: 'planning',
        message: '当前兼容档位尚不能可靠处理 Dolby Vision 色彩与动态元数据',
        recoverable: false,
      },
    }
  }
  if (isExplicitHdr(video)) {
    if (!capabilities.toneMapToSdr) {
      return {
        ok: false,
        error: {
          code: 'tone-map-unavailable',
          stage: 'planning',
          message: '当前 FFmpeg 运行时缺少 HDR 转 SDR 所需的 zscale 与 tonemap 能力',
          recoverable: false,
          profile: 'hdr-to-sdr-h264-aac',
        },
      }
    }
    return {
      ok: true,
      plan: {
        kind: 'hdr-to-sdr-h264-aac',
        reason,
        videoStreamIndex: video.index,
        ...(audio ? { audioStreamIndex: audio.index, audio: audioOutput(audio) } : {}),
        video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: true },
      },
    }
  }

  return {
    ok: true,
    plan: {
      kind: 'safe-h264-aac-sdr',
      reason,
      videoStreamIndex: video.index,
      ...(audio ? { audioStreamIndex: audio.index, audio: audioOutput(audio) } : {}),
      video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: false },
    },
  }
}

/**
 * planner 只输出四个完整档位。unknown 仍允许已知输入容器首次 native，
 * 但兼容 fMP4 不允许在 codec 事实不完整时复制视频。
 */
export const createPlaybackPlan = (
  probe: InputFacts,
  capabilities: CapabilityFacts,
  plannerCapabilities: PlaybackPlannerCapabilities = { toneMapToSdr: false },
): PlaybackPlanningResult => {
  const video = selectedVideo(probe)
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
  const audio = selectedAudio(probe)
  const forcedProfile = plannerCapabilities.forceProfile
  if (forcedProfile === 'copy-video-aac') {
    if (
      !video.codecString ||
      capabilities.video?.supported !== true ||
      capabilities.targetContainerSupported !== true
    ) {
      return {
        ok: false,
        error: {
          code: 'unsupported-video',
          stage: 'planning',
          message: '当前视频缺少可复制到目标 fMP4/MSE 的明确 codec 能力事实',
          recoverable: true,
          profile: forcedProfile,
        },
      }
    }
    return {
      ok: true,
      plan: {
        kind: 'copy-video-aac',
        reason: 'audio-incompatible',
        videoStreamIndex: video.index,
        ...(audio ? { audioStreamIndex: audio.index, audio: audioOutput(audio) } : {}),
        video: 'copy',
        startupDeadlineMs: DEFAULT_COPY_VIDEO_STARTUP_DEADLINE_MS,
      },
    }
  }
  if (
    forcedProfile === 'hdr-to-sdr-h264-aac' &&
    !isExplicitHdr(video)
  ) {
    return {
      ok: false,
      error: {
        code: 'unsupported-video',
        stage: 'planning',
        message: '强制 HDR→SDR 档位需要输入具有明确的 HDR10 或 HLG 色彩事实',
        recoverable: false,
        profile: forcedProfile,
      },
    }
  }
  if (
    forcedProfile === 'safe-h264-aac-sdr' ||
    forcedProfile === 'hdr-to-sdr-h264-aac' ||
    plannerCapabilities.forceVideoTranscode
  ) {
    return compatibleVideoProfile(
      {
        ...video,
        dynamicRange: forcedProfile === 'hdr-to-sdr-h264-aac' ? video.dynamicRange : 'unknown',
      },
      audio,
      'video-incompatible',
      plannerCapabilities,
    )
  }

  if (capabilities.video?.supported === false) {
    return compatibleVideoProfile(
      video,
      audio,
      'video-incompatible',
      plannerCapabilities,
    )
  }

  if (capabilities.containerSupported === true && capabilities.audio?.supported !== false) {
    return {
      ok: true,
      plan: {
        kind: 'native',
        reason: 'native-compatible',
        videoStreamIndex: video.index,
        ...(audio ? { audioStreamIndex: audio.index } : {}),
      },
    }
  }

  const canCopyVideo =
    Boolean(video.codecString) &&
    capabilities.video?.supported === true &&
    capabilities.targetContainerSupported === true
  if (canCopyVideo) {
    return {
      ok: true,
      plan: {
        kind: 'copy-video-aac',
        reason:
          capabilities.audio?.supported === false
            ? 'audio-incompatible'
            : 'container-incompatible',
        videoStreamIndex: video.index,
        ...(audio ? { audioStreamIndex: audio.index, audio: audioOutput(audio) } : {}),
        video: 'copy',
        startupDeadlineMs: DEFAULT_COPY_VIDEO_STARTUP_DEADLINE_MS,
      },
    }
  }

  return compatibleVideoProfile(video, audio, 'video-incompatible', plannerCapabilities)
}

/** 原生实际解码失败后只生成一次确定性的 H.264/AAC 兼容档位。 */
export const createNativeDecodeFallbackPlan = (
  probe: InputFacts,
  _capabilities: CapabilityFacts,
  ffmpegCapabilities: PlaybackPlannerCapabilities,
): PlaybackPlanningResult => {
  const video = selectedVideo(probe)
  if (!video) {
    return {
      ok: false,
      error: {
        code: 'probe-failed',
        stage: 'planning',
        message: '媒体缺少可转码的主视频轨道',
        recoverable: false,
      },
    }
  }
  return compatibleVideoProfile(
    video,
    selectedAudio(probe),
    'native-decode-failed',
    ffmpegCapabilities,
  )
}
