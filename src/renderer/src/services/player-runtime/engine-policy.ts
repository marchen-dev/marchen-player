import type { PlaybackError } from '@marchen/playback-core'
import type { PlaybackResource } from './platform/media-resource'

export type PlayerEngine = 'native' | 'canvas'
export type EnginePreference = 'auto' | PlayerEngine

/** HTML 播放能力与 WebCodecs 解码能力分开；未知信息允许原生实际尝试。 */
export async function choosePlaybackEngine(
  preference: EnginePreference,
  resource: PlaybackResource,
  canPlayType: (mime: string) => CanPlayTypeResult,
  selectedAudioTrackId?: number,
  canvasSupported = true,
): Promise<PlayerEngine> {
  if (!canvasSupported) return 'native'
  if (preference !== 'auto') return preference
  try {
    const [{ tracks }, format, video, audio] = await Promise.all([
      resource.metadata.describe(),
      resource.input.getFormat(),
      resource.input.getPrimaryVideoTrack(),
      resource.input.getPrimaryAudioTrack(),
    ])
    // HTMLVideoElement 无法可靠指定备用音轨，恢复该偏好需要 Canvas。
    if (selectedAudioTrackId !== undefined && selectedAudioTrackId !== audio?.id) return 'canvas'
    const selected = [video, audio]
      .filter((track) => track !== null)
      .map((track) => tracks.find((info) => info.id === track.id))
    // 仅有容器 MIME 而缺失轨道编码时，不能据此声称已知不支持。
    if (!selected.length || selected.some((track) => !track?.config?.codec)) return 'native'
    const mime = `${format.mimeType}; codecs="${selected.map((track) => track!.config!.codec).join(',')}"`
    return canPlayType(mime) ? 'native' : 'canvas'
  } catch {
    return 'native'
  }
}

export function canFallbackToCanvas(
  preference: EnginePreference,
  engine: PlayerEngine,
  attempted: boolean,
  error: Pick<PlaybackError, 'code'>,
  canvasSupported = true,
) {
  return (
    canvasSupported &&
    preference === 'auto' &&
    engine === 'native' &&
    !attempted &&
    (error.code === 'decode' || error.code === 'not-supported')
  )
}

/** 无兼容内核可回退时，在赋值媒体 src 前检查容器及视频轨，避免只播放音频。 */
export async function assertNativeVideoSupport(
  resource: PlaybackResource,
  canPlayType: (mime: string) => CanPlayTypeResult,
): Promise<void> {
  const [format, track] = await Promise.all([
    resource.input.getFormat(),
    resource.input.getPrimaryVideoTrack(),
  ])
  const config = await track?.getDecoderConfig()
  if (!config?.codec || !canPlayType(`${format.mimeType}; codecs="${config.codec}"`))
    throw new Error('当前浏览器不支持此文件的容器或视频编码，无法显示视频画面。')
}
