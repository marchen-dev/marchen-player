import type { Input, InputTrack } from 'mediabunny'

export type DecodeSupport = 'unknown' | 'supported' | 'unsupported'
export interface MediaTrackInfo {
  id: number
  number: number
  type: 'video' | 'audio'
  codec: string | null
  name: string | null
  language: string
  default: boolean
  config: VideoDecoderConfig | AudioDecoderConfig | null
}

/** 便宜的轨道描述与昂贵的解码探测分开；不为打开菜单初始化解码器。 */
export class MediaMetadata {
  private frameRateProbe?: Promise<number | undefined>
  private frameRate?: number
  private description?: Promise<{ tracks: MediaTrackInfo[]; duration: number | null }>
  private readonly probes = new Map<number, Promise<DecodeSupport>>()
  constructor(private readonly input: Input) {}

  get videoFrameRate() {
    return this.frameRate
  }

  /** 仅采样包时间戳；独立于首帧加载，失败也不影响播放与轨道描述。 */
  readVideoFrameRate(): Promise<number | undefined> {
    this.frameRateProbe ??= (async () => {
      const track = await this.input.getPrimaryVideoTrack()
      if (!track) return undefined
      const metrics = await track.computeFrameRateMetrics({ targetPacketCount: 256 })
      const value = metrics.averageFrameRate
      if (metrics.probedPacketCount < 2 || !Number.isFinite(value) || value <= 0) return undefined
      this.frameRate = value
      return value
    })().catch(() => undefined)
    return this.frameRateProbe
  }

  describe() {
    this.description ??= this.readDescription().catch((error) => {
      this.description = undefined
      throw error
    })
    return this.description
  }

  async track(id: number): Promise<InputTrack> {
    const track = (await this.input.getTracks()).find((track) => track.id === id)
    if (!track) throw new Error('媒体轨道已变化或不存在')
    return track
  }

  probeNative(id: number): Promise<DecodeSupport> {
    let promise = this.probes.get(id)
    if (!promise) {
      promise = this.inspectNative(id).catch(() => 'unknown' as const)
      this.probes.set(id, promise)
    }
    return promise
  }

  private async inspectNative(id: number): Promise<DecodeSupport> {
    const track = await this.track(id)
    if (track.isVideoTrack()) {
      const config = await track.getDecoderConfig()
      if (!config) return 'unsupported'
      if (typeof VideoDecoder === 'undefined') return 'unknown'
      return (await VideoDecoder.isConfigSupported(config)).supported ? 'supported' : 'unsupported'
    }
    if (track.isAudioTrack()) {
      const config = await track.getDecoderConfig()
      if (!config) return 'unsupported'
      if (typeof AudioDecoder === 'undefined') return 'unknown'
      return (await AudioDecoder.isConfigSupported(config)).supported ? 'supported' : 'unsupported'
    }
    return 'unsupported'
  }

  private async readDescription() {
    const tracks: MediaTrackInfo[] = []
    for (const track of await this.input.getTracks()) {
      if (!track.isVideoTrack() && !track.isAudioTrack()) continue
      const [codec, name, language, disposition, config] = await Promise.all([
        track.getCodec(),
        track.getName(),
        track.getLanguageCode(),
        track.getDisposition(),
        track.getDecoderConfig(),
      ])
      tracks.push({
        id: track.id,
        number: track.number,
        type: track.isVideoTrack() ? 'video' : 'audio',
        codec,
        name,
        language,
        default: disposition.default,
        config,
      })
    }
    // null 表示未知；精确全片扫描由需要它的消费者显式发起。
    return { tracks, duration: await this.input.getDurationFromMetadata() }
  }
}
